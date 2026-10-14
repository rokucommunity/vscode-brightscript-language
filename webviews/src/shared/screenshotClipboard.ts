import { intermediary } from '../ExtensionIntermediary';
import { ViewProviderCommand } from '../../../src/viewProviders/ViewProviderCommand';

//the webview needs time for its DOM to become focused before the clipboard accepts a write
const clipboardFocusDelayMs = 100;

/**
 * Request one screenshot from the extension host. Resolves with the image labeled with its real
 * format on success; a failure resolves with the host's message instead of throwing, so callers
 * can decide whether to retry or report it.
 */
export async function requestScreenshot(request: { streaming: boolean }): Promise<ScreenshotRequestResult> {
    const response = await intermediary.sendCommand(ViewProviderCommand.getScreenshot, request);
    if (!response.success) {
        return { success: false, message: response.message };
    }
    return {
        success: true,
        blob: new Blob([response.bytes], { type: response.format === 'jpg' ? 'image/jpeg' : 'image/png' }),
        nextCaptureDelay: response.nextCaptureDelay
    };
}

/**
 * Copy an image to the clipboard, reporting failure to the user. Chromium's clipboard only accepts
 * image/png, so any other format is converted first.
 */
export async function copyImageToClipboard(image: Blob): Promise<boolean> {
    try {
        const pngImage = image.type === 'image/png' ? image : await convertToPng(image);
        await new Promise((resolve) => {
            setTimeout(resolve, clipboardFocusDelayMs);
        });
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngImage })]);
        return true;
    } catch (error) {
        reportScreenshotMessage('error', `Failed to copy the screenshot: ${(error as Error)?.message ?? error}`);
        return false;
    }
}

/**
 * Copy a screenshot of a Cloud Emulator stream. A one-shot screenshot is preferred (full device
 * resolution); when it fails, the video element's current frame is copied instead.
 */
export async function copyRceStreamScreenshot(captureVideoFrame: () => Promise<Blob | undefined>): Promise<void> {
    let failureMessage: string | undefined;
    let image: Blob | undefined;
    try {
        const result = await requestScreenshot({ streaming: true });
        if (result.success) {
            image = result.blob;
        } else {
            failureMessage = result.message;
        }
    } catch (error) {
        failureMessage = (error as Error)?.message ?? String(error);
    }

    const screenshotFailed = !image;
    if (!image) {
        try {
            image = await captureVideoFrame();
        } catch {
            image = undefined;
        }
    }

    if (!image) {
        reportScreenshotMessage('error', `Unable to copy a screenshot${failureMessage ? `: ${failureMessage}` : '.'}`);
        return;
    }
    const copied = await copyImageToClipboard(image);
    if (copied && screenshotFailed) {
        reportScreenshotMessage('information', `Copied the video frame; screenshot failed${failureMessage ? `: ${failureMessage}` : '.'}`);
    }
}

export function reportScreenshotMessage(severity: 'error' | 'information', message: string): void {
    void intermediary.sendCommand(ViewProviderCommand.showScreenshotMessage, { severity: severity, message: message });
}

async function convertToPng(image: Blob): Promise<Blob> {
    const bitmap = await createImageBitmap(image);
    try {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        return await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((pngImage) => {
                if (pngImage) {
                    resolve(pngImage);
                } else {
                    reject(new Error('The screenshot could not be converted to PNG.'));
                }
            }, 'image/png');
        });
    } finally {
        bitmap.close();
    }
}

export interface ScreenshotRequestResult {
    success: boolean;
    blob?: Blob;
    nextCaptureDelay?: number;
    message?: string;
}
