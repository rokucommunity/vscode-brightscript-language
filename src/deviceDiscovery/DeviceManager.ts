import { EventEmitter } from 'eventemitter3';
import * as vscode from 'vscode';
import { firstBy } from 'thenby';
import type { Disposable } from 'vscode';
import { rokuDeploy, DeviceUnreachableError, type DeviceInfoRaw } from 'roku-deploy';
import { util as rokuDebugUtil } from 'roku-debug/dist/util';
import type { GlobalStateManager } from '../GlobalStateManager';
import { RokuFinder } from './RokuFinder';
import { Orders } from './Orders';
import type { Order, BroadcastReason, ReconcileReason } from './Orders';
import { NetworkChangeMonitor, getNetworkHash } from './NetworkChangeMonitor';
import { SystemSleepMonitor } from './SystemSleepMonitor';
import { util } from '../util';
import { vscodeContextManager } from '../managers/VscodeContextManager';
import { debounce } from 'lodash';
import { icons } from '../icons';

export class DeviceManager {
    // #region constructor
    constructor(
        private context: vscode.ExtensionContext,
        private globalStateManager: GlobalStateManager,
        private extensionOutputChannel?: vscode.OutputChannel
    ) {
        this.networkId = getNetworkHash();

        this.setupConfiguration();
        this.setupWindowFocusHandling();
        this.setupMonitors();
        this.initialize();
        this.context.subscriptions.push(this);
    }

    private setupConfiguration() {
        const applyConfig = (event?: vscode.ConfigurationChangeEvent) => {
            let config: any = util.getConfiguration('brightscript') || {};

            void vscodeContextManager.set('brightscript.deviceDiscovery.enabled', config.deviceDiscovery?.enabled);
            void vscodeContextManager.set('brightscript.hasDefaultDevicePassword', !!this.getDefaultPassword());

            //if the `deviceDiscovery.enabled` setting was changed, start or stop monitoring
            if (event?.affectsConfiguration('brightscript.deviceDiscovery.enabled')) {
                if (this.deviceDiscoveryEnabled) {
                    //order a broadcast + reconcile so the views discover/health-check once enabled
                    this.submitOrders([{ type: 'broadcast', reason: 'startup' }, { type: 'reconcile', reason: 'startup' }]);
                    this.systemSleepMonitor.start();
                    void this.activateMonitoring();
                } else {
                    this.systemSleepMonitor.stop();
                    this.deactivateMonitoring();
                }
            }

            //if the `concealDeviceInfo` setting was changed, refresh the UI (no reload needed)
            if (event?.affectsConfiguration('brightscript.deviceDiscovery.concealDeviceInfo')) {
                this.emitDevicesChanged();
            }

            //if the `devices` setting was changed, re-apply configured devices immediately (cheap,
            //local) and order a health check for the views to fulfill when one is visible
            if (event?.affectsConfiguration('brightscript.devices')) {
                this.loadConfiguredDevices().catch(() => { });
                this.submitOrders([{ type: 'reconcile', reason: 'config-changed' }]);
            }

            //if the `defaultDevicePassword` setting was changed, refresh any device views that rely on it
            if (event?.affectsConfiguration('brightscript.defaultDevicePassword')) {
                this.emitDevicesChanged();
            }
        };
        this.context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(applyConfig)
        );
        applyConfig();
    }

    private setupWindowFocusHandling() {
        this.context.subscriptions.push(
            vscode.window.onDidChangeWindowState((state) => {
                if (state.focused) {
                    this.notifyFocusGained();
                } else {
                    this.notifyFocusLost();
                }
            })
        );
    }

    private setupMonitors() {
        this.systemSleepMonitor = new SystemSleepMonitor(() => {
            //order a broadcast + reconcile so the views rescan/health-check on wake
            this.submitOrders([{ type: 'broadcast', reason: 'sleep' }, { type: 'reconcile', reason: 'sleep' }]);
        });
        this.networkChangeMonitor = new NetworkChangeMonitor(() => {
            this.networkId = getNetworkHash();

            //reset all configured device states to unknown - need to re-verify on new network
            for (const entry of this.configuredDevices) {
                entry.lastState = entry.state;
                entry.state = 'unknown';
                entry.stateLastUpdated = Date.now();
            }

            //clear and reload discovered devices anytime this network changes (state goes with them)
            this.discoveredDevices = [];
            this.loadLastSeenDevices();

            //re-point the active device at its IP on this network (found by serial number)
            this.syncActiveDevice().catch(() => { });

            this.restartRokuFinder();

            //order a broadcast + reconcile so the views rescan/health-check on the new network
            this.submitOrders([{ type: 'broadcast', reason: 'network' }, { type: 'reconcile', reason: 'network' }]);
        });
    }

    private initialize() {
        //clear any deviceInfo entries older than our max age
        this.globalStateManager.clearExpiredDevices();

        // Load configured devices and cached devices (order doesn't matter due to setDevice merge logic)
        this.loadConfiguredDevices().catch(() => { });
        this.loadLastSeenDevices();

        //restore the active device from a previous session (re-resolves its IP by serial number)
        this.syncActiveDevice().catch(() => { });

        // Set up event listeners for the RokuFinder
        this.setupFinderListeners();

        if (this.deviceDiscoveryEnabled) {
            // Sleep monitor runs all the time when enabled (ignores focus state)
            this.systemSleepMonitor.start();

            //order a broadcast + reconcile for the views to fulfill when they open.
            //No proactive scan here even on a cold cache — per the design doc, no network
            //traffic happens until a view is actually visible to consume these orders.
            this.submitOrders([{ type: 'broadcast', reason: 'startup' }, { type: 'reconcile', reason: 'startup' }]);

            this.activateMonitoring().catch((e) => {
                console.error(e);
            });
        }
    }
    // #endregion

    // Core state and dependencies
    private configuredDevices: ConfiguredDeviceEntry[] = [];
    private discoveredDevices: DiscoveredDeviceEntry[] = [];
    private lastUsedDeviceIp: string | undefined = undefined;
    private networkId: string;

    // Orders (see docs/device-discovery.md "Orders"): deferred work submitted by triggers and
    // fulfilled by visible views. Each submitted order is announced on the emitter so live
    // views can fulfill immediately; hidden views drain the pending sets when they open.
    private orders = new Orders((order, timestamp) => {
        this.emitter.emit(`${order.type}-ordered`, { reason: order.reason, timestamp: timestamp });
    });
    private broadcastStaleTimer: ReturnType<typeof setInterval> | undefined;
    private reconcileStaleTimer: ReturnType<typeof setInterval> | undefined;

    private emitter = new EventEmitter();
    private systemSleepMonitor: SystemSleepMonitor;
    private networkChangeMonitor: NetworkChangeMonitor;
    private finder = new RokuFinder(this.globalStateManager, this.makeFinderLogger());

    // Health check tracking and cooldowns
    private resolveDeviceSequence = new Map<string, number>();
    private readonly DEVICE_INFO_CACHE_MS = 5 * 60 * 1_000; // 5 minutes - cache duration for fetchDeviceInfo
    private readonly FRESH_CACHE_THRESHOLD_MS = 5 * 60 * 1_000; // 5 minutes - cache fresher than this = online on load
    private readonly OFFLINE_COOLDOWN_MS = 5_000; // 5 seconds - minimum time between resolve attempts for offline devices
    private static readonly HEALTH_CHECK_TIMEOUT_MS = 2_000; // 2 seconds

    // Lazy hydration (background device-info refresh triggered by view reads — spec:
    // "Lazy hydration on read")
    private readonly HYDRATION_MAX_CACHE_AGE_MS = 8 * 60 * 60 * 1_000; // 8 hours - cache older than this re-hydrates on read
    private readonly HYDRATION_RETRY_COOLDOWN_MS = 5 * 60 * 1_000; // 5 minutes - minimum time between hydration attempts per IP
    private hydrationInFlight = new Set<string>();
    private hydrationLastAttempt = new Map<string, number>();

    // Notifications and event debouncing
    private readonly DEVICES_CHANGED_DEBOUNCE_MS = 50;
    private deviceOnlineNotifiers = new Map<string, ReturnType<typeof debounce>>();

    // Scan state management. STALE_SCAN_THRESHOLD_MS is both the stale-only broadcast gate
    // ("don't scan if the last scan is younger than this") and the `stale` broadcast timer
    // interval — one definition of "it's been a while".
    private readonly STALE_SCAN_THRESHOLD_MS = 30 * 60 * 1_000; // 30 minutes
    private readonly STALE_RECONCILE_INTERVAL_MS = 5 * 60 * 1_000; // 5 minutes - the spec's stale reconcile timer
    private readonly UNHEALTHY_BROADCAST_MIN_INTERVAL_MS = 60_000; // 1 minute - suppress unhealthy-device orders this soon after a scan
    private lastScanDate: Date | null = null;

    public on(eventName: 'devices-changed', handler: () => void, disposables?: Disposable[]): () => void;
    public on(eventName: 'scan-started', handler: () => void, disposables?: Disposable[]): () => void;
    public on(eventName: 'scan-ended', handler: () => void, disposables?: Disposable[]): () => void;
    public on(eventName: 'broadcast-ordered', handler: (order: BroadcastOrder) => void, disposables?: Disposable[]): () => void;
    public on(eventName: 'reconcile-ordered', handler: (order: ReconcileOrder) => void, disposables?: Disposable[]): () => void;
    public on(eventName: string, handler: (payload: any) => void, disposables?: Disposable[]): () => void {
        this.emitter.on(eventName, handler);
        const unsubscribe = () => {
            if (this.emitter !== undefined) {
                this.emitter.removeListener(eventName, handler);
            }
        };

        disposables?.push({
            dispose: unsubscribe
        });

        return unsubscribe;
    }

    /**
     * Get device by encoded key string.
     * Key format: "s:{serialNumber}" or "i:{ip}"
     *
     * @param key - Encoded device key
     * @returns Device with deviceInfo or undefined if not found
     */
    public getDevice(key: string): RokuDevice | undefined;
    /**
     * Get device by IP or serial number.
     * Returns device with deviceInfo hydrated from cache.
     *
     * @param lookup - Object with optional ip and/or serialNumber
     * @returns Device with deviceInfo or undefined if not found
     */
    public getDevice(lookup: { ip?: string; serialNumber?: string }): RokuDevice | undefined;
    public getDevice(keyOrLookup: string | { ip?: string; serialNumber?: string }): RokuDevice | undefined {
        const { configured, discovered } = this.findDeviceEntries(keyOrLookup);
        const device = this.buildMergedDevice(configured, discovered);

        // If lookup object with both ip and serialNumber, verify exact match
        if (typeof keyOrLookup !== 'string' && keyOrLookup.ip && keyOrLookup.serialNumber && device) {
            if (device.ip !== keyOrLookup.ip || device.serialNumber !== keyOrLookup.serialNumber) {
                return undefined;
            }
        }

        if (device) {
            this.queueHydration([device]);
        }
        return device;
    }

    /**
     * Probe an IP address, add it to the discovered devices list if reachable, and return the device.
     * Used when user manually enters an IP or before resolving a debug config.
     *
     * @param ip - The IP address to probe
     * @returns The device if reachable, undefined otherwise
     */
    public async validateAndAddDevice(ip: string): Promise<RokuDevice | undefined> {
        this.setDiscoveredDevice(ip, undefined);
        await this.resolveDevice({ ip: ip }, { syntheticDelay: false });
        return this.getDevice({ ip: ip });
    }

    /**
     * Get a list of all roku devices.
     * Returns all devices without filtering. Returns immediately from in-memory data; devices
     * with missing or old cached info are hydrated in the background (see {@link queueHydration})
     * and a `devices-changed` event fires when fresh data arrives.
     */
    public getAllDevices(): RokuDevice[] {
        const devices = this.buildAllDevices();
        this.queueHydration(devices);
        return devices;
    }

    /**
     * Does this device need a background device-info refresh? (spec: Lazy hydration on read)
     * - state `unknown` — never confirmed this session (e.g. folded in from a scan response,
     *   ssdp:alive, or the last-seen cache with info older than the 5-min freshness check).
     *   Cache age doesn't matter here: cached info can render the row, but only a resolve can
     *   confirm the device is actually there.
     * - cached info older than {@link HYDRATION_MAX_CACHE_AGE_MS} (regardless of state)
     */
    private needsHydration(device: RokuDevice): boolean {
        //a resolve is already in flight somewhere (required guard: the cache-age condition below
        //is state-independent, so without this a pending device would re-queue on every read)
        if (device.deviceState === 'pending') {
            return false;
        }
        if (device.deviceState === 'unknown') {
            return true;
        }
        const cached = device.serialNumber ? this.globalStateManager.getCachedDevice(device.serialNumber) : undefined;
        if (!cached) {
            return false;
        }
        return Date.now() - cached.createdAt > this.HYDRATION_MAX_CACHE_AGE_MS;
    }

    /**
     * The "lazy hydration on read" mechanism from the design doc: queue background device-info
     * fetches for devices that need one, then return immediately. As each resolve completes,
     * `devices-changed` fires and views re-render with the fresh data.
     *
     * Re-entrancy protection (views call getAllDevices on every devices-changed, and resolves
     * emit devices-changed, so this must converge):
     * - while a fetch is in flight the device is `pending` and its IP is in `hydrationInFlight`
     * - success renews the cache timestamp, so neither hydration condition holds anymore
     * - failure removes discovered entries entirely; configured entries go `offline`
     * - failure with a still-old cache would re-qualify — `hydrationLastAttempt` caps that at
     *   one attempt per IP per {@link HYDRATION_RETRY_COOLDOWN_MS}
     */
    private queueHydration(devices: RokuDevice[]): void {
        const now = Date.now();
        for (const device of devices) {
            if (!this.needsHydration(device)) {
                continue;
            }
            if (this.hydrationInFlight.has(device.ip)) {
                continue;
            }
            const lastAttempt = this.hydrationLastAttempt.get(device.ip);
            if (lastAttempt !== undefined && now - lastAttempt < this.HYDRATION_RETRY_COOLDOWN_MS) {
                continue;
            }

            //timestamp at queue time so even instantly-failing attempts are rate-limited
            this.hydrationLastAttempt.set(device.ip, now);
            this.hydrationInFlight.add(device.ip);
            //silent background refresh: no synthetic delay, cache trusted (offline cooldown applies)
            void this.resolveDevice({ ip: device.ip, serialNumber: device.serialNumber }, { syntheticDelay: false })
                .catch(() => { })
                .finally(() => {
                    this.hydrationInFlight.delete(device.ip);
                });
        }
    }

    /**
     * Generate a display name for a device.
     * Handles missing device info gracefully (no ugly " - - - " strings).
     * @param device - The device to generate a name for
     * @param includeIp - Whether to always append IP at the end (default: false, IP only used as fallback)
     */
    public getDeviceDisplayName(device: RokuDevice, includeIp = false): string {
        // Coerce to a trimmed string, or undefined when the value is missing/blank.
        // Whitespace-only values would otherwise pass `Boolean` and render as empty segments.
        const clean = (value: unknown): string | undefined => {
            if (value === null || value === undefined || typeof value !== 'string') {
                return undefined;
            }
            const str = value.trim();
            return str.length > 0 ? str : undefined;
        };

        const displayName = clean(device.configuredName) ?? clean(device.deviceInfo['user-device-name']);
        const modelNumber = clean(device.deviceInfo['model-number']);
        const softwareVersion = clean(device.deviceInfo['software-version']);
        const ip = clean(device.ip);

        const parts = [
            modelNumber,
            displayName,
            softwareVersion ? `OS ${softwareVersion}` : undefined
        ].filter(Boolean);

        if (includeIp && ip) {
            parts.push(ip);
        }

        return parts.join(' – ') || ip || '';
    }

    /**
     * Generate the label used when showing "host" entries in a quick picker
     * @param device the device containing all the info
     * @returns a properly formatted host string
     */
    public getIconPath(device: RokuDevice) {
        const hasCache = device.serialNumber && this.hasDeviceCache(device.serialNumber);

        if (device.deviceState === 'pending') {
            return new vscode.ThemeIcon('circle-small', new vscode.ThemeColor('disabledForeground'));
        }

        if (device.deviceState === 'offline') {
            const iconId = hasCache ? 'debug-disconnect' : 'warning';
            return new vscode.ThemeIcon(iconId, new vscode.ThemeColor('disabledForeground'));
        }

        if (device.deviceState === 'unknown' && !hasCache) {
            return new vscode.ThemeIcon('warning', new vscode.ThemeColor('disabledForeground'));
        }

        return icons.getDeviceType(device.deviceInfo);
    }

    /**
     * Build all devices from configuredDevices and discoveredDevices arrays.
     * Deduplication by serial number (preferred) or IP (fallback).
     */
    private buildAllDevices(): RokuDevice[] {
        const mergedDevices = new Map<string, RokuDevice>();
        const processedDiscoveredIndices = new Set<number>();

        // Process configured devices first, finding matching discovered entries
        for (const configured of this.configuredDevices) {
            // Find matching discovered entry by serial, resolvedIp, or host
            let discoveredIdx = -1;
            let discovered: DiscoveredDeviceEntry | undefined;

            if (configured.serialNumber) {
                // Config has serial - ONLY match by serial (serial is primary key)
                discoveredIdx = this.discoveredDevices.findIndex(d => d.serialNumber === configured.serialNumber);
            } else {
                // Config has no serial - match by IP
                if (configured.resolvedIp) {
                    discoveredIdx = this.discoveredDevices.findIndex(d => d.ip === configured.resolvedIp);
                }
                if (discoveredIdx < 0) {
                    discoveredIdx = this.discoveredDevices.findIndex(d => d.ip === configured.host);
                }
            }

            if (discoveredIdx >= 0) {
                discovered = this.discoveredDevices[discoveredIdx];
                processedDiscoveredIndices.add(discoveredIdx);
            }

            const device = this.buildMergedDevice(configured, discovered);
            if (device) {
                mergedDevices.set(device.key, device);
            }
        }

        // Process discovered-only devices (not already merged via configured)
        for (let i = 0; i < this.discoveredDevices.length; i++) {
            if (processedDiscoveredIndices.has(i)) {
                continue;
            }

            const discovered = this.discoveredDevices[i];
            const device = this.buildMergedDevice(undefined, discovered);
            if (device) {
                // Check for duplicate by key
                if (mergedDevices.has(device.key)) {
                    continue;
                }
                // Only skip by IP if neither device has a serial (serial is primary key)
                // Different serials at same IP = different devices
                const existingByIp = Array.from(mergedDevices.values()).find(d => d.ip === device.ip);
                if (existingByIp && !device.serialNumber && !existingByIp.serialNumber) {
                    continue;
                }
                mergedDevices.set(device.key, device);
            }
        }

        // Convert to array and sort
        return Array.from(mergedDevices.values()).sort(
            // Sort by form factor
            firstBy<RokuDevice>((a, b) => {
                return this.getPriorityForDeviceFormFactor(a.deviceInfo) - this.getPriorityForDeviceFormFactor(b.deviceInfo);
                // Then by name
            }).thenBy<RokuDevice>((a, b) => {
                const nameA = a.deviceInfo['default-device-name'] || '';
                const nameB = b.deviceInfo['default-device-name'] || '';
                return nameA.localeCompare(nameB);
            }).thenBy<RokuDevice>((a, b) => {
                const serialA = a.serialNumber || '';
                const serialB = b.serialNumber || '';
                if (serialA < serialB) {
                    return -1;
                }
                if (serialA > serialB) {
                    return 1;
                }
                // serial numbers must be equal
                return 0;
            })
        );
    }

    // #region Device State Management
    /**
     * Get device state from inline state on entries.
     * Priority: discovered > configured > default unknown
     * Searches by IP first (if provided), then by serial number
     * @param lookup - Device lookup by serial and/or IP
     * @returns The device state, defaulting to 'unknown' if not found
     */
    private getDeviceState(lookup: { serialNumber?: string; ip?: string }): DeviceStateEntry {
        let match = this.findStateEntry(this.discoveredDevices, lookup);
        if (match) {
            return { state: match.state, lastUpdated: match.stateLastUpdated ?? Date.now() };
        }

        match = this.findStateEntry(this.configuredDevices, lookup);
        if (match) {
            return { state: match.state, lastUpdated: match.stateLastUpdated ?? Date.now() };
        }
        return { state: 'unknown', lastUpdated: Date.now() };
    }

    /**
     * Find the highest-priority state-bearing entry across discovered then configured
     * sources. Within each source, try the IP first (skipping IP matches whose serial
     * points to a different device — otherwise changing a configured device's serial to
     * a new value at an IP that already hosts an online discovered device would briefly
     * inherit that online state), then fall back to a serial-only match. Returns the
     * first entry that actually has a `state` set.
     */
    private findStateEntry(entries: Array<ConfiguredDeviceEntry | DiscoveredDeviceEntry>, lookup: { serialNumber?: string; ip?: string }) {
        let match: ConfiguredDeviceEntry | DiscoveredDeviceEntry | undefined;
        if (lookup.ip) {
            match = entries.find(entry => {
                const ipMatches = (entry as DiscoveredDeviceEntry).ip === lookup.ip || (entry as ConfiguredDeviceEntry).host === lookup.ip || (entry as ConfiguredDeviceEntry).resolvedIp === lookup.ip;
                // when both sides carry a serial, they must agree — otherwise this IP belongs to a different device
                const serialMatches = !lookup.serialNumber || !entry.serialNumber || entry.serialNumber === lookup.serialNumber;
                return ipMatches && serialMatches;
            });
        }
        if (!match && lookup.serialNumber) {
            match = entries.find(entry => entry.serialNumber === lookup.serialNumber);
        }
        if (match?.state) {
            return match;
        }
        return undefined;
    }

    /**
     * Set device state directly on entries that match the IP.
     * Updates all configured and discovered entries at the given IP.
     * When called without explicit state, uses intelligent defaults:
     * - If already online, stays online
     * - Else checks cache freshness (5 min threshold) to determine online vs unknown
     *
     * @param lookup - Device lookup by IP (and optionally serial for cache lookup)
     * @param state - Explicit state to set, or undefined for intelligent default
     */
    private setDeviceState(lookup: { serialNumber?: string; ip?: string }, state?: DeviceState): void {
        const now = Date.now();
        let resolvedState: DeviceState;

        //if we were given a state, use it
        if (state !== undefined) {
            resolvedState = state;
        } else {
            const currentState = this.getDeviceState(lookup).state;
            if (currentState === 'online') {
                resolvedState = 'online';
            } else {
                // For non-online devices, check cache freshness
                const cached = lookup.serialNumber ? this.globalStateManager.getCachedDevice(lookup.serialNumber) : undefined;
                const isFreshCache = cached && (now - cached.createdAt < this.FRESH_CACHE_THRESHOLD_MS);
                resolvedState = isFreshCache ? 'online' : 'unknown';
            }
        }

        // Update configured entries at this IP that match the serial (or have no serial conflict).
        // stateLastUpdated bumps on every call so consumers see the latest check time, but
        // lastState/state only move when the state actually changes.
        for (const entry of this.configuredDevices) {
            const ipMatches = entry.host === lookup.ip || entry.resolvedIp === lookup.ip;
            // Only update if IP matches AND (no serial conflict OR serials match)
            const serialConflict = lookup.serialNumber && entry.serialNumber && entry.serialNumber !== lookup.serialNumber;
            if (ipMatches && !serialConflict) {
                if (entry.state !== resolvedState) {
                    entry.lastState = entry.state;
                    entry.state = resolvedState;
                }
                entry.stateLastUpdated = now;
            }
        }

        // Update discovered entries at this IP that match the serial (or have no serial conflict).
        // Same nested guard as the configured loop above.
        for (const entry of this.discoveredDevices) {
            const ipMatches = entry.ip === lookup.ip;
            const serialConflict = lookup.serialNumber && entry.serialNumber && entry.serialNumber !== lookup.serialNumber;
            if (ipMatches && !serialConflict) {
                if (entry.state !== resolvedState) {
                    entry.lastState = entry.state;
                    entry.state = resolvedState;
                }
                entry.stateLastUpdated = now;
            }
        }
    }
    // #endregion

    /**
     * Check if a device has cached info (has been successfully resolved before).
     * Used by view providers to determine icon: warning (no cache) vs disconnect (has cache).
     */
    public hasDeviceCache(serialNumber: string): boolean {
        return !!this.globalStateManager.getCachedDevice(serialNumber);
    }

    // #region Orders (docs/device-discovery.md "Orders" / "When are orders submitted?")
    /**
     * Submit orders. Each caller states exactly which order types its trigger implies — e.g.
     * a refresh click submits both types, a config change submits only a reconcile (an edit
     * can't add network devices), an unhealthy device submits only a broadcast (rescan, don't
     * hammer every device). Every submitted order is announced
     * (`broadcast-ordered`/`reconcile-ordered`) so a visible view fulfills it live; hidden
     * views drain the pending sets when they open.
     */
    public submitOrders(orders: Order[]): void {
        this.orders.submit(orders);
    }

    /**
     * The reasons of all pending broadcast orders that no view has fulfilled yet.
     */
    public getPendingBroadcastReasons(): BroadcastReason[] {
        return this.orders.getPending('broadcast');
    }

    public getPendingReconcileReasons(): ReconcileReason[] {
        return this.orders.getPending('reconcile');
    }

    /**
     * Atomically consume AND execute pending broadcast orders. The one-call fulfillment API
     * for views: take + broadcast in a single step. The work is idempotent, so all taken
     * reasons are satisfied by a single scan; the reasons travel into {@link broadcast}, which
     * decides the urgency internally (only-`stale` stays staleness-gated; any real trigger
     * scans now).
     *
     * @param options.except - reasons that do not TRIGGER fulfillment on their own, e.g.
     *   `{ except: ['stale'] }` — see {@link Orders.take} for the full semantics.
     * @returns true if orders were consumed and a scan actually started
     */
    public fulfillPendingBroadcast(options?: { except?: BroadcastReason[] }): boolean {
        const reasons = this.orders.take('broadcast', options?.except);
        if (!reasons) {
            return false;
        }
        return this.broadcast(reasons);
    }

    /**
     * Atomically consume AND execute pending reconcile orders. One-call twin of
     * {@link fulfillPendingBroadcast}; the reasons travel into {@link reconcile}, which decides
     * internally whether the per-device cache trust window is bypassed (only when
     * `refresh-clicked` is among them — an explicit "I want fresh data now" from the user).
     */
    public fulfillPendingReconcile(options?: { except?: ReconcileReason[] }): boolean {
        const reasons = this.orders.take('reconcile', options?.except);
        if (!reasons) {
            return false;
        }
        this.reconcile(reasons);
        return true;
    }

    /**
     * Fulfill both pending order types in one call — the common case for views (on open, on
     * becoming visible). Views that need per-order-type policy (e.g. the quick pick's 7s
     * fallback only wants broadcasts) can still call the specific fulfillments directly.
     */
    public fulfillPendingOrders(options?: { except?: Array<BroadcastReason | ReconcileReason> }): { scanStarted: boolean; reconciled: boolean } {
        return {
            scanStarted: this.fulfillPendingBroadcast({ except: options?.except as BroadcastReason[] }),
            reconciled: this.fulfillPendingReconcile({ except: options?.except as ReconcileReason[] })
        };
    }
    // #endregion

    /**
     * Health-check a single device NOW: bypass its cache trust window, fetch fresh device
     * info from the network, update the cache (so every view renders the freshest data), and
     * report whether it responded. Fire-and-forget callers can ignore the result — the cache
     * update is the point. Accepts anything {@link getDevice} can look up (encoded tree key,
     * ip/serial lookup) or a device object; an unknown device is simply reported unhealthy.
     */
    public async healthCheckDevice(deviceKeyOrLookup: RokuDevice | string | { ip?: string; serialNumber?: string }): Promise<boolean> {
        return (await this.fetchFreshDevice(deviceKeyOrLookup)) !== undefined;
    }

    /**
     * Fetch a single device's info fresh from the network NOW. Same work as
     * {@link healthCheckDevice} (bypass cache trust window, fetch, update cache) — this variant
     * returns the resulting device info for callers that need it (e.g. pre-launch host
     * resolution). Returns undefined when the device is unknown or unreachable.
     */
    public async getDeviceInfo(deviceKeyOrLookup: RokuDevice | string | { ip?: string; serialNumber?: string }): Promise<Record<string, any> | undefined> {
        return (await this.fetchFreshDevice(deviceKeyOrLookup))?.deviceInfo;
    }

    /**
     * The shared engine behind {@link healthCheckDevice} and {@link getDeviceInfo}: resolve
     * the device with the cache trust window bypassed and no synthetic delay, then return the
     * freshly-merged device (or undefined when unknown/unreachable).
     */
    private async fetchFreshDevice(deviceKeyOrLookup: RokuDevice | string | { ip?: string; serialNumber?: string }): Promise<RokuDevice | undefined> {
        // If already a device object with deviceState, use it directly; otherwise look it up
        let device: RokuDevice | undefined;
        if (typeof deviceKeyOrLookup === 'string') {
            device = this.getDevice(deviceKeyOrLookup);
        } else if ('deviceState' in deviceKeyOrLookup) {
            device = deviceKeyOrLookup;
        } else {
            device = this.getDevice(deviceKeyOrLookup);
        }

        if (!device) {
            return undefined;
        }

        // The caller wants a real answer now: bypass the cache trust window, no synthetic delay
        const isHealthy = await this.resolveDevice(device, { bypassCache: true, syntheticDelay: false });
        if (!isHealthy) {
            if (device.isDiscovered) {
                // a discovered device went dark — order a rescan for the views to fulfill
                this.submitUnhealthyDeviceBroadcast();
            }
            return undefined;
        }
        // re-read so the returned device carries the just-fetched info
        return this.getDevice({ ip: device.ip, serialNumber: device.serialNumber });
    }

    /**
     * Broadcast an SSDP M-SEARCH to discover devices on the network. Does NOT health-check
     * existing devices — that's {@link reconcile}. The reasons decide the urgency: any real
     * trigger scans now, while a `stale` timer-tick is only a "things might be old" hint — a
     * stale-only fulfillment scans only when discovery is enabled AND the last scan is older
     * than STALE_SCAN_THRESHOLD_MS. Reachable only through order fulfillment.
     * @returns true if a scan was started
     */
    private broadcast(reasons: BroadcastReason[]): boolean {
        const staleOnly = reasons.every(x => x === 'stale');
        if (staleOnly) {
            if (!this.deviceDiscoveryEnabled || this.timeSinceLastScan <= this.STALE_SCAN_THRESHOLD_MS) {
                return false;
            }
        }
        this.lastScanDate = new Date();
        this.finder.scan();
        return true;
    }

    /**
     * Health-check every known device (configured + discovered), marking them online/offline.
     * Does NOT scan for new devices — that's {@link broadcast}. The reasons decide the urgency:
     * only an explicit user click bypasses each device's cache trust window — a bypassing
     * reconcile is one HTTP request per known device, so only "I want fresh data NOW" earns
     * that. Reachable only through order fulfillment.
     */
    private reconcile(reasons: ReconcileReason[]): void {
        const bypassDeviceCache = reasons.includes('refresh-clicked');
        this.healthCheckAllDevices(bypassDeviceCache).catch(() => { });
    }

    /**
     * Clear discovered devices from the device list, keeping configured devices.
     * Useful for refreshing the network scan without losing user-configured devices.
     */
    public clearCurrentDeviceList(): void {
        // Clear discovered devices (ephemeral)
        this.discoveredDevices = [];

        // Only clear lastUsedDeviceIp if it belonged to a discovered-only device
        if (this.lastUsedDeviceIp) {
            const stillExists = this.configuredDevices.some(
                d => d.resolvedIp === this.lastUsedDeviceIp || d.host === this.lastUsedDeviceIp
            );
            if (!stillExists) {
                this.lastUsedDeviceIp = undefined;
            }
        }

        //clear the cache for the current list of devices
        this.globalStateManager.setLastSeenDevices(this.networkId, []);

        //this is a user-initiated action, so order a health check of the remaining (configured)
        //devices rather than running one directly — a visible view fulfills it immediately
        this.submitOrders([{ type: 'reconcile', reason: 'refresh-clicked' }]);
        this.emitDevicesChanged();
    }

    public clearAllCache() {

        // End any in-progress scan (emits scan-ended) so late responses don't instantly
        // repopulate the just-cleared state — but keep the passive SSDP listener running,
        // otherwise the device list stays empty until the next explicit scan
        this.finder.stopScan();

        // Clear persisted global state
        this.globalStateManager.clearLastSeenDevices();
        this.globalStateManager.clearDeviceCache();
        this.globalStateManager.clearSerialNumberByIpForNetwork();


        // Clear all timestamps and per-device state
        this.lastScanDate = null;
        this.resolveDeviceSequence.clear();
        this.hydrationLastAttempt.clear();

        // Reset configured device states to unknown
        for (const entry of this.configuredDevices) {
            entry.lastState = entry.state;
            entry.state = 'unknown';
            entry.stateLastUpdated = Date.now();
        }

        // Clear discovered devices (state goes with them)
        this.clearCurrentDeviceList();
    }

    /**
     * Submit an `unhealthy-device` broadcast order (a discovered device failed a health check,
     * so the network picture may have changed). Rate-limited: suppressed when discovery is
     * disabled or when a scan ran within the last minute — the terminating guard for the
     * potential scan → health-check → fail → scan feedback loop.
     */
    private submitUnhealthyDeviceBroadcast(): void {
        if (!this.deviceDiscoveryEnabled) {
            return;
        }
        if (this.timeSinceLastScan < this.UNHEALTHY_BROADCAST_MIN_INTERVAL_MS) {
            return;
        }
        this.submitOrders([{ type: 'broadcast', reason: 'unhealthy-device' }]);
    }

    /**
     * Validate a developer password against the device at `host`.
     *
     * Returns:
     * - `'ok'` — credentials accepted
     * - `'bad-password'` — device reachable, credentials rejected
     * - `'unreachable'` — device could not be contacted (transient; don't treat as wrong password)
     */
    public async validateDevicePassword(host: string, password: string): Promise<PasswordValidationResult> {
        try {
            const accepted = await rokuDeploy.validateDeveloperPassword({ host: host, password: password });
            return accepted ? 'ok' : 'bad-password';
        } catch (e) {
            if (e instanceof DeviceUnreachableError) {
                return 'unreachable';
            }
            // Unexpected response code or any other failure — treat as unreachable so the caller retries/prompts rather than discarding credentials.
            return 'unreachable';
        }
    }

    /**
     * Set the active device. Persists the device's serial number (when known) alongside the IP in
     * workspace storage so the active device can be recovered in future sessions even if its IP changed.
     */
    public async setActiveDevice(ip: string): Promise<void> {
        const serialNumber = this.getDevice({ ip: ip })?.serialNumber;
        await this.context.workspaceState.update('remoteHost', ip);
        await this.context.workspaceState.update(DeviceManager.ACTIVE_DEVICE_STATE_KEY, { serialNumber: serialNumber, ip: ip } as ActiveDeviceEntry);
        await vscodeContextManager.set('activeHost', ip);
    }

    /**
     * Clear the active device (both the session context and the persisted workspace storage entry)
     */
    public async clearActiveDevice(): Promise<void> {
        await this.context.workspaceState.update('remoteHost', '');
        await this.context.workspaceState.update(DeviceManager.ACTIVE_DEVICE_STATE_KEY, undefined);
        await vscodeContextManager.set('activeHost', '');
    }

    /**
     * Forget the saved active device when the user has explicitly picked a different device.
     * Called after the device picker resolves in a flow where the active device could not be located,
     * so the old active device isn't automatically re-activated by `syncActiveDevice` if it comes
     * back online later. When the picked device IS the active device (possibly at a new IP), the
     * active device is kept and its pointers are re-synced instead.
     */
    public async forgetActiveDeviceIfDifferent(pickedIp: string): Promise<void> {
        const activeDevice = this.context.workspaceState.get<ActiveDeviceEntry>(DeviceManager.ACTIVE_DEVICE_STATE_KEY);
        if (!activeDevice?.ip && !activeDevice?.serialNumber) {
            return;
        }

        const pickedSerialNumber = this.getDevice({ ip: pickedIp })?.serialNumber;
        const isSameDevice = pickedIp === activeDevice.ip ||
            (!!activeDevice.serialNumber && pickedSerialNumber === activeDevice.serialNumber);
        if (isSameDevice) {
            await this.syncActiveDevice();
            return;
        }

        await this.context.workspaceState.update(DeviceManager.ACTIVE_DEVICE_STATE_KEY, undefined);
        await vscodeContextManager.set('activeHost', '');
    }

    /**
     * Re-point the active device at its current IP, found by looking up the persisted serial number
     * in the device stores. Runs on activation (recovers the active device from the previous session),
     * after a network change, and when discovery sees the device at a new IP.
     */
    private async syncActiveDevice(): Promise<void> {
        const activeDevice = this.context.workspaceState.get<ActiveDeviceEntry>(DeviceManager.ACTIVE_DEVICE_STATE_KEY);
        if (!activeDevice?.ip && !activeDevice?.serialNumber) {
            return;
        }

        //find the device's current IP by serial number (device list first, then the persisted SN↔IP store),
        //falling back to the last IP we saw it at
        let currentIp = activeDevice.ip;
        if (activeDevice.serialNumber) {
            currentIp = this.getDevice({ serialNumber: activeDevice.serialNumber })?.ip ??
                this.globalStateManager.getIpForSerial(activeDevice.serialNumber, this.networkId) ??
                activeDevice.ip;
        }
        if (!currentIp) {
            return;
        }

        //keep `remoteHost` following the active device, unless something else (e.g. a debug launch) has since pointed it elsewhere
        const remoteHost = this.context.workspaceState.get<string>('remoteHost');
        if (!remoteHost || remoteHost === activeDevice.ip || remoteHost === currentIp) {
            await this.context.workspaceState.update('remoteHost', currentIp);
        }
        if (currentIp !== activeDevice.ip) {
            await this.context.workspaceState.update(DeviceManager.ACTIVE_DEVICE_STATE_KEY, { serialNumber: activeDevice.serialNumber, ip: currentIp } as ActiveDeviceEntry);
        }
        await vscodeContextManager.set('activeHost', currentIp);
    }

    /**
     * workspaceState key where the active device's serial number and last-known IP are persisted
     */
    public static readonly ACTIVE_DEVICE_STATE_KEY = 'activeDevice';

    public getLastUsedDeviceIp(): string | undefined {
        return this.lastUsedDeviceIp;
    }

    public setLastUsedDeviceIp(value: string | undefined) {
        this.lastUsedDeviceIp = value;
    }

    public dispose() {
        this.deactivateMonitoring();
        this.systemSleepMonitor?.dispose?.();
        this.networkChangeMonitor?.dispose?.();
        this.finder?.dispose?.();
        this.configuredDevices = [];
        this.discoveredDevices = [];
        this.emitter.removeAllListeners();
    }

    /**
     * Is device discovery enabled (i.e. passive scans are permitted)
     */
    private get deviceDiscoveryEnabled() {
        return util.getConfiguration('brightscript')?.deviceDiscovery?.enabled ?? true;
    }

    /**
     * Should info messages be shown when new devices are discovered (e.g. "Device found: Roku TV")?
     */
    private get showInfoMessages() {
        return util.getConfiguration('brightscript')?.deviceDiscovery?.showInfoMessages ?? true;
    }

    private get heartbeatLogging() {
        return util.getConfiguration('brightscript')?.deviceDiscovery?.heartbeatLogging ?? false;
    }

    private makeFinderLogger(): (msg: string) => void {
        return (msg: string) => {
            if (this.heartbeatLogging) {
                this.extensionOutputChannel?.appendLine(`[heartbeat] ${msg}`);
            }
        };
    }

    /**
     * Default password applied to any device that does not have its own configured password.
     * Returns undefined when the setting is empty so callers can fall through to their own logic.
     */
    public getDefaultPassword(): string | undefined {
        const value = util.getConfiguration('brightscript')?.defaultDevicePassword;
        return typeof value === 'string' && value.length > 0 ? value : undefined;
    }

    private get timeSinceLastScan(): number {
        if (!this.lastScanDate) {
            return Infinity; // Never scanned, so always stale
        }
        return Date.now() - this.lastScanDate.getTime();
    }

    private getPriorityForDeviceFormFactor(deviceInfo: Record<string, any>): number {
        if (deviceInfo?.['is-stick'] === 'true') {
            return 0;
        }
        if (deviceInfo?.['is-tv'] === 'true') {
            return 2;
        }
        return 1;
    }

    /**
     * Load last seen devices from cache.
     * Last seen devices are used to pre-populate the IP→serial mapping.
     */
    private loadLastSeenDevices(): void {
        // Clear discovered devices (ephemeral - reload from network)
        this.discoveredDevices = [];

        // Load cached devices for current network - add to discoveredDevices (state determined by cache freshness)
        const lastSeenDevices = this.globalStateManager.getLastSeenDevices(this.networkId);
        for (const serialNumber of lastSeenDevices) {
            const cached = this.globalStateManager.getCachedDevice(serialNumber);
            if (cached && typeof cached === 'object' && !Array.isArray(cached)) {
                // Get IP from ip-to-serial mapping
                const ip = this.globalStateManager.getIpForSerial(serialNumber, this.networkId);
                if (!ip) {
                    // No IP mapping found - remove stale entry
                    this.globalStateManager.removeLastSeenDevice(this.networkId, serialNumber);
                    continue;
                }
                // Add to discoveredDevices array (state determined from cache freshness)
                this.setDiscoveredDevice(ip, serialNumber);
            } else {
                // No cached info - remove stale entry
                this.globalStateManager.removeLastSeenDevice(this.networkId, serialNumber);
            }
        }
    }

    /**
     * Load configured devices from VSCode settings.
     * Handles removals (devices no longer in config) and adds/updates.
     * Safe to call at startup (removal is no-op when devices array is empty).
     * Resolves hostnames to IP addresses using DNS lookup.
     */
    private async loadConfiguredDevices(): Promise<void> {
        // Read config from all VSCode scopes
        const inspection = vscode.workspace.getConfiguration('brightscript').inspect<ConfiguredDevice[]>('devices');
        const userDevices = inspection?.globalValue ?? [];
        const workspaceDevices = inspection?.workspaceValue ?? [];

        // Build a map tracking which scopes each device is in
        interface ConfiguredDeviceWithScope extends ConfiguredDevice {
            configuredIn: ConfigurationScope[];
        }
        const deviceMap = new Map<string, ConfiguredDeviceWithScope>();

        function addDevicesFromScope(devices: ConfiguredDevice[], scope: ConfigurationScope) {
            for (const device of devices) {
                if (!device?.host) {
                    continue;
                }
                const key = device.serialNumber || device.host;
                const existing = deviceMap.get(key);
                const scopes = existing?.configuredIn ?? [];
                if (!scopes.includes(scope)) {
                    scopes.push(scope);
                }
                deviceMap.set(key, {
                    ...existing,
                    ...device,
                    configuredIn: scopes
                });
            }
        }

        addDevicesFromScope(userDevices, 'user');
        addDevicesFromScope(workspaceDevices, 'workspace');

        // Clear and rebuild configuredDevices array
        this.configuredDevices = [];

        // Sort devices by deterministic key for consistent ordering
        const sortedDevices = Array.from(deviceMap.values()).sort((a, b) => {
            const keyA = a.serialNumber || a.host;
            const keyB = b.serialNumber || b.host;
            return keyA.localeCompare(keyB);
        });

        for (const configured of sortedDevices) {
            // Resolve hostname to IP address (handles both hostnames and IPs)
            let resolvedIp: string | undefined;
            try {
                resolvedIp = await rokuDebugUtil.dnsLookup(configured.host);
            } catch {
                // DNS lookup failed - resolvedIp remains undefined
            }

            const ip = resolvedIp ?? configured.host;

            this.configuredDevices.push({
                ...configured,
                resolvedIp: resolvedIp
            });

            // Set device state using configured serial (not cache - cache might be stale)
            this.setDeviceState({ serialNumber: configured.serialNumber, ip: ip });
        }

        this.emitDevicesChanged();
    }

    private async resolveDevice(device: RokuDevice | { ip: string; serialNumber?: string }, options?: { bypassCache?: boolean; syntheticDelay?: boolean }): Promise<boolean> {
        // bypassCache: skip the cache trust window AND the offline cooldown — "I want a real
        // answer from the network NOW" (user engagement, refresh-clicked reconciles).
        const bypassCache = options?.bypassCache ?? false;
        const syntheticDelay = options?.syntheticDelay ?? true;

        // Extract serial from device if available (for proper state key management)
        const knownSerial = 'serialNumber' in device ? device.serialNumber : undefined;

        const currentStateObject = this.getDeviceState({ ip: device.ip, serialNumber: knownSerial });

        // Offline cooldown: if device is offline and we recently checked, skip the re-check.
        // This prevents the loop: healthCheck → resolve → offline → emit → refresh → healthCheck...
        const isOffline = currentStateObject.state === 'offline';
        const recentlyCheckedOffline = isOffline && (Date.now() - currentStateObject.lastUpdated < this.OFFLINE_COOLDOWN_MS);
        if (!bypassCache && recentlyCheckedOffline) {
            return false;
        }

        // Increment and capture sequence number to handle concurrent refresh calls
        // Use IP for sequence tracking (primary key)
        const currentSeq = (this.resolveDeviceSequence.get(device.ip) ?? 0) + 1;
        this.resolveDeviceSequence.set(device.ip, currentSeq);

        // Get device info from cache or network
        let deviceInfo: DeviceInfoRaw | undefined;

        // Try to find cached data via serial number
        const serialForCache = knownSerial ?? this.globalStateManager.getSerialNumberForIp(device.ip, this.networkId);
        const cached = serialForCache ? this.globalStateManager.getCachedDevice(serialForCache) : undefined;
        // Check if the serial was last seen at this IP (don't trust cache if device moved)
        const cachedIp = serialForCache ? this.globalStateManager.getIpForSerial(serialForCache, this.networkId) : undefined;
        const cacheIsFresh = cached && (Date.now() - cached.createdAt < this.DEVICE_INFO_CACHE_MS) && cachedIp === device.ip;

        // Use cache only if:
        // - The caller didn't ask to bypass it
        // - Cache is fresh
        // - Device is not offline (offline devices should always hit network to check if back online)
        if (!bypassCache && cacheIsFresh && !isOffline) {
            // Use cached data
            deviceInfo = cached.deviceInfo as DeviceInfoRaw;
        } else {
            // Set to pending before making network call
            // This prevents unnecessary state flicker (online→pending→online) when using cache
            if (currentStateObject.state !== 'pending') {
                this.setDeviceState({ ip: device.ip, serialNumber: knownSerial }, 'pending');
                this.emitDevicesChanged();
            }

            // Fetch fresh data from network
            try {
                deviceInfo = await this.fetchDeviceInfo(device.ip, 8060);

                if (syntheticDelay) {
                    await this.randomDelay(400, 1_000);
                }
            } catch {
                deviceInfo = undefined;
            }
        }

        // Only apply result if this is still the latest request for this device
        if (this.resolveDeviceSequence.get(device.ip) !== currentSeq) {
            // Stale response - a newer check was started, ignore this result
            return !!deviceInfo;
        }

        if (deviceInfo) {
            // Extract serial from response, fall back to known serial
            const serial = deviceInfo['serial-number']?.toString?.() ?? knownSerial;

            if (serial) {
                // Add to last seen devices (successfully resolved with serial)
                this.globalStateManager.addLastSeenDevice(this.networkId, serial);
            }

            // Update discoveredDevices array (handles mismatch detection internally)
            if ('isDiscovered' in device && device.isDiscovered) {
                this.setDiscoveredDevice(device.ip, serial);
            }

            // Mark any configured devices at this IP with different serials as offline
            this.markMismatchedConfiguredDevicesOffline(device.ip, serial);

            // Only emit if state actually changed
            this.setDeviceState({ ip: device.ip, serialNumber: serial }, 'online');
            this.emitDevicesChanged();
            return true;
        } else {
            // Remove from discoveredDevices (ephemeral - offline devices are removed)
            this.removeDiscoveredDevice(device.ip);

            // Set state to offline on any remaining entries at this IP (configured devices persist)
            this.setDeviceState({ ip: device.ip, serialNumber: knownSerial }, 'offline');

            this.emitDevicesChanged();
            return false;
        }
    }

    /**
     * Check if a newly discovered serial number at an IP represents a mismatch
     * with what we currently have stored. Used to trigger config reload when
     * a device has changed IPs or a different device is now at a known IP.
     *
     * Mismatch scenarios:
     * - Stored IP→serial map has SerialA for IP1, but got SerialB
     * - Discovered device at IP1 had SerialA, but now has SerialB
     *
     * Note: We intentionally don't check configured device serials here.
     * If a user misconfigured a serial, reloading won't fix it and would
     * cause an infinite reload loop.
     *
     * @param ip - The IP address
     * @param newSerial - The newly discovered serial number
     * @returns true if there's a mismatch that warrants reloading configurations
     */
    private checkForSerialMismatch(ip: string, newSerial: string | undefined): boolean {
        if (!newSerial) {
            // No new serial to compare
            return false;
        }

        // Check what serial we have stored for this IP in the IP→serial map
        const storedSerial = this.globalStateManager.getSerialNumberForIp(ip, this.networkId);

        if (storedSerial && storedSerial !== newSerial) {
            // Different device is now at this IP
            return true;
        }


        // Check if any discovered device at this IP has a different serial
        const discoveredDevice = this.discoveredDevices.find(d => d.ip === ip);
        if (discoveredDevice?.serialNumber && discoveredDevice.serialNumber !== newSerial) {
            // Discovered device has a different serial than what's actually at the IP
            return true;
        }

        return false;
    }

    /**
     * Mark configured devices as offline when a different device is found at their IP.
     * Note: resolvedIp is only set during DNS resolution in loadConfiguredDevices(),
     * not updated here when discovering devices.
     */
    private markMismatchedConfiguredDevicesOffline(ip: string, serialNumber: string | undefined): void {
        for (const entry of this.configuredDevices) {
            const isAtThisIp = entry.host === ip || entry.resolvedIp === ip;
            const hasDifferentSerial = entry.serialNumber && serialNumber && entry.serialNumber !== serialNumber;

            if (isAtThisIp && hasDifferentSerial) {
                // Mark the configured entry directly as offline
                entry.state = 'offline';
                entry.stateLastUpdated = Date.now();
            }
        }
    }

    private async healthCheckAllDevices(bypassDeviceCache = false): Promise<void> {
        // Collect all unique IPs from both sources (same serial at different IPs = different entries to check)
        const discoveredIpSet = new Set(this.discoveredDevices.map(entry => entry.ip));
        const allIps = new Set([
            ...this.configuredDevices.map(entry => entry.resolvedIp ?? entry.host),
            ...discoveredIpSet
        ]);

        if (allIps.size === 0) {
            return;
        }

        // Set all to pending and emit before async work
        for (const ip of allIps) {
            this.setDeviceState({ ip: ip }, 'pending');
        }
        this.emitDevicesChanged();

        // Health check all devices - if any discovered device is unhealthy, order a scan
        let needsScan = false;
        await Promise.all([...allIps].map(async (ip) => {
            const isHealthy = await this.resolveDevice({ ip: ip }, { bypassCache: bypassDeviceCache });
            if (!isHealthy && discoveredIpSet.has(ip)) {
                needsScan = true;
            }
        }));

        if (needsScan) {
            this.submitUnhealthyDeviceBroadcast();
        }
    }

    /**
     * In-flight device-info requests by `ip:port`. This is the design doc's "de-dupe rule":
     * within a single refresh flow a device only gets device-info'd once — concurrent callers
     * (e.g. the broadcast response and the reconcile racing on the same device) share one HTTP
     * request instead of each issuing their own. First one in wins; everyone else joins it.
     */
    private inFlightDeviceInfo = new Map<string, Promise<DeviceInfoRaw | undefined>>();

    /**
     * Fetch device info from the network, sharing any request already in flight for the same
     * ip:port (see the de-dupe rule in docs/device-discovery.md). Never rejects — failures
     * return undefined. Success caches the result in globalStateManager for future lookups.
     */
    private fetchDeviceInfo(ip: string, port: number): Promise<DeviceInfoRaw | undefined> {
        const key = `${ip}:${port}`;
        let inFlight = this.inFlightDeviceInfo.get(key);
        if (inFlight === undefined) {
            //safe to share: fetchDeviceInfoInner never rejects (it catches and returns undefined)
            inFlight = this.fetchDeviceInfoInner(ip, port).finally(() => {
                this.inFlightDeviceInfo.delete(key);
            });
            this.inFlightDeviceInfo.set(key, inFlight);
        } else {
        }
        return inFlight;
    }

    /**
     * Fetch device info from the network. Always makes a network request.
     */
    private async fetchDeviceInfoInner(ip: string, port: number): Promise<DeviceInfoRaw> {
        try {
            const info = await rokuDeploy.getDeviceInfo({
                host: ip,
                remotePort: port,
                timeout: DeviceManager.HEALTH_CHECK_TIMEOUT_MS
            });
            if (info['serial-number']) {
                this.globalStateManager.setCachedDevice(info['serial-number'], {
                    serialNumber: info['serial-number'],
                    deviceInfo: info,
                    createdAt: Date.now()
                });
                this.globalStateManager.setSerialNumberForIp(this.networkId, ip, info['serial-number']);
            }

            return info;
        } catch (e) {
            console.error(e);
            return undefined;
        }
    }

    /**
     * Add or update a device in the discoveredDevices array.
     * Handles deduplication by serial number (removes old IP entry if serial matches).
     * Also sets device state using intelligent defaults (cache freshness check).
     */
    private setDiscoveredDevice(ip: string, serialNumber: string | undefined): void {
        // Check for serial mismatch before updating state
        const hasMismatch = this.checkForSerialMismatch(ip, serialNumber);

        // Serial dedupe: if same serial exists at different IP, remove old entry
        if (serialNumber) {
            const oldIdx = this.discoveredDevices.findIndex(d => d.ip !== ip && d.serialNumber === serialNumber);
            if (oldIdx >= 0) {
                const oldIp = this.discoveredDevices[oldIdx].ip;
                // Transfer lastUsedDeviceIp to new IP if it was pointing to old IP
                if (this.lastUsedDeviceIp === oldIp) {
                    this.lastUsedDeviceIp = ip;
                }
                this.discoveredDevices.splice(oldIdx, 1);
            }
        }

        // IP dedupe: find existing entry at same IP
        const existingIdx = this.discoveredDevices.findIndex(d => d.ip === ip);
        const existing = existingIdx >= 0 ? this.discoveredDevices[existingIdx] : undefined;

        if (existing) {
            // Update existing entry (preserve state fields so setDeviceState below sees the prior state)
            this.discoveredDevices[existingIdx] = {
                ...existing,
                ip: ip,
                serialNumber: serialNumber ?? existing.serialNumber
            };
        } else {
            // Add new entry
            this.discoveredDevices.push({
                ip: ip,
                serialNumber: serialNumber
            });
        }

        // Set device state using intelligent defaults (preserves existing online state or uses cache freshness)
        this.setDeviceState({ serialNumber: serialNumber, ip: ip });

        // If this is the active device and it showed up at a new IP, re-point the active device at it
        const activeDevice = this.context.workspaceState.get<ActiveDeviceEntry>(DeviceManager.ACTIVE_DEVICE_STATE_KEY);
        if (serialNumber && activeDevice?.serialNumber === serialNumber && activeDevice.ip !== ip) {
            this.syncActiveDevice().catch(() => { });
        }

        // If a different device is now at this IP, reload configurations
        if (hasMismatch) {
            this.loadConfiguredDevices().catch(() => { });
        }
    }

    /**
     * Remove a discovered device by IP. Clears from discoveredDevices array,
     * clears lastUsedDeviceIp if it matches, and removes from lastSeenDevices cache.
     */
    private removeDiscoveredDevice(ip: string): void {
        // Find the device first to get its serial number
        const idx = this.discoveredDevices.findIndex(d => d.ip === ip);
        if (idx < 0) {
            return;
        }

        const device = this.discoveredDevices[idx];
        this.discoveredDevices.splice(idx, 1);

        // Clear lastUsedDeviceIp if it matches
        if (this.lastUsedDeviceIp === ip) {
            this.lastUsedDeviceIp = undefined;
        }

        // Remove from lastSeenDevices if we have a serial
        if (device?.serialNumber) {
            this.globalStateManager.removeLastSeenDevice(this.networkId, device.serialNumber);
        }
    }

    /**
     * Find configured and discovered device entries by key or lookup criteria.
     * Key format: "s:{serialNumber}" or "i:{ip}"
     * Lookup format: { ip?: string; serialNumber?: string }
     */
    private findDeviceEntries(keyOrLookup: string | { ip?: string; serialNumber?: string }): {
        configured: ConfiguredDeviceEntry | undefined;
        discovered: DiscoveredDeviceEntry | undefined;
    } {
        let configured: ConfiguredDeviceEntry | undefined;
        let discovered: DiscoveredDeviceEntry | undefined;

        if (typeof keyOrLookup === 'string') {
            // Decode encoded key
            const key = keyOrLookup;
            if (key.startsWith('s:')) {
                const serial = key.slice(2);
                if (serial) {
                    configured = this.configuredDevices.find(c => c.serialNumber === serial);
                    discovered = this.discoveredDevices.find(d => d.serialNumber === serial);
                }
            } else if (key.startsWith('i:')) {
                const ip = key.slice(2);
                if (ip) {
                    configured = this.configuredDevices.find(c => c.resolvedIp === ip || c.host === ip);
                    discovered = this.discoveredDevices.find(d => d.ip === ip);
                }
            }
        } else {
            // Lookup object
            const lookup = keyOrLookup;

            if (lookup.serialNumber) {
                configured = this.configuredDevices.find(c => c.serialNumber === lookup.serialNumber);
                discovered = this.discoveredDevices.find(d => d.serialNumber === lookup.serialNumber);
            }

            if (lookup.ip) {
                if (!configured) {
                    configured = this.configuredDevices.find(c => c.resolvedIp === lookup.ip || c.host === lookup.ip);
                }
                if (!discovered) {
                    discovered = this.discoveredDevices.find(d => d.ip === lookup.ip);
                }
            }
        }

        return { configured: configured, discovered: discovered };
    }

    /**
     * Build a merged RokuDevice from configured and discovered entries.
     * At least one of configured or discovered must be provided.
     */
    private buildMergedDevice(
        configuredEntry: ConfiguredDeviceEntry | undefined,
        discoveredEntry: DiscoveredDeviceEntry | undefined
    ): RokuDevice | undefined {
        if (!configuredEntry && !discoveredEntry) {
            return undefined;
        }

        // Determine IP: discovered > resolvedIp > host
        let ip: string;
        if (discoveredEntry) {
            ip = discoveredEntry.ip;
        } else if (configuredEntry?.resolvedIp) {
            ip = configuredEntry.resolvedIp;
        } else {
            ip = configuredEntry.host;
        }

        // Determine serial: configured > discovered > cache
        // Configured is user's explicit config, discovered is fresh network data,
        // cache is fallback for initial load before discovery runs
        const serialNumber = configuredEntry?.serialNumber ??
            discoveredEntry?.serialNumber ??
            this.globalStateManager.getSerialNumberForIp(ip, this.networkId);

        // Determine state: discovered > configured > unknown (discovered is ground truth)
        const deviceState = discoveredEntry?.state ?? configuredEntry?.state ?? 'unknown';
        // Determine previous state: discovered > configured > unknown (discovered is ground truth)
        const lastState = discoveredEntry?.lastState ?? configuredEntry?.lastState ?? 'unknown';

        // Build key
        const key = serialNumber ? `s:${serialNumber}` : `i:${ip}`;

        // Hydrate deviceInfo from cache
        const cached = serialNumber ? this.globalStateManager.getCachedDevice(serialNumber) : undefined;

        return {
            ip: ip,
            serialNumber: serialNumber,
            key: key,
            deviceState: deviceState,
            lastDeviceState: lastState,
            deviceInfo: cached?.deviceInfo ?? {},
            isDiscovered: !!discoveredEntry,
            isConfigured: !!configuredEntry,
            configuredIn: configuredEntry?.configuredIn,
            configuredName: configuredEntry?.name,
            configuredPassword: configuredEntry?.password ?? this.getDefaultPassword()
        };
    }

    /**
     * Handle device-online event from RokuFinder. Shows a notification if enabled.
     * Does not eagerly device-info the device — lazy hydration on read handles that
     * once a view actually asks for the device list (spec: Passive SSDP announcements).
     */
    private handleDeviceOnline(ip: string, serialNumber?: string): void {
        if (!this.showInfoMessages) {
            return;
        }

        // Use provided serial, fall back to IP→serial mapping if not provided
        const actualSerial = serialNumber ?? this.globalStateManager.getSerialNumberForIp(ip, this.networkId);

        // Get cached device directly from globalStateManager
        const cachedDevice = actualSerial
            ? this.globalStateManager.getCachedDevice(actualSerial)
            : undefined;

        // Get display name from cache
        const fallbackName = actualSerial ? `${ip} (${actualSerial})` : ip;
        const displayName = cachedDevice?.deviceInfo?.['default-device-name'] ?? fallbackName;
        const notifierId = actualSerial ?? ip;

        if (!this.deviceOnlineNotifiers.has(notifierId)) {
            this.deviceOnlineNotifiers.set(notifierId, debounce((name: string) => {
                this.deviceOnlineNotifiers.delete(notifierId);
                void util.showTimedNotification(`Device Online: ${name}`);
            }, 500));
        }
        this.deviceOnlineNotifiers.get(notifierId)(displayName);
    }

    private async activateMonitoring() {
        this.networkChangeMonitor.start();

        //periodically submit `stale` broadcast/reconcile orders so long-lived sessions
        //eventually refresh (the spec's "it's been a while" timers; views decide whether and
        //how to fulfill them — visible views deliberately ignore live `stale` orders)
        this.stopStaleTimers();
        this.broadcastStaleTimer = setInterval(() => {
            this.submitOrders([{ type: 'broadcast', reason: 'stale' }]);
        }, this.STALE_SCAN_THRESHOLD_MS);
        this.reconcileStaleTimer = setInterval(() => {
            this.submitOrders([{ type: 'reconcile', reason: 'stale' }]);
        }, this.STALE_RECONCILE_INTERVAL_MS);
        //don't keep the process alive just for these timers
        this.broadcastStaleTimer?.unref?.();
        this.reconcileStaleTimer?.unref?.();

        await this.startRokuFinder();
    }

    private deactivateMonitoring() {
        this.networkChangeMonitor.stop();
        this.stopStaleTimers();
        this.stopRokuFinder();
    }

    private stopStaleTimers() {
        if (this.broadcastStaleTimer) {
            clearInterval(this.broadcastStaleTimer);
            this.broadcastStaleTimer = undefined;
        }
        if (this.reconcileStaleTimer) {
            clearInterval(this.reconcileStaleTimer);
            this.reconcileStaleTimer = undefined;
        }
    }

    /**
     * Set up event listeners for the RokuFinder.
     * This must be called regardless of deviceDiscoveryEnabled so that
     * active scan responses are processed.
     */
    private setupFinderListeners() {
        this.finder.removeAllListeners();
        this.finder.on('found', (ip: string, options?: { serialNumber?: string }) => {
            this.setDiscoveredDevice(ip, options?.serialNumber);
            //no eager resolve here: this emit makes any visible view re-read the list, and a
            //responder whose cache missed the 5-min freshness check lands in `unknown` — which
            //lazy hydration on read always resolves (spec: "hydrate it immediately", routed
            //through the views-as-the-gate read path)
            this.emitDevicesChanged();
        });

        this.finder.on('device-online', (ip: string, serialNumber?: string) => {
            this.handleDeviceOnline(ip, serialNumber);
        });

        this.finder.on('lost', (ip: string) => {
            this.removeDiscoveredDevice(ip);
            this.emitDevicesChanged();
        });

        // Forward scan events from RokuFinder
        this.finder.on('scan-started', () => {
            this.emitter.emit('scan-started');
        });

        this.finder.on('scan-ended', () => {
            this.emitter.emit('scan-ended');
            //devices that didn't respond to the scan are NOT eagerly health-checked here —
            //lazy hydration on read covers them the next time a view asks for the list
        });
    }

    /**
     * Restart the RokuFinder to rebind UDP sockets to new network interfaces.
     * Called when network changes to ensure SSDP can communicate on the new network.
     */
    private restartRokuFinder() {
        // Keep reference to old finder for delayed disposal
        const oldFinder = this.finder;

        // Create new finder instance
        this.finder = new RokuFinder(this.globalStateManager, this.makeFinderLogger());

        // Re-attach event listeners
        this.setupFinderListeners();

        // Dispose old finder
        oldFinder?.dispose();

        // Restart if device discovery is enabled
        if (this.deviceDiscoveryEnabled) {
            this.startRokuFinder().catch((e) => {
                console.error('Failed to restart RokuFinder:', e);
            });
        }
    }

    /**
     * Start listening for passive SSDP announcements from Roku devices
     */
    private async startRokuFinder() {
        await this.finder.start();
        const ts = new Date().toLocaleTimeString();
        this.makeFinderLogger()(`[${ts}] RokuFinder started — passive ssdp:alive monitoring active`);
    }

    private stopRokuFinder() {
        this.finder.stop();
    }

    private notifyFocusGained() {
        this.networkChangeMonitor.start();
    }

    private notifyFocusLost() {
        this.networkChangeMonitor.stop();
    }

    private emitDevicesChanged = throttleBounce(() => {
        this.emitter.emit('devices-changed');
    }, this.DEVICES_CHANGED_DEBOUNCE_MS);

    private async randomDelay(min: number, max: number) {
        const randomness = min + (Math.random() * (max - min));
        await util.sleep(randomness);
    }
}

export type DeviceState = 'offline' | 'unknown' | 'pending' | 'online';

//order types live with the Orders class; re-exported here so consumers keep one import site
export type { Order, OrderType, BroadcastReason, ReconcileReason } from './Orders';

/**
 * Payload of the `broadcast-ordered` event: the submitted order's reason plus when it was
 * submitted (ms epoch).
 */
export interface BroadcastOrder {
    reason: BroadcastReason;
    timestamp: number;
}

/**
 * Payload of the `reconcile-ordered` event.
 */
export interface ReconcileOrder {
    reason: ReconcileReason;
    timestamp: number;
}

export type PasswordValidationResult = 'ok' | 'bad-password' | 'unreachable';

export type ConfigurationScope = 'user' | 'workspace';

/**
 * A resolved host paired with the raw `device-info` gathered while probing it. Returned by the
 * host-resolution flows (device picker, manual entry, active-host lookup) so callers can reuse the
 * device info without issuing another request to the device.
 */
export interface HostWithDeviceInfo {
    host: string;
    deviceInfo: DeviceInfoRaw;
}

/**
 * User-configured device from settings (brightscript.devices)
 */
export interface ConfiguredDevice {
    host: string;
    name?: string;
    serialNumber?: string;
    password?: string;
}

/**
 * Internal: configured device from settings
 * Extends the raw settings shape with runtime tracking fields.
 * Persists even when device goes offline.
 */
interface ConfiguredDeviceEntry extends ConfiguredDevice {
    /**
     * IP from DNS lookup (updated on resolution)
     */
    resolvedIp?: string;
    /**
     * Which settings scopes this device is configured in
     */
    configuredIn?: ConfigurationScope[];
    /**
     * Current device state (inline on entry)
     */
    state?: DeviceState;
    /**
     * Previous state, updated by setDeviceState before each transition. Undefined when no
     * state has been recorded yet — readers should treat that as 'unknown'.
     */
    lastState?: DeviceState;
    /**
     * Timestamp of last state update
     */
    stateLastUpdated?: number;
}

/**
 * Internal: discovered device from network
 * Removed when device goes offline (ephemeral)
 */
interface DiscoveredDeviceEntry {
    /**
     * Current IP from SSDP/resolution
     */
    ip: string;
    /**
     * Serial number from device-info response
     */
    serialNumber?: string;
    /**
     * Current device state (inline on entry)
     */
    state?: DeviceState;
    /**
     * Previous state, updated by setDeviceState before each transition. Undefined when no
     * state has been recorded yet — readers should treat that as 'unknown'.
     */
    lastState?: DeviceState;
    /**
     * Timestamp of last state update
     */
    stateLastUpdated?: number;
}

/**
 * Device state with timestamp, returned by getDeviceState
 */
interface DeviceStateEntry {
    state: DeviceState;
    lastUpdated: number;
}

/**
 * Active device pointer persisted in workspaceState under `DeviceManager.ACTIVE_DEVICE_STATE_KEY`.
 * The serial number is the durable identity; the ip is the last IP the device was seen at.
 */
export interface ActiveDeviceEntry {
    serialNumber?: string;
    ip?: string;
}

/**
 * Full device details returned by public API
 * Built on-demand by merging configured and discovered device data
 */
export interface RokuDevice {
    /**
     * Computed IP from resolution order: discovered > resolvedIp > host
     */
    ip: string;
    /**
     * Serial number from discovered or configured
     */
    serialNumber?: string;
    /**
     * Encoded device key: "s:{serial}" or "i:{ip}"
     */
    key: string;
    /**
     * Device state: online, offline, pending (currently checking), or unknown (never checked)
     */
    deviceState: DeviceState;
    /**
     * Previous device state: online, offline, pending (currently checking), or unknown (never checked)
     */
    lastDeviceState: DeviceState;
    /**
     * Cached device info from GlobalStateManager
     */
    deviceInfo: Record<string, any>;
    /**
     * True if device exists in discoveredDevices array
     */
    isDiscovered: boolean;
    /**
     * True if device exists in configuredDevices array
     */
    isConfigured: boolean;
    /**
     * Which settings scopes this device is configured in
     */
    configuredIn?: ConfigurationScope[];
    /**
     * User-provided name from config
     */
    configuredName?: string;
    /**
     * User-provided password from config
     */
    configuredPassword?: string;
}

function throttleBounce<T extends (...args: any[]) => void>(
    callback: T,
    threshold: number
): (...args: Parameters<T>) => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: Parameters<T> | undefined;
    function onTimer() {
        if (pending) {
            callback(...pending);
            pending = undefined;
            timer = setTimeout(onTimer, threshold);
        } else {
            timer = undefined;
        }
    }

    return (...args: Parameters<T>) => {
        if (!timer) {
            callback(...args);
            timer = setTimeout(onTimer, threshold);
        } else {
            pending = args;
        }
    };
}
