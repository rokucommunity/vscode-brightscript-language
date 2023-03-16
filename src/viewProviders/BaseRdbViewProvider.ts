import * as rta from 'roku-test-automation';
import type * as vscode from 'vscode';
import type { RequestType } from 'roku-test-automation';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import * as childProcess from 'child_process';
import { BaseWebviewViewProvider } from './BaseWebviewViewProvider';
import type { RtaManager } from '../managers/RtaManager';
import { ViewProviderEvent } from './ViewProviderEvent';
import { ViewProviderCommand } from './ViewProviderCommand';
import { standardizePath as s } from 'brighterscript';
import { PNG } from 'pngjs';

export abstract class BaseRdbViewProvider extends BaseWebviewViewProvider {
    protected rtaManager?: RtaManager;

    protected odcCommands: Array<RequestType>;

    constructor(context: vscode.ExtensionContext) {
        super(context);
        const requestTypesPath = path.join(rta.utils.getClientFilesPath(), 'requestTypes.schema.json');
        const json = JSON.parse(fsExtra.readFileSync(requestTypesPath, 'utf8'));
        this.odcCommands = json.enum;
    }

    public setRtaManager(rtaManager?: RtaManager) {
        this.rtaManager = rtaManager;
    }

    public updateDeviceAvailability() {
        this.postOrQueueMessage({
            event: ViewProviderEvent.onDeviceAvailabilityChange,
            odcAvailable: !!this.rtaManager.onDeviceComponent,
            deviceAvailable: !!this.rtaManager.device
        });
    }

    protected onViewReady() {
        // Always post back the device status so we make sure the client doesn't miss it if it got refreshed
        this.updateDeviceAvailability();
    }

    private isFfmpegScreenshotEnabled = true;

    private ffmpegProcess: childProcess.ChildProcessWithoutNullStreams;

    private latestScreenshotBuffer = Buffer.alloc(0);

    private async getScreenshot(): Promise<ArrayBufferLike> {
        if (this.isFfmpegScreenshotEnabled) {
            const imagesDir = s`${__dirname}/../../.tmp/__ffmpegImages`;
            if (!this.ffmpegProcess) {
                fsExtra.emptyDirSync(imagesDir);
                //have ffmpeg generate screenshots at regular interval:
                this.ffmpegProcess = childProcess.spawn('ffmpeg', [
                    '-f',
                    'dshow',
                    '-i',
                    `video="usb video"`,
                    '-vf',
                    'fps=1',
                    '-s',
                    '480x270',
                    '-c:v',
                    'png',
                    '-f',
                    'image2pipe',
                    '-'
                ], {
                    shell: true,
                    //image2pipe sends the images over channel 1 (stdout)
                    stdio: ['ignore', 'pipe', 'ignore']
                });

                let buffer = Buffer.alloc(0);
                this.ffmpegProcess.stdout.on('data', (data) => {
                    buffer = Buffer.concat([buffer, data]);
                    try {
                        const png = new PNG(buffer);
                        this.latestScreenshotBuffer = png.imgData;
                        buffer = buffer.slice(png.imgData.length);
                    } catch (e) {
                    }
                });
            }
            return this.latestScreenshotBuffer.buffer;
        } else {
            return (
                await this.rtaManager.device.getScreenshot()
            ).buffer.buffer;
        }
    }

    protected async handleViewMessage(message) {
        const { command, context } = message;
        if (this.odcCommands.includes(command)) {
            const response = await this.rtaManager.sendOdcRequest(this.id, command, context);
            this.postOrQueueMessage({
                ...message,
                response: response
            });
            return true;
        } else if (command === ViewProviderCommand.getStoredNodeReferences) {
            const response = this.rtaManager.getStoredNodeReferences();
            this.postOrQueueMessage({
                ...message,
                response: response
            });

            return true;
        } else if (command === ViewProviderCommand.setManualIpAddress) {
            this.rtaManager.setupRtaWithConfig({
                ...message.context,
                injectRdbOnDeviceComponent: true
            });
            return true;
        } else if (command === ViewProviderCommand.getScreenshot) {
            try {
                const buffer = await this.getScreenshot();
                this.postOrQueueMessage({
                    ...message,
                    response: {
                        success: true,
                        arrayBuffer: buffer
                    }
                });
            } catch (e) {
                this.postOrQueueMessage({
                    ...message,
                    response: {
                        success: false
                    }
                });
            }
            return true;
        }

        return false;
    }

    public dispose(): void {
        super.dispose();
        this.ffmpegProcess.kill();
    }
}
