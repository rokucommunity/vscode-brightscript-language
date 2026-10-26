import type * as vscode from 'vscode';
import * as fs from 'fs';
import * as fsExtra from 'fs-extra';
import * as getPort from 'get-port';
import * as JSZip from 'jszip';
import * as os from 'os';
import * as path from 'path';
import { ComponentLibraryServer } from 'roku-debug';
import type { OnDeviceComponent } from 'roku-test-automation';
import * as rta from 'roku-test-automation';
import { undent } from 'undent';
import { createLogger } from '../logging';
import { BaseRdbViewProvider } from './BaseRdbViewProvider';
import { ViewProviderCommand } from './ViewProviderCommand';
import { ViewProviderEvent } from './ViewProviderEvent';
import { ViewProviderId } from './ViewProviderId';

const logger = createLogger('RokuCommandsViewProvider');

const TIMEOUT_MS = 10000;
const CONTAINER_ID_KEYPATH = 'memoryPressure.id';
const LIBRARY_URI_KEYPATH = 'memoryPressure.#memoryPressureLibrary.uri';
const LIBRARY_STATUS_KEYPATH = 'memoryPressure.#memoryPressureLibrary.loadStatus';
const READY_KEYPATH = 'memoryPressure.#memoryPressureTask.ready';
const TARGET_KEYPATH = 'memoryPressure.#memoryPressureTask.targetMegabytes';
const APPLIED_KEYPATH = 'memoryPressure.#memoryPressureTask.appliedMegabytes';
const ERROR_KEYPATH = 'memoryPressure.#memoryPressureTask.error';

export class RokuCommandsViewProvider extends BaseRdbViewProvider {
    public readonly id = ViewProviderId.rokuCommandsView;

    public async resolveWebviewView(
        view: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ) {
        view.title = 'RTA Tools';
        await super.resolveWebviewView(view, context, token);
    }

    private operationId = 0;
    private componentLibraryServer?: ComponentLibraryServer;
    private componentLibraryPort = 0;
    private componentLibraryIncrementor = 0;
    private readonly componentLibraryFolder = path.join(os.tmpdir(), 'memoryPressureComponentLibraryServer');
    private readonly componentLibraryFileName = 'memoryPressure.zip';

    constructor(context: vscode.ExtensionContext, dependencies) {
        super(context, dependencies);

        this.addMessageCommandCallback(ViewProviderCommand.getMemoryPressure, async (message) => {
            const appliedMegabytes = await this.readAppliedMegabytes();
            this.postOrQueueMessage(this.createResponseMessage(message, {
                appliedMegabytes: appliedMegabytes ?? 0
            }));
            return true;
        });

        this.addMessageCommandCallback(ViewProviderCommand.applyMemoryPressure, async (message) => {
            const result = await this.applyMemoryPressure(message.context?.megabytes);
            this.postOrQueueMessage(this.createResponseMessage(message, result));
            return true;
        });
    }

    protected additionalScriptContents() {
        const requestArgsPath = path.join(rta.utils.getClientFilesPath(), 'requestArgs.schema.json');

        return [
            `const requestArgsSchema = ${fs.readFileSync(requestArgsPath, 'utf8')};`,
            `const odcCommands = ['${this.odcCommands.join(`','`)}'];`
        ];
    }

    public async applyMemoryPressure(targetMegabytes: number): Promise<{ appliedMegabytes: number; error?: string }> {
        const odc = this.getOnDeviceComponent();
        const operationId = this.startOperation();
        let applied = await this.readAppliedMegabytes();
        if (applied === undefined) {
            if (targetMegabytes === 0) {
                return { appliedMegabytes: 0 };
            }
            await this.ensureMemoryPressureNode(odc);
            applied = 0;
        }
        if (!this.isCurrentOperation(operationId)) {
            return { appliedMegabytes: applied };
        }
        if (applied === targetMegabytes) {
            return { appliedMegabytes: applied };
        }

        try {
            const updated = await this.waitForTarget(odc, applied, targetMegabytes, operationId);
            return { appliedMegabytes: updated };
        } catch (e) {
            if (!this.isCurrentOperation(operationId)) {
                return { appliedMegabytes: applied };
            }
            let current = applied;
            try {
                current = await this.readAppliedMegabytes() ?? applied;
            } catch {
                // keep the last count reported by the task
            }
            let error = e?.message ?? String(e);
            try {
                const errorValue = await odc.getValue({
                    base: 'global',
                    keyPath: ERROR_KEYPATH
                });
                if (errorValue?.value) {
                    error = String(errorValue.value);
                }
            } catch {
                // keep the caught error
            }
            return {
                appliedMegabytes: current,
                error: error
            };
        }
    }

    private getOnDeviceComponent(): OnDeviceComponent {
        const odc = this.dependencies.rtaManager.onDeviceComponent;
        if (!odc) {
            throw new Error('On-device component is not available');
        }
        return odc;
    }

    private async readAppliedMegabytes(): Promise<number | undefined> {
        const odc = this.getOnDeviceComponent();
        const result = await odc.getValue({
            base: 'global',
            keyPath: APPLIED_KEYPATH
        });
        if (!result?.found || typeof result.value !== 'number') {
            return undefined;
        }
        return result.value;
    }

    private async ensureMemoryPressureNode(odc: OnDeviceComponent) {
        const container = await odc.getValue({
            base: 'global',
            keyPath: CONTAINER_ID_KEYPATH
        });
        if (container?.value) {
            return;
        }

        await this.ensureComponentLibraryServer();
        await odc.setValue({
            base: 'global',
            keyPath: '',
            field: 'memoryPressure',
            value: {
                subtype: 'Node',
                id: 'memoryPressure'
            }
        });
        await odc.createChild({
            base: 'global',
            keyPath: 'memoryPressure',
            subtype: 'ComponentLibrary',
            fields: {
                id: 'memoryPressureLibrary'
            }
        });

        const { host } = await odc.getClientHost();
        const url = `http://${host}:${this.componentLibraryPort}/${this.componentLibraryFileName}?i=${this.componentLibraryIncrementor++}&rokuForce=.zip`;
        await odc.setValue({
            base: 'global',
            keyPath: LIBRARY_URI_KEYPATH,
            value: url
        });
        await odc.onFieldChangeOnce({
            base: 'global',
            keyPath: LIBRARY_STATUS_KEYPATH,
            match: 'ready'
        }, {
            timeout: TIMEOUT_MS
        });
        await odc.createChild({
            base: 'global',
            keyPath: 'memoryPressure',
            subtype: 'vscodeMemoryPressure:MemoryPressure',
            fields: {
                id: 'memoryPressureTask'
            }
        });
        await this.waitForReady(odc);
    }

    private async waitForReady(odc: OnDeviceComponent) {
        const deadline = Date.now() + TIMEOUT_MS;
        while (Date.now() < deadline) {
            const ready = await odc.getValue({
                base: 'global',
                keyPath: READY_KEYPATH
            });
            if (ready?.value === true) {
                return;
            }
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 100);
            });
        }
        throw new Error('Memory pressure task did not start');
    }

    private startOperation() {
        this.operationId++;
        return this.operationId;
    }

    private isCurrentOperation(operationId: number) {
        return operationId === this.operationId;
    }

    private async waitForTarget(odc: OnDeviceComponent, applied: number, targetMegabytes: number, operationId: number) {
        let unsubscribe: () => Promise<unknown> = async () => {
            return undefined;
        };
        const result = await new Promise<number>((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Memory pressure timed out'));
            }, TIMEOUT_MS);
            void odc.onFieldChange({
                base: 'global',
                keyPath: APPLIED_KEYPATH
            }, {
                timeout: TIMEOUT_MS
            }, (response) => {
                if (!this.isCurrentOperation(operationId)) {
                    clearTimeout(timer);
                    resolve(applied);
                    return;
                }
                if (typeof response?.value !== 'number') {
                    return;
                }
                this.postProgress(response.value, targetMegabytes);
                if (response.value === targetMegabytes) {
                    clearTimeout(timer);
                    resolve(response.value);
                }
            }).then((cancel) => {
                unsubscribe = cancel;
                if (!this.isCurrentOperation(operationId)) {
                    clearTimeout(timer);
                    resolve(applied);
                    return undefined;
                }
                return odc.setValue({
                    base: 'global',
                    keyPath: TARGET_KEYPATH,
                    value: targetMegabytes
                });
            }).catch((error) => {
                clearTimeout(timer);
                reject(error);
            });
        }).finally(() => {
            // cancelling the observer can hang if the device call that failed is still
            // holding the socket, and waiting on it left the panel locked after a failure
            void unsubscribe().catch((error) => {
                logger.log('Failed to cancel memory pressure observer', error);
            });
        });
        return result;
    }

    private async ensureComponentLibraryServer() {
        if (this.componentLibraryServer) {
            return;
        }

        this.componentLibraryServer = new ComponentLibraryServer();
        this.componentLibraryPort = await getPort();
        await fsExtra.ensureDir(this.componentLibraryFolder);
        await this.componentLibraryServer.startStaticFileHosting(this.componentLibraryFolder, this.componentLibraryPort, (line: string) => logger.log(line));

        const zip = new JSZip();
        zip.file('manifest', memoryPressureManifest());
        zip.file('components/MemoryPressure.xml', memoryPressureXml());
        zip.file('components/MemoryPressure.brs', memoryPressureBrs());
        const content = await zip.generateAsync({ type: 'nodebuffer', compressionOptions: { level: 2 } });
        await fsExtra.outputFile(path.join(this.componentLibraryFolder, this.componentLibraryFileName), content);
    }

    private postProgress(appliedMegabytes: number, targetMegabytes: number) {
        this.postOrQueueMessage(this.createEventMessage(ViewProviderEvent.onMemoryPressureProgress, {
            appliedMegabytes: appliedMegabytes,
            targetMegabytes: targetMegabytes
        }));
    }
}

function memoryPressureManifest() {
    return undent`
        title=Memory Pressure
        sg_component_libs_provided=vscodeMemoryPressure
        hidden=1
        rsg_version=1.2
        major_version=1
        minor_version=0
        build_version=0
    `;
}

function memoryPressureXml() {
    return undent`
        <?xml version="1.0" encoding="utf-8" ?>
        <component name="MemoryPressure" extends="Task">
            <script type="text/brightscript" uri="MemoryPressure.brs" />
            <interface>
                <field id="targetMegabytes" type="float" />
                <field id="appliedMegabytes" type="float" value="0" />
                <field id="ready" type="boolean" value="false" />
                <field id="error" type="string" value="" />
            </interface>
        </component>
    `;
}

function memoryPressureBrs() {
    return undent`
        sub init()
            m.top.functionName = "runPressure"
            m.top.control = "RUN"
        end sub

        sub runPressure()
            applied = 0
            port = CreateObject("roMessagePort")
            m.top.appliedMegabytes = 0
            m.top.ready = true
            while true
                target = m.top.targetMegabytes
                if target = invalid then target = 0
                if applied <> target
                    applied = updatePayload(target)
                end if
                wait(100, port)
            end while
        end sub

        function updatePayload(target as float) as float
            if target < 0 then target = 0
            m.top.error = ""
            try
                ' SetResize only grows, so release the previous array before allocating the new size
                m.ba = invalid
                if target > 0
                    m.ba = CreateObject("roByteArray")
                    m.ba.setResize(Int(1024 * 1024 * target), true)
                end if
                m.top.appliedMegabytes = target
            catch e
                m.ba = invalid
                m.top.appliedMegabytes = 0
                m.top.error = e.message
                return 0
            end try
            return target
        end function
    `;
}
