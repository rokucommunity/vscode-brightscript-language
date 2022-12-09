import { expect } from 'chai';
import { createSandbox } from 'sinon';
let Module = require('module');
import * as extension from './extension';
import { vscode, vscodeLanguageClient } from './mockVscode.spec';
import { BrightScriptCommands } from './BrightScriptCommands';
import { languageServerManager } from './LanguageServerManager';
import * as rta from 'roku-test-automation';
import type { BrightScriptLaunchConfiguration } from './DebugConfigurationProvider';

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

describe('extension', () => {
    let context: any;
    let originalWebviews;
    const extensionInstance = extension.extension;

    beforeEach(() => {
        sinon.stub(languageServerManager, 'init').returns(Promise.resolve());

        context = {
            extensionPath: '',
            subscriptions: [],
            asAbsolutePath: () => { },
            globalState: {
                get: () => {

                },
                update: () => {

                }
            }
        };

        originalWebviews = extensionInstance['webviews'];
        extensionInstance['webviews'] = [];
    });

    afterEach(() => {
        extensionInstance.odc = undefined;
        extensionInstance['webviews'] = originalWebviews;
        sinon.restore();
    });

    it('registers configuration provider', async () => {
        let spy = sinon.spy(vscode.debug, 'registerDebugConfigurationProvider');
        expect(spy.calledOnce).to.be.false;
        await extension.activate(context);
        expect(spy.calledOnce).to.be.true;
    });

    it('registers formatter', async () => {
        let spy = sinon.spy(vscode.languages, 'registerDocumentRangeFormattingEditProvider');
        expect(spy.getCalls().length).to.equal(0);
        await extension.activate(context);
        expect(spy.getCalls().length).to.be.greaterThan(1);
    });

    it('registers definition provider', async () => {
        let spy = sinon.spy(vscode.languages, 'registerDefinitionProvider');
        expect(spy.calledOnce).to.be.false;
        await extension.activate(context);
        expect(spy.callCount).to.be.greaterThan(0);
    });

    it('registers all commands', async () => {
        let stub = sinon.stub(BrightScriptCommands.prototype, 'registerCommands').callsFake(() => { });
        await extension.activate(context);
        expect(stub.callCount).to.equal(1);
    });

    it('registers onDidStartDebugSession', async () => {
        let spy = sinon.spy(vscode.debug, 'onDidStartDebugSession');
        expect(spy.calledOnce).to.be.false;
        await extension.activate(context);
        expect(spy.calledOnce).to.be.true;
    });

    it('registers onDidTerminateDebugSession', async () => {
        let spy = sinon.spy(vscode.debug, 'onDidTerminateDebugSession');
        expect(spy.calledOnce).to.be.false;
        await extension.activate(context);
        expect(spy.calledOnce).to.be.true;
    });

    it('registers onDidReceiveDebugSessionCustomEvent', async () => {
        let spy = sinon.spy(vscode.debug, 'onDidReceiveDebugSessionCustomEvent');
        expect(spy.calledOnce).to.be.false;
        await extension.activate(context);
        expect(spy.getCalls().length).to.be.greaterThan(0);
    });

    describe('RDB', () => {
        const config = {} as BrightScriptLaunchConfiguration;
        let context;
        beforeEach(() => {
            context = { ...vscode.context };
            config.host = '86.75.30.9';
            config.password = 'jenny';
        });

        describe('setupODC', () => {
            it('sets up the underlying RokuDevice instance', () => {
                const odc = extensionInstance['setupODC'](config);
                expect(odc.device).to.be.instanceOf(rta.RokuDevice);
            });

            it('has the correct config values passed from the extension', () => {
                const odc = extensionInstance['setupODC'](config);
                const deviceConfig = odc.device.getCurrentDeviceConfig();
                expect(deviceConfig.host).to.equal(config.host);
                expect(deviceConfig.password).to.equal(config.password);
            });
        });

        describe('registerWebViewProviders', () => {
            it('initializes webview providers and calls registerWebviewViewProvider for each', () => {
                extensionInstance['webviews'] = originalWebviews;
                const spy = sinon.spy(vscode.window, 'registerWebviewViewProvider');
                extensionInstance['registerWebviewProviders'](context);
                expect(spy.callCount).to.equal(Object.keys(originalWebviews).length);
            });
        });

        describe('debugSessionCustomEventHandler', () => {
            describe('ChannelPublishedEvent', () => {
                const e = {
                    event: 'ChannelPublishedEvent',
                    body: {
                        launchConfiguration: config
                    }
                };

                it('calls setupODC to create the odc instance if enabled', async () => {
                    config.injectRdbOnDeviceComponent = true;
                    const spy = sinon.stub(extensionInstance as any, 'setupODC').returns(undefined);
                    await extensionInstance['debugSessionCustomEventHandler'](e, {} as any, {} as any, {} as any, {} as any);
                    expect(spy.calledOnce).to.be.true;
                });

                it('does not call setupODC if not enabled', async () => {
                    config.injectRdbOnDeviceComponent = false;
                    const spy = sinon.stub(extensionInstance as any, 'setupODC').returns(undefined);
                    await extensionInstance['debugSessionCustomEventHandler'](e, {} as any, {} as any, {} as any, {} as any);
                    expect(spy.callCount).to.equal(0);
                });
            });
        });
    });
});
