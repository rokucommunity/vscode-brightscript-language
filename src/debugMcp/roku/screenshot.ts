import { rokuDeploy } from 'roku-deploy';
import type { CaptureScreenshotOptions, CaptureScreenshotResult } from 'roku-deploy';
import type { DebugMcpTool } from '../core/DebugMcpServer';
import { ToolContentResult } from '../core/DebugMcpServer';
import { SESSION_ID_PROPERTY, raceAbort, withProgress } from '../core/toolSupport';
import type { DebugMcpToolContext } from '../core/toolSupport';
import { describeDevice, getSessionDevice, resolveBrightScriptTarget } from './deviceTarget';
import type { RceTokenSource } from './deviceTarget';

export const SCREENSHOT_TIMEOUT_MS = 20000;
/** Base64 payloads beyond this are refused; most MCP clients cap a result well above it. */
export const MAX_SCREENSHOT_BASE64_BYTES = 4.5 * 1024 * 1024;

export interface ScreenshotDependencies {
    /** Supplies the Cloud Emulator token the session configuration does not carry. */
    getRceToken?: RceTokenSource;
    capture?: (options: CaptureScreenshotOptions) => Promise<CaptureScreenshotResult>;
}

export function createScreenshotTool(context: DebugMcpToolContext, dependencies: ScreenshotDependencies = {}): DebugMcpTool {
    const capture = dependencies.capture ?? ((options) => rokuDeploy.captureScreenshot(options));
    const getRceToken = dependencies.getRceToken ?? (() => Promise.resolve(undefined));
    return {
        name: 'capture_screenshot',
        description: 'Captures the screen of the Roku device of a BrightScript debug session and returns it as an image. Works for LAN devices and Roku Cloud Emulator devices. A side-loaded channel must be running. Needs an active debug session.',
        inputSchema: { type: 'object', properties: { sessionId: SESSION_ID_PROPERTY } },
        handler: async (args, call) => {
            const target = resolveBrightScriptTarget(context, args);
            const device = await getSessionDevice(target.session, getRceToken);
            const configuration: Record<string, any> = target.session.configuration ?? {};
            const result = await withProgress(call, () => 'Still capturing the screenshot', () => raceAbort(capture({
                device: device,
                password: configuration.password,
                packagePort: configuration.packagePort,
                timeout: SCREENSHOT_TIMEOUT_MS
            }), call?.signal));
            const data = result.buffer.toString('base64');
            if (data.length > MAX_SCREENSHOT_BASE64_BYTES) {
                throw new Error(`The screenshot is too large to return (${(data.length / 1024 / 1024).toFixed(1)} MB encoded; the limit is ${(MAX_SCREENSHOT_BASE64_BYTES / 1024 / 1024).toFixed(1)} MB).`);
            }
            return new ToolContentResult([
                { type: 'text', text: `Screenshot of ${describeDevice(device)} (${result.format}, ${result.buffer.length} bytes).` },
                { type: 'image', data: data, mimeType: result.format === 'png' ? 'image/png' : 'image/jpeg' }
            ]);
        }
    };
}
