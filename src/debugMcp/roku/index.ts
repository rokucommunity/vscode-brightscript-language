import type * as vscode from 'vscode';
import { DEBUG_MCP_API_VERSION } from '../core/integration';
import type { DebugMcpRegistry } from '../core/integration';
import { captureDeviceLogs, createDeviceLogsTool, DeviceLogStore } from './deviceLogs';
import type { RceTokenSource } from './deviceTarget';
import { createRokuDebugIntegration } from './rokuIntegration';
import { createScreenshotTool } from './screenshot';
import { createSendKeysTool } from './sendKeys';

/**
 * Plugs Roku debugging into the debug MCP core: session grouping, stop filtering, file ownership
 * and the device tools. `getRceToken` supplies the Cloud Emulator account token, which the
 * extension keeps out of the session configuration.
 */
export function registerRokuDebugMcp(registry: DebugMcpRegistry, options: { getRceToken: RceTokenSource }): vscode.Disposable[] {
    const deviceLogs = new DeviceLogStore();
    return [
        registry.registerDebugIntegration(createRokuDebugIntegration()),
        registry.registerToolProvider({
            apiVersion: DEBUG_MCP_API_VERSION,
            id: 'roku',
            tools: (context) => [
                createSendKeysTool(context, { getRceToken: options.getRceToken }),
                createDeviceLogsTool(context, deviceLogs),
                createScreenshotTool(context, { getRceToken: options.getRceToken })
            ]
        }),
        captureDeviceLogs(deviceLogs)
    ];
}
