import { createSandbox } from 'sinon';
import { vscode, vscodeLanguageClient } from './mockVscode.spec';
import { LanguageServerManager } from './LanguageServerManager';
import { expect } from 'chai';
import { DefinitionRepository } from './DefinitionRepository';
import { DeclarationProvider } from './DeclarationProvider';
import type { ExtensionContext } from 'vscode';
import * as path from 'path';
import { Deferred, standardizePath as s } from 'brighterscript';
import * as fsExtra from 'fs-extra';
import URI from 'vscode-uri';
import { languageServerInfoCommand } from './commands/LanguageServerInfoCommand';
import type { StateChangeEvent } from 'vscode-languageclient/node';
import {
    LanguageClient,
    State
} from 'vscode-languageclient/node';
import { util } from './util';
import { GlobalStateManager } from './GlobalStateManager';
import { LocalPackageManager } from './managers/LocalPackageManager';
import { expectThrowsAsync } from './testHelpers.spec';
import undent from 'undent';
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
    const storageDir = s`${tempDir}/brighterscript-storage`;

    let languageServerManager: LanguageServerManager;

    beforeEach(function() {
        //deleting certain directories take a while
        this.timeout(5 * 60 * 1000);

        languageServerManager = new LanguageServerManager();
        languageServerManager['definitionRepository'] = new DefinitionRepository(
            new DeclarationProvider()
        );
        languageServerManager['context'] = {
            ...vscode.context,
            asAbsolutePath: vscode.context.asAbsolutePath,
            subscriptions: []
        } as unknown as ExtensionContext;
        languageServerManager['globalStateManager'] = new GlobalStateManager(languageServerManager['context']);
        languageServerManager['localPackageManager'] = new LocalPackageManager(storageDir, languageServerManager['context']);

        fsExtra.removeSync(storageDir);
        (languageServerManager['context'] as any).globalStorageUri = URI.file(storageDir);

        //this delay is used to clean up old versions. for testing, have it trigger instantly so it doesn't keep the testing process alive
        languageServerManager['outdatedBscVersionDeleteDelay'] = 0;

    });

    function stubConstructClient(processor?: (LanguageClient) => void) {
        sinon.stub(languageServerManager as any, 'constructLanguageClient').callsFake(() => {
            const client = {
                start: () => { },
                onDidChangeState: (cb) => {
                },
                onReady: () => Promise.resolve(),
                onNotification: () => { }
            };
            processor?.(client);
            return client;
        });
    }

    afterEach(function() {
        //deleting certain directories take a while
        this.timeout(30_000);

        sinon.restore();
        fsExtra.removeSync(tempDir);
    });

    describe('lsp crash tracking', () => {
        it('shows popup after a stop without a subsequent start/restart/running', async () => {
            let changeState: (event: StateChangeEvent) => void;
            //disable starting so we can manually test
            sinon.stub(languageServerManager, 'syncVersionAndTryRun').callsFake(() => Promise.resolve());

            await languageServerManager.init(languageServerManager['context'], languageServerManager['definitionRepository'], languageServerManager['localPackageManager']);

            languageServerManager['lspRunTracker'].debounceDelay = 100;

            let registerOnDidChangeStateDeferred = new Deferred();
            stubConstructClient((client) => {
                client.onDidChangeState = (cb) => {
                    changeState = cb as unknown as any;
                    registerOnDidChangeStateDeferred.resolve();
                };
            });

            void languageServerManager['enableLanguageServer']();

            await registerOnDidChangeStateDeferred.promise;
            let showErrorMessageDeferred = new Deferred();
            sinon.stub(vscode.window, 'showErrorMessage').callsFake(() => {
                showErrorMessageDeferred.resolve();
            });

            //call the callback with the stopped state
            changeState({
                oldState: State.Stopped,
                newState: State.Stopped
            });

            // the test will fail if the error message not shown
            await showErrorMessageDeferred.promise;
        });
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
            stubConstructClient();
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

    describe('getBsdkVersionInfo', () => {
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
                s(await languageServerManager['getBsdkVersionInfo']())
            ).to.eql(embeddedPath);
        });

        it('returns embedded version when in a workspace and no settings exist', async () => {
            vscode.workspace.workspaceFile = URI.file(s`${tempDir}/workspace.code-workspace`);
            fsExtra.outputFileSync(vscode.workspace.workspaceFile.fsPath, '');

            expect(
                s(await languageServerManager['getBsdkVersionInfo']())
            ).to.eql(embeddedPath);
        });

        it('returns embedded version when folder has no brightscript config option', async () => {
            vscode.workspace.workspaceFolders.push({
                index: 0,
                name: 'app1',
                uri: URI.file(`${tempDir}/app1`)
            });

            expect(
                s(await languageServerManager['getBsdkVersionInfo']())
            ).to.eql(embeddedPath);
        });

        it('returns embedded version when in a workspace and "embedded" value exists', async () => {
            vscode.workspace.workspaceFile = URI.file(s`${tempDir}/workspace.code-workspace`);
            setConfig(vscode.workspace.workspaceFile.fsPath, {
                'brightscript.bsdk': 'embedded'
            });

            expect(
                s(await languageServerManager['getBsdkVersionInfo']())
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
                s(await languageServerManager['getBsdkVersionInfo']())
            ).to.eql(embeddedPath);
        });

        it('returns value from workspace when specified', async () => {
            vscode.workspace.workspaceFile = URI.file(s`${tempDir}/workspace.code-workspace`);

            setConfig(vscode.workspace.workspaceFile.fsPath, {
                'brightscript.bsdk': 'relative/path'
            });

            expect(
                s(await languageServerManager['getBsdkVersionInfo']())
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
                s(await languageServerManager['getBsdkVersionInfo']())
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
                s(await languageServerManager['getBsdkVersionInfo']())
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
            const bsdkPath = await languageServerManager['getBsdkVersionInfo']();
            expect(stub.called).to.be.true;

            //should get null since that's what the 'selectBrighterScriptVersion' function returns from our stub
            expect(bsdkPath).to.eql(null);
        });
    });

    describe('ensureBscVersionInstalled', function() {
        //these tests take a long time (due to running `npm install`)
        this.timeout(5 * 60 * 1000);

        it('returns info when absolute dir already exists', async () => {
            const versionInfo = s`${tempDir}/node_modules/brighterscript`;
            fsExtra.outputJsonSync(s`${tempDir}/node_modules/brighterscript/package.json`, {
                version: '0.65.0'
            });
            expect(
                await languageServerManager['ensureBscVersionInstalled'](versionInfo)
            ).to.eql({
                packageDir: s`${tempDir}/node_modules/brighterscript`,
                versionInfo: versionInfo,
                version: '0.65.0'
            });
        });

        it('throws when dir does not exist', async () => {
            const versionInfo = s`${tempDir}/node_modules/brighterscript`;
            await expectThrowsAsync(async () => {
                await languageServerManager['ensureBscVersionInstalled'](versionInfo);
            }, `"${s(versionInfo)}" does not contain a package.json file`);
        });

        it('installs a bsc version when not present', async () => {
            const info = await languageServerManager['ensureBscVersionInstalled']('0.65.0');
            expect(info).to.eql({
                packageDir: s`${storageDir}/brighterscript/0.65.0/node_modules/brighterscript`,
                versionInfo: '0.65.0',
                version: '0.65.0'
            });
            expect(
                fsExtra.pathExistsSync(info.packageDir)
            ).to.be.true;
        });

        it.skip('does not run multiple installs for the same version at the same time', async () => {
            let spy = sinon.stub(util, 'spawnNpmAsync').callsFake(async (command, options) => {
                //simulate that the bsc code was installed
                fsExtra.outputFileSync(`${options.cwd}/node_modules/brighterscript/dist/index.js`, '');
                //ensure both requests have the opportunity to run at same time
                await util.sleep(1000);
            });
            //request the install multiple times without waiting for them
            const promises = [
                languageServerManager['ensureBscVersionInstalled']('0.65.0'),
                languageServerManager['ensureBscVersionInstalled']('0.65.0'),
                languageServerManager['ensureBscVersionInstalled']('0.65.1')
            ];

            //now wait for them to finish
            expect(
                (await Promise.all(promises)).map(x => x.packageDir)
            ).to.eql([
                s`${storageDir}/brighterscript/0.65.0/node_modules/brighterscript`,
                s`${storageDir}/brighterscript/0.65.0/node_modules/brighterscript`,
                s`${storageDir}/brighterscript/0.65.1/node_modules/brighterscript`
            ]);

            //the spy should have only been called once for each unique version
            expect(spy.getCalls().map(x => x.args[1].cwd)).to.eql([
                s`${storageDir}/brighterscript/0.65.0`,
                s`${storageDir}/brighterscript/0.65.1`
            ]);
        });

        it.skip('reuses the same bsc version when already exists', async () => {
            let spy = sinon.spy(util, 'spawnNpmAsync');
            fsExtra.ensureDirSync(
                s`${storageDir}/brighterscript/0.65.0/node_modules/brighterscript/dist/index.js`
            );
            expect(
                await languageServerManager['ensureBscVersionInstalled']('0.65.0')
            ).to.eql({
                packageDir: s`${storageDir}/brighterscript/0.65.0/node_modules/brighterscript`,
                version: '0.65.0',
                versionInfo: '0.65.0'
            });
            expect(
                fsExtra.pathExistsSync(s`${storageDir}/brighterscript/0.65.0/node_modules/brighterscript`)
            ).to.be.true;

            //the install should not have been called
            expect(spy.called).to.be.false;
        });

        it('installs from url', async () => {
            fsExtra.ensureDirSync(
                s`${storageDir}/brighterscript/0.65.0/node_modules/brighterscript/dist/index.js`
            );
            expect(
                await languageServerManager['ensureBscVersionInstalled'](
                    'https://github.com/rokucommunity/brighterscript/releases/download/v0.67.6/brighterscript-0.67.6.tgz'
                )
            ).to.eql({
                packageDir: s`${storageDir}/brighterscript/71f52abe1087b924a1ded1e6d8a71022/node_modules/brighterscript`,
                version: '0.67.6',
                versionInfo: 'https://github.com/rokucommunity/brighterscript/releases/download/v0.67.6/brighterscript-0.67.6.tgz'
            });
            expect(
                fsExtra.pathExistsSync(s`${storageDir}/brighterscript/71f52abe1087b924a1ded1e6d8a71022/node_modules/brighterscript`)
            ).to.be.true;
        });

        it('repairs a broken bsc version', async () => {

            //mock the actual installation process (since we're handling when it crashes)
            let callCount = 0;
            sinon.stub(util, 'spawnNpmAsync').callsFake(async (args, options) => {
                callCount++;
                //fail first time, pass all others
                if (callCount === 1) {
                    throw new Error('failed');
                }
                await fsExtra.outputJson(`${options.cwd}/node_modules/brighterscript/package.json`, {
                    version: '0.65.0'
                });
            });

            //install the package
            expect(
                await languageServerManager['ensureBscVersionInstalled']('0.65.0')
            ).to.eql({
                packageDir: s`${storageDir}/brighterscript/0.65.0/node_modules/brighterscript`,
                version: '0.65.0',
                versionInfo: '0.65.0'
            });
        });
    });

    describe('deleteOutdatedBscVersions', () => {
        beforeEach(() => {
            //prevent lsp from actually running
            sinon.stub(languageServerManager as any, 'syncVersionAndTryRun').returns(Promise.resolve());
        });

        it('runs after a short delay after init', async () => {
            const stub = sinon.stub(languageServerManager as any, 'deleteOutdatedBscVersions').callsFake(() => { });

            languageServerManager['outdatedBscVersionDeleteDelay'] = 50;

            await languageServerManager.init(languageServerManager['context'], languageServerManager['definitionRepository'], languageServerManager['localPackageManager']);

            expect(stub.called).to.be.false;

            await util.sleep(100);
            expect(stub.called).to.be.true;
        });
    });

    describe('getActiveRunsTooltipText', () => {
        it('returns empty string when no active runs', () => {
            expect(
                languageServerManager['getActiveRunsTooltipText']([])
            ).to.eql('');
            expect(
                languageServerManager['getActiveRunsTooltipText'](undefined as any)
            ).to.eql('');
            expect(
                languageServerManager['getActiveRunsTooltipText']('' as any)
            ).to.eql('');
        });

        it('prints unscoped events at top', () => {
            let date = Date.now();
            let dateText = new Date(date).toLocaleTimeString();
            expect(
                undent(
                    languageServerManager['getActiveRunsTooltipText']([
                        { label: 'scoped-validate', startTime: Date.now(), scope: 'prj1' },
                        { label: 'validate', startTime: Date.now() }
                    ])
                )
            ).to.eql(undent`
                general:
                \tvalidate (since ${dateText})
                prj1:
                \tscoped-validate (since ${dateText})
            `);
        });
    });
});
