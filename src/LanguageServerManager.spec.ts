import { createSandbox } from 'sinon';
import { vscode, vscodeLanguageClient } from './mockVscode.spec';
import { LanguageServerManager } from './LanguageServerManager';
import { expect } from 'chai';
import { DefinitionRepository } from './DefinitionRepository';
import { DeclarationProvider } from './DeclarationProvider';
import type { ExtensionContext } from 'vscode';
import * as path from 'path';
import { standardizePath as s } from 'brighterscript';
import * as fsExtra from 'fs-extra';
import URI from 'vscode-uri';
import { languageServerInfoCommand } from './commands/LanguageServerInfoCommand';

const Module = require('module');
const sinon = createSandbox();

//override the "require" call to mock certain items
const { require: oldRequire } = Module.prototype;
Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else if (file === 'vscode-languageclient') {
        return vscodeLanguageClient;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

const tempDir = s`${process.cwd()}/.tmp`;

describe('LanguageServerManager', () => {
    let languageServerManager: LanguageServerManager;

    beforeEach(() => {
        languageServerManager = new LanguageServerManager();
        languageServerManager['definitionRepository'] = new DefinitionRepository(
            new DeclarationProvider()
        );
        languageServerManager['context'] = {
            subscriptions: [],
            asAbsolutePath: () => { },
            globalState: {
                get: () => {

                },
                update: () => {

                }
            }
        } as unknown as ExtensionContext;
    });

    afterEach(() => {
        sinon.restore();
        fsExtra.removeSync(tempDir);
    });

    describe('updateStatusbar', () => {
        it('does not crash when undefined', () => {
            delete languageServerManager['statusbarItem'];
            //the test passes if these don't throw
            languageServerManager['updateStatusbar'](true);
            languageServerManager['updateStatusbar'](false);
        });
    });

    it('registers referenceProvider', () => {
        let spy = sinon.spy(vscode.languages, 'registerReferenceProvider');
        expect(spy.calledOnce).to.be.false;
        languageServerManager['enableSimpleProviders']();
        expect(spy.calledOnce).to.be.true;
    });

    it('registers signatureHelpProvider', () => {
        let spy = sinon.spy(vscode.languages, 'registerSignatureHelpProvider');
        expect(spy.calledOnce).to.be.false;
        languageServerManager['enableSimpleProviders']();
        expect(spy.calledOnce).to.be.true;
    });

    it('registers workspace symbol provider', () => {
        let spy = sinon.spy(vscode.languages, 'registerWorkspaceSymbolProvider');
        expect(spy.calledOnce).to.be.false;
        languageServerManager['enableSimpleProviders']();
        expect(spy.calledOnce).to.be.true;
    });

    it('registers document symbol provider', () => {
        let spy = sinon.spy(vscode.languages, 'registerDocumentSymbolProvider');
        expect(spy.calledOnce).to.be.false;
        languageServerManager['enableSimpleProviders']();
        expect(spy.calledOnce).to.be.true;
    });

    describe('enableLanguageServer', () => {
        it('properly handles runtime exception', async () => {
            languageServerManager['client'] = {} as any;
            sinon.stub(languageServerManager as any, 'ready').callsFake(() => {
                throw new Error('failed for test');
            });
            let error: Error;
            try {
                await languageServerManager['enableLanguageServer']();
            } catch (e) {
                error = e;
            }
            expect(error?.message).to.eql('failed for test');

            //run it a second time
            try {
                await languageServerManager['enableLanguageServer']();
            } catch (e) {
                error = e;
            }
            expect(error?.message).to.eql('failed for test');
        });
    });

    describe('getBsdkPath', () => {
        const embeddedPath = path.resolve(s`${__dirname}/../node_modules/brighterscript`);

        function setConfig(filePath: string, settings: any) {
            if (filePath.endsWith('.code-workspace')) {
                fsExtra.outputJsonSync(filePath, {
                    settings: settings
                });
            } else {
                fsExtra.outputJsonSync(filePath, settings);
            }
            vscode.workspace._configuration = settings;
        }

        it('returns embedded version when not in workspace and no settings exist', async () => {
            expect(
                s(await languageServerManager['getBsdkPath']())
            ).to.eql(embeddedPath);
        });

        it('returns embedded version when in a workspace and no settings exist', async () => {
            vscode.workspace.workspaceFile = URI.file(s`${tempDir}/workspace.code-workspace`);
            fsExtra.outputFileSync(vscode.workspace.workspaceFile.fsPath, '');

            expect(
                s(await languageServerManager['getBsdkPath']())
            ).to.eql(embeddedPath);
        });

        it('returns embedded version when folder has no brightscript config option', async () => {
            vscode.workspace.workspaceFolders.push({
                index: 0,
                name: 'app1',
                uri: URI.file(`${tempDir}/app1`)
            });

            expect(
                s(await languageServerManager['getBsdkPath']())
            ).to.eql(embeddedPath);
        });

        it('returns embedded version when in a workspace and "embedded" value exists', async () => {
            vscode.workspace.workspaceFile = URI.file(s`${tempDir}/workspace.code-workspace`);
            setConfig(vscode.workspace.workspaceFile.fsPath, {
                'brightscript.bsdk': 'embedded'
            });

            expect(
                s(await languageServerManager['getBsdkPath']())
            ).to.eql(embeddedPath);
        });

        it('returns embedded version when in a folder without workspace and "embedded" value exists', async () => {
            vscode.workspace.workspaceFolders.push({
                index: 0,
                name: 'app1',
                uri: URI.file(`${tempDir}/app1`)
            });
            setConfig(`${vscode.workspace.workspaceFolders[0].uri.fsPath}/.vscode/settings.json`, {
                'brightscript.bsdk': 'embedded'
            });

            expect(
                s(await languageServerManager['getBsdkPath']())
            ).to.eql(embeddedPath);
        });

        it('returns value from workspace when specified', async () => {
            vscode.workspace.workspaceFile = URI.file(s`${tempDir}/workspace.code-workspace`);

            setConfig(vscode.workspace.workspaceFile.fsPath, {
                'brightscript.bsdk': 'relative/path'
            });

            expect(
                s(await languageServerManager['getBsdkPath']())
            ).to.eql(
                path.resolve(
                    s`${tempDir}/relative/path`
                )
            );
        });

        it('returns folder version when not in a workspace', async () => {
            vscode.workspace.workspaceFolders.push({
                index: 0,
                name: 'app1',
                uri: URI.file(`${tempDir}/app1`)
            });
            setConfig(`${vscode.workspace.workspaceFolders[0].uri.fsPath}/.vscode/settings.json`, {
                'brightscript.bsdk': 'folder/path'
            });

            expect(
                s(await languageServerManager['getBsdkPath']())
            ).to.eql(
                path.resolve(
                    s`${tempDir}/app1/folder/path`
                )
            );
        });

        it('returns folder version when in a workspace but no workspace version exists', async () => {
            vscode.workspace.workspaceFile = URI.file(s`${tempDir}/workspace.code-workspace`);

            vscode.workspace.workspaceFolders.push({
                index: 0,
                name: 'app1',
                uri: URI.file(`${tempDir}/app1`)
            });
            setConfig(`${vscode.workspace.workspaceFolders[0].uri.fsPath}/.vscode/settings.json`, {
                'brightscript.bsdk': 'folder/path'
            });

            expect(
                s(await languageServerManager['getBsdkPath']())
            ).to.eql(
                path.resolve(
                    s`${tempDir}/app1/folder/path`
                )
            );
        });

        it('prompts user for which version to use when multiple folders have value', async () => {
            sinon.stub(vscode.workspace, 'getConfiguration').callsFake((name, resource: any) => {
                let value: any;
                if (resource?.name === 'app1') {
                    value = 'node_modules/customBs1';
                } else if (resource?.name === 'app2') {
                    value = 'node_modules/customBs2';
                } else {
                    value = null;
                }
                return {
                    get: x => value,
                    inspect: () => ({}) as any
                };
            });
            vscode.workspace.workspaceFolders.push({
                index: 0,
                name: 'app1',
                uri: URI.file(`${tempDir}/app1`)
            }, {
                index: 1,
                name: 'app2',
                uri: URI.file(`${tempDir}/app2`)
            });
            const stub = sinon.stub(languageServerInfoCommand, 'selectBrighterScriptVersion').returns(Promise.resolve(null));
            const bsdkPath = await languageServerManager['getBsdkPath']();
            expect(stub.called).to.be.true;

            //should get null since that's what the 'selectBrighterScriptVersion' function returns from our stub
            expect(bsdkPath).to.eql(null);
        });
    });
});
