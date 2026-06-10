import * as path from 'path';
import * as vscode from 'vscode';
import type { BrightScriptLaunchConfiguration } from '../DebugConfigurationProvider';

/**
 * The launch-config fields consumed by the roku-debug (rsg fork) devtools bridge
 * injection step (see roku-debug src/managers/DevtoolsBridgeInjector.ts).
 */
export interface SolidDevtoolsLaunchFields {
    /** Ask roku-debug to inject the Solid Devtools bridge into the staged TS bundle during stage() */
    injectDevtoolsBridge?: boolean;
    /** Absolute path to this extension's built bridge IIFE */
    devtoolsBridgePath?: string;
}

/**
 * Decorate a resolved launch config with the Solid Devtools bridge injection fields.
 *
 * Gated only on the `brightscript.solidDevtools.enabled` setting — NOT on whether this
 * is a TS/RSG app: the built manifest (with `ts_path`) may not exist yet at resolve time
 * (the preLaunchTask runs after resolution), so roku-debug makes the final call during
 * stage() and silently no-ops when the staged manifest has no `ts_path`.
 */
export function applySolidDevtoolsLaunchConfig(config: BrightScriptLaunchConfiguration, extensionPath: string): void {
    const enabled = vscode.workspace.getConfiguration('brightscript').get<boolean>('solidDevtools.enabled', true);
    if (!enabled) {
        return;
    }
    const fields = config as SolidDevtoolsLaunchFields;
    fields.injectDevtoolsBridge = true;
    fields.devtoolsBridgePath = path.join(extensionPath, 'dist', 'solidDevtools', 'bridge.js');
}
