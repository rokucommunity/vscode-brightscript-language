import { BaseRdbViewProvider } from './BaseRdbViewProvider';
import { ViewProviderCommand } from './ViewProviderCommand';
import { ViewProviderId } from './ViewProviderId';
import type * as vscode from 'vscode';
import * as JSZip from 'jszip';
import * as fsExtra from 'fs-extra';
import { undent } from 'undent';
import { odc } from 'roku-test-automation';
import { ComponentLibraryServer } from 'roku-debug';
import * as getPort from 'get-port';
import * as path from 'path';
import * as os from 'os';

export class RokuReplViewProvider extends BaseRdbViewProvider {
    public readonly id = ViewProviderId.rokuReplView;
    private componentLibraryServer: ComponentLibraryServer;
    private componentLibraryIncrementor = 0;
    private componentLibraryFolder = path.join(os.tmpdir(), 'replComponentLibraryServer');
    private componentLibraryFileName = 'repl.zip';
    private componentLibraryHost = '';
    private componentLibraryPort = 0;

    constructor(context: vscode.ExtensionContext, dependencies) {
        super(context, dependencies);

        this.addMessageCommandCallback(ViewProviderCommand.sendReplRequest, async (message) => {
            try {
                if (!this.componentLibraryServer) {
                    this.componentLibraryServer = new ComponentLibraryServer();
                    this.componentLibraryPort = await getPort();
                    await fsExtra.ensureDir(this.componentLibraryFolder);
                    await this.componentLibraryServer.startStaticFileHosting(this.componentLibraryFolder, this.componentLibraryPort, console.log);
                }

                const zip = new JSZip();
                zip.file('manifest', this.getManifestContents());
                zip.file('components/REPL.xml', this.getREPLXml());
                zip.file('components/REPL.brs', this.getREPLBrs(message.context.replCode));
                const content = await zip.generateAsync({ type: 'nodebuffer', compressionOptions: { level: 2 } });
                await fsExtra.outputFile(`${this.componentLibraryFolder}/${this.componentLibraryFileName}`, content);

                // Check if we already added the component library
                const { value } = await odc.getValue({
                    keyPath: '#replContainer.id'
                });
                if (!value) {
                    // We use the fact that the container doesn't exist to know we need to do our initial setup
                    // If it doesn't exist then add it
                    await odc.createChild({
                        subtype: 'Group',
                        fields: {
                            id: 'replContainer'
                        }
                    });

                    await odc.createChild({
                        keyPath: '#replContainer',
                        subtype: 'ComponentLibrary',
                        fields: {
                            id: 'replComponentLibrary'
                        }
                    });

                    // Figure out what network interface the Roku device is accessing us from
                    const { host } = await odc.getServerHost();
                    this.componentLibraryHost = host;
                }

                const url = `http://${this.componentLibraryHost}:${this.componentLibraryPort}/${this.componentLibraryFileName}?i=${this.componentLibraryIncrementor++}&rokuForce=.zip`;
                await odc.setValue({
                    keyPath: '#replContainer.#replComponentLibrary.uri',
                    value: url
                });

                await odc.onFieldChangeOnce({
                    keyPath: '#replContainer.#replComponentLibrary.loadStatus',
                    match: 'ready'
                });

                const replInstanceId = `replInstance${this.componentLibraryIncrementor}`;
                await odc.createChild({
                    keyPath: '#replContainer',
                    subtype: 'BrightScriptREPL:REPL',
                    fields: {
                        id: replInstanceId
                    }
                }, {
                    timeout: 60000 // All of the repl code will run during this operation
                });

                const replInstanceKeypath = `#replContainer.#${replInstanceId}`;
                const { value: replOutput } = await odc.onFieldChangeOnce({
                    keyPath: `${replInstanceKeypath}.output`,
                    match: {
                        keyPath: `${replInstanceKeypath}.output.finished`,
                        value: true
                    }
                });

                await odc.removeNode({
                    keyPath: replInstanceKeypath
                });

                this.postOrQueueMessage(this.createResponseMessage(message, {
                    replOutput: replOutput
                }));
            } catch (e) {
                this.postOrQueueMessage(this.createResponseMessage(message, {
                    replOutput: {
                        error: {
                            message: e.message
                        }
                    }
                }));
            }
            return true;
        });

    }

    private getManifestContents() {
        const contents = undent`
            title=BrightScript REPL
            sg_component_libs_provided=BrightScriptREPL
            hidden=1
            rsg_version=1.2
            major_version=1
            minor_version=1
            build_version=0
        `;
        return contents;
    }

    private getREPLXml() {
        const contents = undent`
            <?xml version="1.0" encoding="utf-8" ?>
            <component name="REPL" extends="Task" >
                <script type="text/brightscript" uri="REPL.brs" />
                <interface>
                    <field id="output" type="assocarray"/>
                </interface>
            </component>`;
        return contents;
    }

    private getREPLBrs(replCode: string) {
        const contents = undent`
            function init()
                replWrapper()
            end function

            function repl()
                ${replCode}
            end function

            function replWrapper()
                output = {}
                t = createObject("roTimespan")
                try
                    output.response = repl()
                catch e
                    output.error = e
                end try
                output["timeTaken"] = t.totalMilliseconds()
                output.finished = true
                m.top.output = output
            end function
            `;
        return contents;
    }
}
