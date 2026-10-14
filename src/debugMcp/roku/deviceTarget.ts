import type * as vscode from 'vscode';
import type { DeviceConfig } from 'roku-deploy';
import { isRceDeviceConfig } from 'roku-deploy';
import { resolveTarget } from '../core/toolSupport';
import type { DebugMcpToolContext, ResolvedTarget } from '../core/toolSupport';
import { BRIGHTSCRIPT_RUNTIME } from './rokuIntegration';

/** The BrightScript session a call targets, whichever runtime `sessionId` named. */
export function resolveBrightScriptTarget(context: DebugMcpToolContext, args: Record<string, unknown>): ResolvedTarget {
    return resolveTarget(context, { ...args, runtime: BRIGHTSCRIPT_RUNTIME }, { preferStopped: false });
}

/**
 * The roku-deploy device the session was launched against: a LAN `{ host }` or a cloud emulator
 * config. The extension strips the cloud emulator token from the session's configuration, so
 * it is added to a copy from `getRceToken`; the session's own configuration is never changed.
 */
export async function getSessionDevice(session: vscode.DebugSession, getRceToken: RceTokenSource): Promise<DeviceConfig> {
    const configuration: Record<string, any> = session.configuration ?? {};
    if (configuration.device && typeof configuration.device === 'object') {
        const device = configuration.device as DeviceConfig;
        if (!isRceDeviceConfig(device) || device.rceToken) {
            return { ...device };
        }
        const token = await getRceToken();
        if (!token) {
            throw new Error('No Cloud Emulator token is available. Add a Cloud Emulator account in VS Code (BrightScript: Add Cloud Emulator Account) and try again.');
        }
        return { ...device, rceToken: token };
    }
    if (typeof configuration.host === 'string' && configuration.host) {
        return { host: configuration.host };
    }
    throw new Error(`The debug session '${session.name}' has no device in its launch configuration.`);
}

/** Names a device without its credentials. */
export function describeDevice(device: DeviceConfig): string {
    if (isRceDeviceConfig(device)) {
        const rceDevice = device as { id?: number; esn?: string; instanceUrl?: string };
        return `cloud emulator ${rceDevice.id ?? rceDevice.esn ?? rceDevice.instanceUrl}`;
    }
    return device.host;
}

/** Resolves the Cloud Emulator account token the extension holds, if any. */
export type RceTokenSource = () => Promise<string | undefined>;
