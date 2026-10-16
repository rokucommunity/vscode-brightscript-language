import { expect } from 'chai';
import type { SinonStub } from 'sinon';
import { createSandbox } from 'sinon';
const sinon = createSandbox();
let Module = require('module');

import { vscode } from '../../mockVscode.spec';

const { require: oldRequire } = Module.prototype;

Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

import { DeclarationProvider } from '../../DeclarationProvider';
import { LegacyLogOutput } from './LegacyLogOutput';
import { LogDocumentLinkProvider } from './LogDocumentLinkProvider';
import { LogOutputManager } from './LogOutputManager';

describe('LegacyLogOutput', () => {
    let logOutput: LegacyLogOutput;
    let registerStub: SinonStub;

    beforeEach(() => {
        sinon.restore();
        registerStub = sinon.stub(vscode.languages, 'registerDocumentLinkProvider').returns({ dispose: () => { } } as any);
        logOutput = new LegacyLogOutput(new vscode.OutputChannel() as any, vscode.context as any, new DeclarationProvider());
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('link provider', () => {
        function document(path: string, scheme = 'output') {
            return { uri: { scheme: scheme, path: path } } as any;
        }

        function provideLinks(doc: any) {
            expect(registerStub.calledOnce).to.be.true;
            expect(registerStub.getCall(0).args[0]).to.eql({ scheme: 'output' });
            return registerStub.getCall(0).args[1].provideDocumentLinks(doc, undefined);
        }

        beforeEach(() => {
            sinon.stub(LogDocumentLinkProvider.prototype, 'provideDocumentLinks').returns(['link'] as any);
        });

        it('provides links for the BrightScript Log channel', () => {
            expect(provideLinks(document('extension-output-RokuCommunity.brightscript-#1-BrightScript Log'))).to.eql(['link']);
        });

        it('does not provide links for other output channels', () => {
            expect(provideLinks(document('extension-output-vscode.git-#1-Git'))).to.eql([]);
            expect(provideLinks(document('extension-output-RokuCommunity.brightscript-#2-SceneGraph Debug Commands'))).to.eql([]);
        });

        it('does not provide links for non-output documents', () => {
            expect(provideLinks(document('/project/BrightScript Log', 'file'))).to.eql([]);
        });
    });

    it('sends the launch config to both the link provider and the output manager', async () => {
        const linkStub = sinon.stub(LogDocumentLinkProvider.prototype, 'setLaunchConfig').resolves();
        const managerStub = sinon.stub(LogOutputManager.prototype, 'setLaunchConfig');
        const config = { rootDir: 'rootDir' } as any;

        await logOutput.setLaunchConfig(config);

        expect(linkStub.calledOnceWith(config)).to.be.true;
        expect(managerStub.calledOnceWith(config)).to.be.true;
    });

    it('forwards debug session events to the output manager', async () => {
        const startStub = sinon.stub(LogOutputManager.prototype, 'onDidStartDebugSession');
        const eventStub = sinon.stub(LogOutputManager.prototype, 'onDidReceiveDebugSessionCustomEvent').resolves();
        const event = { event: 'LogOutputEvent', body: { line: 'hello' } };

        logOutput.onDidStartDebugSession();
        await logOutput.onDidReceiveDebugSessionCustomEvent(event);

        expect(startStub.calledOnce).to.be.true;
        expect(eventStub.calledOnceWith(event)).to.be.true;
    });
});
