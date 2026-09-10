import { expect } from 'chai';
import { createSandbox } from 'sinon';
import { vscode } from '../mockVscode.spec';
import type { BrightScriptLaunchConfiguration } from '../DebugConfigurationProvider';
import { WebviewViewProviderManager } from './WebviewViewProviderManager';
import { RtaManager } from './RtaManager';
import { RceManager } from './RceManager';
import { RceFinder } from '../deviceDiscovery/RceFinder';
import { BrightScriptCommands } from '../BrightScriptCommands';


const sinon = createSandbox();

describe('WebviewViewProviderManager', () => {
    let context: any;

    const config = {} as BrightScriptLaunchConfiguration;
    let webviewViewProviderManager: WebviewViewProviderManager;
    let rtaManager: RtaManager;
    let rceManager: RceManager;
    let rceFinder: RceFinder;
    const deviceManager = { getDevice: () => undefined } as any;
    const brightScriptCommands = new BrightScriptCommands({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    const deviceTargetManager = {} as any;

    before(() => {
        context = {
            ...vscode.context
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
            rceManager = new RceManager(context);
            rtaManager = new RtaManager(context, rceManager, deviceManager);
            rceFinder = new RceFinder(rceManager);
            webviewViewProviderManager = new WebviewViewProviderManager(context, rtaManager, rceManager, rceFinder, deviceManager, brightScriptCommands, deviceTargetManager);
        });

        it('initializes webview providers and calls registerWebviewViewProvider for each', () => {
            expect(spy.callCount).to.equal(webviewViewProviderManager.getWebviewViewProviders().length);
        });

        it('assigns dependencies to each webviewViewProvider', () => {
            for (const webviewViewProvider of webviewViewProviderManager.getWebviewViewProviders()) {
                expect(webviewViewProvider['dependencies']['rtaManager']).to.equal(rtaManager);
                expect(webviewViewProvider['dependencies']['rceManager']).to.equal(rceManager);
                expect(webviewViewProvider['dependencies']['rceFinder']).to.equal(rceFinder);
                expect(webviewViewProvider['dependencies']['deviceManager']).to.equal(deviceManager);
                expect(webviewViewProvider['dependencies']['brightScriptCommands']).to.equal(brightScriptCommands);
                expect(webviewViewProvider['dependencies']['deviceTargetManager']).to.equal(deviceTargetManager);
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

            rceManager = new RceManager(context);
            rtaManager = new RtaManager(context, rceManager, deviceManager);
            rceFinder = new RceFinder(rceManager);
            webviewViewProviderManager = new WebviewViewProviderManager(context, rtaManager, rceManager, rceFinder, deviceManager, brightScriptCommands, deviceTargetManager);
            rtaManager.setWebviewViewProviderManager(webviewViewProviderManager);
        });

        it('calls setupRtaWithConfig', () => {
            const spy = sinon.stub(rtaManager, 'setupRtaWithConfig').resolves(undefined);
            webviewViewProviderManager.onChannelPublishedEvent(event);
            expect(spy.calledOnce).to.be.true;
        });

        it('has the correct config values passed from the extension', () => {
            webviewViewProviderManager.onChannelPublishedEvent(event);
            const deviceConfig = rtaManager.device.getCurrentDeviceConfig() as { host?: string; password: string };
            expect(deviceConfig.host).to.equal(config.host);
            expect(deviceConfig.password).to.equal(config.password);
        });
    });
});
