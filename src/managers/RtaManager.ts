import * as fs from 'fs';
import * as path from 'path';
import * as rta from 'roku-test-automation';
import type { DeviceConfig } from 'roku-deploy';
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
            void this.onDeviceComponent?.shutdown();
            this.onDeviceComponent = undefined;
            void vscodeContextManager.set('brightscript.isOnDeviceComponentAvailable', false);
            this.updateDeviceAvailabilityOnWebViewProviders();
        }));
    }

    public onDeviceComponent?: rta.OnDeviceComponent;
    public device?: rta.RokuDevice;

    /**
     * Whether the most recent debug session addressed a Roku Cloud Emulator device. RTA reaches a
     * device by LAN host, which an RCE device does not have, so the RTA-driven webviews hide their
     * UI behind an explanatory message while this is true. Cleared when that debug session ends
     * (see onDidTerminateDebugSession) or when RTA is set up against a LAN device.
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
     * Set up RTA against a manually entered host (the RDB view's manual-ip flow). Always uses the
     * given host - it must never fall back to the remote-control device key, which could point at a
     * stale device from a previous session.
     */
    public setupRtaWithManualHost(config: { host: string; password: string; injectRdbOnDeviceComponent?: boolean }) {
        this.isRceDebugSession = false;
        this.finishSetup({ host: config.host, password: config.password }, config);
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
     * A brightscript debug session ended. An RCE session's unsupported-message state ends with it,
     * so the RTA-driven views fall back to their normal setup-steps UI.
     */
    public onDidTerminateDebugSession() {
        if (this.isRceDebugSession) {
            this.isRceDebugSession = false;
            this.updateDeviceAvailabilityOnWebViewProviders();
        }
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
}
