import { expect } from 'chai';
import { createSandbox } from 'sinon';
import { vscode } from '../mockVscode.spec';
import type { BrightScriptLaunchConfiguration } from '../DebugConfigurationProvider';
import { WebviewViewProviderManager } from './WebviewViewProviderManager';
import { RtaManager } from './RtaManager';


const sinon = createSandbox();

describe('WebviewViewProviderManager', () => {
    let context: any;

    const config = {} as BrightScriptLaunchConfiguration;
    let webviewViewProviderManager: WebviewViewProviderManager;
    let rtaManager: RtaManager;

    before(() => {
        context = {
            ...vscode.context,
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

        config.host = '86.75.30.9';
        config.password = 'jenny';

    });

    afterEach(() => {
        sinon.restore();
    });


    describe('constructor', () => {
        let spy;
        before(() => {
            spy = sinon.spy(vscode.window, 'registerWebviewViewProvider');
            rtaManager = new RtaManager();
            webviewViewProviderManager = new WebviewViewProviderManager(context, rtaManager);
        });

        it('initializes webview providers and calls registerWebviewViewProvider for each', () => {
            expect(spy.callCount).to.equal(webviewViewProviderManager.getWebviewViewProviders().length);
        });

        it('assigns RtaManager to each webviewViewProvider', () => {
            for (const webviewViewProvider of webviewViewProviderManager.getWebviewViewProviders()) {
                expect(webviewViewProvider['rtaManager']).to.equal(rtaManager);
            }
            expect(spy.callCount).to.equal(webviewViewProviderManager.getWebviewViewProviders().length);
        });
    });


    describe('onChannelPublishedEvent', () => {
        let event: any;

        before(() => {
            event = {
                event: 'ChannelPublishedEvent',
                body: {
                    launchConfiguration: config
                }
            };

            rtaManager = new RtaManager();
            webviewViewProviderManager = new WebviewViewProviderManager(context, rtaManager);
            rtaManager.setWebviewViewProviderManager(webviewViewProviderManager);
        });

        it('calls setupRtaWithConfig', () => {
            const spy = sinon.stub(rtaManager, 'setupRtaWithConfig').returns(undefined);
            webviewViewProviderManager.onChannelPublishedEvent(event);
            expect(spy.calledOnce).to.be.true;
        });

        it('has the correct config values passed from the extension', () => {
            webviewViewProviderManager.onChannelPublishedEvent(event);
            const deviceConfig = rtaManager.device.getCurrentDeviceConfig();
            expect(deviceConfig.host).to.equal(config.host);
            expect(deviceConfig.password).to.equal(config.password);
        });
    });
});
