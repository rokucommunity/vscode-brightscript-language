import * as vscode from 'vscode';
import { EventEmitter } from 'eventemitter3';
import type { DeviceManager } from '../deviceDiscovery/DeviceManager';
import { util } from '../util';
import { vscodeContextManager } from './VscodeContextManager';

/**
 * Every experimental feature the extension can gate. Each value doubles as the settings key suffix
 * (`brightscript.experimental.<feature>`) and the context key suffix used by package.json `when`
 * clauses (view and command visibility).
 */
export enum ExperimentalFeature {
    rokuCloudEmulator = 'rokuCloudEmulator'
}

/**
 * Owns the `brightscript.experimental.*` feature flags. `brightscript.experimental.all` enables
 * every feature at once; otherwise each feature's own setting decides.
 *
 * Features toggle live: the context keys that drive UI visibility (views, command palette
 * entries) follow the settings immediately, and runtime consumers either read `isEnabled` at the
 * moment they act or subscribe to `onEnablementChanged` (for example RceManager, which reports
 * "no token" while its feature is disabled and re-announces on every toggle).
 */
export class ExperimentalFeaturesManager {
    constructor(private context: vscode.ExtensionContext) {
        for (const feature of Object.values(ExperimentalFeature)) {
            const enabled = this.isEnabled(feature);
            this.lastKnownEnablement.set(feature, enabled);
            void vscodeContextManager.set(`brightscript.experimental.${feature}`, enabled);
        }
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration('brightscript.experimental')) {
                    this.handleConfigurationChange();
                }
            })
        );
    }

    private emitter = new EventEmitter();

    private deviceManager: DeviceManager | undefined;

    /**
     * Late-bound: the device manager is constructed after this manager (it sits behind the RCE
     * finder, which already needs these flags). Used to recognize cloud devices when cleaning up
     * after the Roku Cloud Emulator feature turns off.
     */
    public setDeviceManager(deviceManager: DeviceManager) {
        this.deviceManager = deviceManager;
    }

    /**
     * The enablement each feature most recently reported, so only real transitions emit events (a
     * settings edit that lands on the same effective value, like flipping an individual feature
     * while `all` is on, must not re-announce)
     */
    private lastKnownEnablement = new Map<ExperimentalFeature, boolean>();

    /**
     * Whether the feature is enabled right now (its own setting, or `experimental.all`)
     */
    public isEnabled(feature: ExperimentalFeature): boolean {
        const brightscriptConfig = util.getConfiguration('brightscript');
        return (brightscriptConfig.get<boolean>('experimental.all') ?? false) ||
            (brightscriptConfig.get<boolean>(`experimental.${feature}`) ?? false);
    }

    /**
     * Register a handler that fires whenever a feature's effective enablement changes
     */
    public onEnablementChanged(handler: (feature: ExperimentalFeature, enabled: boolean) => void): () => void {
        this.emitter.on('enablement-changed', handler);
        return () => {
            this.emitter.off('enablement-changed', handler);
        };
    }

    private handleConfigurationChange() {
        for (const feature of Object.values(ExperimentalFeature)) {
            const enabled = this.isEnabled(feature);
            if (enabled !== this.lastKnownEnablement.get(feature)) {
                this.lastKnownEnablement.set(feature, enabled);
                void vscodeContextManager.set(`brightscript.experimental.${feature}`, enabled);
                this.emitter.emit('enablement-changed', feature, enabled);
                if (feature === ExperimentalFeature.rokuCloudEmulator && !enabled) {
                    this.clearRceDeviceIdentityKeys();
                }
            }
        }
    }

    /**
     * Disabling the Roku Cloud Emulator feature must not leave a cloud device as the workspace's
     * active or remote-control device, where pickers and remote commands would keep targeting it.
     * The keys are resolved and checked synchronously, while the device manager's cloud inventory
     * is still present: the finder's empty emission that follows the same toggle (see RceManager's
     * token-changed bridge) lands a microtask later at the earliest.
     */
    private clearRceDeviceIdentityKeys() {
        for (const workspaceStateKey of ['activeDeviceKey', 'remoteControlDeviceKey']) {
            const storedDeviceKey = this.context.workspaceState.get<string>(workspaceStateKey);
            if (storedDeviceKey && this.deviceManager?.getDevice(storedDeviceKey)?.rce) {
                void this.context.workspaceState.update(workspaceStateKey, undefined);
            }
        }
    }
}
