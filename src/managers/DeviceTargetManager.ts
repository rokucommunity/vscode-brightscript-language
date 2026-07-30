import * as vscode from 'vscode';
import type { DeviceConfig } from 'roku-deploy';
import { util } from '../util';
import type { DeviceManager, RokuDevice } from '../deviceDiscovery/DeviceManager';
import type { UserInputManager } from './UserInputManager';

/**
 * Resolves which device a command should target - and with what credentials - from the various
 * shapes commands receive: a Devices view tree element, a bare LAN host string, the active device,
 * or nothing at all (the shared device picker). LAN and Roku Cloud Emulator devices resolve the
 * same way; every target comes back as a roku-deploy device config.
 */
export class DeviceTargetManager {
    constructor(
        private context: vscode.ExtensionContext,
        private deviceManager: DeviceManager,
        private userInputManager: UserInputManager
    ) { }

    /**
     * Resolve a device reference - the argument shape every device-targeted command receives -
     * into what the device manager knows about it:
     * - a Devices view tree element (or full RokuDevice), `{key}`, resolves through the device
     *   manager (this is how a Roku Cloud Emulator device flows in; it has no host)
     * - a bare string is a LAN host, passed through untouched (deliberately not looked up, so
     *   callers keep their own probe/synthesized-key semantics for unknown hosts)
     * - nothing shows the shared device picker, where a cloud pick resolves back to a RokuDevice
     *   via its precomputed device option
     *
     * Both fields are undefined when nothing was resolved (unknown key, or picker dismissed).
     */
    public async resolveDeviceReference(reference?: string | { key?: string }): Promise<{ device: RokuDevice | undefined; host: string | undefined }> {
        let device: RokuDevice | undefined;
        let host: string | undefined;
        if (typeof reference === 'object' && reference?.key) {
            device = this.deviceManager.getDevice(reference.key);
            host = device?.ip;
        } else if (typeof reference === 'string') {
            host = reference;
        }

        if (!device && !host) {
            try {
                const picked = await this.userInputManager.promptForHost();
                host = picked?.host;
                device = picked?.device
                    ? this.deviceManager.getDeviceByDeviceConfig(picked.device)
                    : undefined;
            } catch {
                // promptForHost rejects when the user dismisses the picker; treat as a cancel.
            }
        }
        return { device: device, host: host };
    }

    /**
     * Resolve the device a command should target when no explicit reference was given: an explicit
     * reference wins, then the remote-control device (`remoteDeviceKey` - follows the last
     * sideload, the last remote pick, and Set as Active Device), then the
     * `brightscript.remoteControl` host setting (a local device by definition), then the shared
     * device picker.
     *
     * Returns undefined when nothing was resolved (picker dismissed).
     */
    public async resolveActiveTargetDevice(reference?: string | { key?: string }): Promise<DeviceTarget | undefined> {
        if (!reference) {
            const remoteDeviceKey = this.context.workspaceState.get<string>('remoteDeviceKey');
            const remoteDevice = remoteDeviceKey ? this.deviceManager.getDevice(remoteDeviceKey) : undefined;
            if (remoteDevice) {
                return { device: remoteDevice.device, serialNumber: remoteDevice.serialNumber, label: this.deviceManager.getDeviceDisplayName(remoteDevice, true) };
            }
            const configHost = util.getConfiguration('brightscript.remoteControl').get<string>('host');
            // eslint-disable-next-line no-template-curly-in-string
            reference = configHost !== '${promptForHost}' ? configHost : undefined;
        }
        return this.resolveTargetDevice(reference);
    }

    /**
     * Resolve the device a device-targeted command should act on, as a roku-deploy device config
     * plus the serial number and display label the password/confirmation flow needs.
     *
     * The reference resolves through `resolveDeviceReference` (tree element / host string /
     * device picker; these are device-specific actions, so we never silently fall back to the
     * active device). A bare host is probed so the caller has a fresh serial number for password
     * lookup and a friendly display label for prompts.
     *
     * Returns undefined when the user cancels device selection.
     */
    public async resolveTargetDevice(reference?: string | { key?: string }): Promise<DeviceTarget | undefined> {
        const { device, host } = await this.resolveDeviceReference(reference);

        if (device) {
            return { device: device.device, serialNumber: device.serialNumber, label: this.deviceManager.getDeviceDisplayName(device, true) };
        }
        if (!host) {
            return undefined;
        }

        const probed = await this.deviceManager.validateAndAddDevice(host);
        const label = probed ? this.deviceManager.getDeviceDisplayName(probed, true) : host;
        return { device: { host: host }, serialNumber: probed?.serialNumber, label: label };
    }

    /**
     * Resolve a developer password the device accepts, delegating the candidate/validate/prompt/
     * persist flow to the shared resolver. The global `remotePassword` fallback is offered as an
     * extra candidate. Shows an error and returns undefined when the device is unreachable, and
     * returns undefined when the user cancels the prompt.
     */
    public async resolveValidatedPassword(device: DeviceConfig, serialNumber: string | undefined, label: string): Promise<string | undefined> {
        const resolution = await this.userInputManager.resolveDevicePassword({
            device: device,
            serialNumber: serialNumber,
            extraCandidates: [await this.context.workspaceState.get('remotePassword')]
        });
        if (resolution.status === 'unreachable') {
            void vscode.window.showErrorMessage(`Device '${label}' is unreachable.`);
            return undefined;
        }
        if (resolution.status === 'cancelled') {
            return undefined;
        }
        return resolution.password;
    }
}

/**
 * A resolved command target: the roku-deploy device config to address it by, plus the serial
 * number and display label the password/confirmation flows need
 */
export interface DeviceTarget {
    device: DeviceConfig;
    serialNumber: string | undefined;
    label: string;
}
