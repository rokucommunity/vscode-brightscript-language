import * as fs from 'fs';
import * as path from 'path';
import * as rta from 'roku-test-automation';
import type { DeviceConfig } from 'roku-deploy';
import { isRceDeviceConfig } from 'roku-deploy';
import * as vscode from 'vscode';
import { ViewProviderEvent } from '../viewProviders/ViewProviderEvent';
import { ViewProviderId } from '../viewProviders/ViewProviderId';
import { vscodeContextManager } from './VscodeContextManager';
import type { WebviewViewProviderManager } from './WebviewViewProviderManager';
import type { RceManager } from './RceManager';
import type { DeviceManager } from '../deviceDiscovery/DeviceManager';
import { VscodeCommand } from '../commands/VscodeCommand';

export class RtaManager {
    constructor(
        private context: vscode.ExtensionContext,
        private rceManager: RceManager,
        private deviceManager: DeviceManager
    ) {
        context.subscriptions.push(vscode.commands.registerCommand(VscodeCommand.disconnectFromDevice, () => {
            this.disconnectFromDevice();
        }));
    }

    public onDeviceComponent?: rta.OnDeviceComponent;
    public device?: rta.RokuDevice;

    /**
     * Whether RTA is currently pointed at a Roku Cloud Emulator device, set either by a debug
     * session's sideload (setupRtaWithConfig) or by a manual device-picker connect
     * (setupRtaWithDeviceTarget) - RTA reaches a device by LAN host, which an RCE device does not
     * have, so the RTA-driven webviews hide their UI behind an explanatory message while this is
     * true. Cleared when the debug session ends (see onDidTerminateDebugSession) or when RTA is
     * subsequently set up against a LAN device.
     */
    public isRceDebugSession = false;

    private webviewViewProviderManager?: WebviewViewProviderManager;
    private lastAppUIResponse: rta.AppUIResponse | undefined;

    /**
     * Set up RTA for a sideloaded channel. The device is never taken from the launch config -
     * `device`/`host` on a launch config can hold an unresolved placeholder or a config-side
     * choice that predates a later sideload - so this resolves the device the same way the rest of
     * the extension does: through the remote-control device key DebugConfigurationProvider updates
     * on every launch resolve. `config.host` is a fallback for a host the device manager never
     * discovered (e.g. a hardcoded LAN host with no SSDP presence).
     */
    public async setupRtaWithConfig(config: { device?: DeviceConfig; host?: string; password: string; logLevel?: string; disableScreenSaver?: boolean; injectRdbOnDeviceComponent?: boolean }) {
        const remoteControlDeviceKey = this.context.workspaceState.get<string>('remoteControlDeviceKey');
        const resolvedDevice = remoteControlDeviceKey ? this.deviceManager.getDevice(remoteControlDeviceKey) : undefined;

        this.isRceDebugSession = !!resolvedDevice?.rce;

        let device: rta.DeviceConfigOptions;
        if (resolvedDevice?.rce) {
            device = {
                id: resolvedDevice.rce.id,
                esn: resolvedDevice.serialNumber,
                instanceUrl: resolvedDevice.rce.instanceUrl,
                password: config.password
            };
            //the launch config's rceToken is deliberately scrubbed before it reaches here (see
            //DebugConfigurationProvider), so RtaManager fetches the token itself
            device.rceToken = await this.rceManager.getToken();
            if (!device.rceToken) {
                console.warn('RtaManager: no Cloud Emulator token is available; RTA requests to this device will fail authentication');
            }
        } else if (resolvedDevice?.ip) {
            device = { host: resolvedDevice.ip, password: config.password };
        } else if (config.host) {
            device = { host: config.host, password: config.password };
        }

        if (!device) {
            //RTA cannot be set up without a way to address the device, but the webviews still need to
            //hear about the device change (an RCE session with no address hides the RTA-driven views
            //behind an unsupported message)
            this.updateDeviceAvailabilityOnWebViewProviders();
            return;
        }

        this.finishSetup(device, config);
    }

    /**
     * Set up RTA against a device resolved through the shared device-picker/password flow (the RDB
     * views' "Connect to a Device" button). Always uses the given target - it must never fall back
     * to the remote-control device key, which could point at a stale device from a previous
     * session.
     */
    public async setupRtaWithDeviceTarget(deviceConfig: DeviceConfig, password: string, config: { injectRdbOnDeviceComponent?: boolean } = {}) {
        this.isRceDebugSession = isRceDeviceConfig(deviceConfig);

        let device: rta.DeviceConfigOptions;
        if (isRceDeviceConfig(deviceConfig)) {
            device = { ...deviceConfig, password: password };
            if (!device.rceToken) {
                //the resolved target's device config didn't already carry a token (e.g. it was
                //scrubbed somewhere upstream), so fetch one directly
                device.rceToken = await this.rceManager.getToken();
                if (!device.rceToken) {
                    throw new Error('No Roku Cloud Emulator token available; cannot connect to this device');
                }
            }
        } else if (deviceConfig.host) {
            device = { host: deviceConfig.host, password: password };
        } else {
            throw new Error('The resolved device target has neither a host nor a Roku Cloud Emulator identity; cannot connect to it');
        }

        this.finishSetup(device, config);
    }

    private finishSetup(device: rta.DeviceConfigOptions, config: { logLevel?: string; disableScreenSaver?: boolean; injectRdbOnDeviceComponent?: boolean }) {
        const enableDebugging = ['info', 'debug', 'trace'].includes(config.logLevel);
        const rtaConfig: rta.ConfigOptions = {
            RokuDevice: {
                devices: [device]
            },
            OnDeviceComponent: {
                logLevel: enableDebugging ? 'verbose' : undefined,
                clientDebugLogging: enableDebugging,
                disableTelnet: true,
                disableCallOriginationLine: true
            }
        };

        //the ODC singleton would otherwise keep sending requests over its existing socket to the
        //previous device once setConfig re-points it at a new one
        void this.onDeviceComponent?.shutdown();

        rta.odc.setConfig(rtaConfig);

        rta.ecp.setConfig(rtaConfig);

        this.device = rta.device;

        if (config.injectRdbOnDeviceComponent) {
            this.onDeviceComponent = rta.odc;
        } else {
            void this.onDeviceComponent?.shutdown();
            this.onDeviceComponent = undefined;
        }
        void vscodeContextManager.set('brightscript.isOnDeviceComponentAvailable', !!this.onDeviceComponent);

        this.updateDeviceAvailabilityOnWebViewProviders();

        if (config.disableScreenSaver !== false) {
            void this.onDeviceComponent?.disableScreenSaver({ disableScreensaver: true });
        }
    }

    public async sendOdcRequest(requestorId: string, command: string, context: { args: any; options: any }) {
        const { args, options } = context;

        if (command === rta.RequestType.writeFile) {
            // We can't access files from the webview so we just store the path and access it in node instead
            const directoryPath = path.dirname(args.destinationPath);
            // We always try to make the directory. Doesn't fail if it already exists
            await rta.odc.createDirectory({
                path: directoryPath
            });

            return rta.odc.writeFile({
                binaryPayload: fs.readFileSync(args.sourcePath),
                path: args.destinationPath
            }, options);
        } else {
            const result = await this.onDeviceComponent[command](args, options);
            return result;
        }
    }

    public async getAppUI(requestorId: string) {
        this.lastAppUIResponse = await rta.ecp.getAppUI(this.onDeviceComponent);

        const viewIds = [];
        if (requestorId === ViewProviderId.rokuDeviceView) {
            viewIds.push(ViewProviderId.sceneGraphInspectorView);
        } else if (requestorId === ViewProviderId.sceneGraphInspectorView) {
            viewIds.push(ViewProviderId.rokuDeviceView);
        }

        // We want to notify the other view providers that the app UI has been updated. Not sending actual payload to avoid overhead if they aren't interested in it
        this.webviewViewProviderManager.sendMessageToWebviews(viewIds, {
            event: ViewProviderEvent.onStoredAppUIUpdated
        });
        return this.lastAppUIResponse;
    }

    public getStoredAppUI() {
        return this.lastAppUIResponse;
    }

    /**
     * A brightscript debug session ended. The ODC connection lives inside the sideloaded channel,
     * which roku-debug kills at session end, so it can never survive the session and must be torn
     * down here; the device itself stays reachable (ECP, screenshots), so `device` and RTA's ecp
     * config are left alone. An RCE session's unsupported-message state ends with it too, so the
     * RTA-driven views fall back to their normal setup-steps UI.
     */
    public onDidTerminateDebugSession() {
        void this.onDeviceComponent?.shutdown();
        this.onDeviceComponent = undefined;
        this.lastAppUIResponse = undefined;
        void vscodeContextManager.set('brightscript.isOnDeviceComponentAvailable', false);

        this.isRceDebugSession = false;

        this.updateDeviceAvailabilityOnWebViewProviders();
    }

    /**
     * The "Disconnect from Device" title button. Unlike onDidTerminateDebugSession's ODC-only
     * teardown, this is an explicit user action to leave the device entirely, so it is a full
     * reset: the device itself is forgotten too (deviceAvailable goes false), not just the ODC
     * connection.
     */
    public disconnectFromDevice() {
        void this.onDeviceComponent?.shutdown();
        this.onDeviceComponent = undefined;
        this.device = undefined;
        this.lastAppUIResponse = undefined;
        void vscodeContextManager.set('brightscript.isOnDeviceComponentAvailable', false);

        this.isRceDebugSession = false;

        this.notifyWebViewProvidersOfDisconnect();
        this.updateDeviceAvailabilityOnWebViewProviders();
    }

    public setWebviewViewProviderManager(manager: WebviewViewProviderManager) {
        this.webviewViewProviderManager = manager;
    }

    private updateDeviceAvailabilityOnWebViewProviders() {
        for (const webviewProvider of this.webviewViewProviderManager.getWebviewViewProviders()) {
            if (typeof webviewProvider.updateDeviceAvailability === 'function') {
                webviewProvider.updateDeviceAvailability();
            }
        }
    }

    /**
     * Only disconnectFromDevice's full reset fires this - unlike updateDeviceAvailabilityOnWebViewProviders,
     * which also runs on normal setup and session termination, where a webview's own device-decoupled
     * state (e.g. a Cloud Emulator stream watched independently of RTA) must be left alone.
     */
    private notifyWebViewProvidersOfDisconnect() {
        for (const webviewProvider of this.webviewViewProviderManager.getWebviewViewProviders()) {
            if (typeof webviewProvider.onDeviceDisconnected === 'function') {
                webviewProvider.onDeviceDisconnected();
            }
        }
    }
}
