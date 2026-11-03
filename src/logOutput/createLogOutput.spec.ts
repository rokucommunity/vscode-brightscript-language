import { expect } from 'chai';
import { createSandbox } from 'sinon';
const sinon = createSandbox();
let Module = require('module');

import { vscode } from '../mockVscode.spec';

const { require: oldRequire } = Module.prototype;

Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

import { DeclarationProvider } from '../DeclarationProvider';
import { BrightScriptLogOutput } from './BrightScriptLogOutput';
import { createLogOutput, USE_LEGACY_LOG_OUTPUT_SETTING } from './createLogOutput';
import { LegacyLogOutput } from './legacy/LegacyLogOutput';

describe('createLogOutput', () => {
    let context: any;
    let declarationProvider: DeclarationProvider;

    function create() {
        return createLogOutput(new vscode.OutputChannel() as any, context, declarationProvider);
    }

    /**
     * The configuration change listener createLogOutput registered
     */
    let onDidChangeConfiguration: (e: any) => Promise<void>;

    function setUseLegacy(value: boolean) {
        vscode.workspace._configuration['brightscript.output.useLegacyLogOutput'] = value;
    }

    function changeUseLegacy(value: boolean) {
        setUseLegacy(value);
        return onDidChangeConfiguration({ affectsConfiguration: (section: string) => section === USE_LEGACY_LOG_OUTPUT_SETTING });
    }

    beforeEach(() => {
        sinon.restore();
        vscode.workspace._configuration = {};
        context = { ...vscode.context, subscriptions: [] };
        //created before the stub below, so its own configuration listener isn't captured
        declarationProvider = new DeclarationProvider();
        sinon.stub(vscode.workspace, 'onDidChangeConfiguration').callsFake((listener) => {
            //only capture createLogOutput's listener, which is registered first
            onDidChangeConfiguration ??= listener;
            return { dispose: () => undefined } as any;
        });
        onDidChangeConfiguration = undefined;
    });

    afterEach(() => {
        for (const subscription of context.subscriptions) {
            subscription?.dispose?.();
        }
        sinon.restore();
        vscode.workspace._configuration = {};
    });

    it('uses the new implementation by default', () => {
        expect(create()).to.be.instanceOf(BrightScriptLogOutput);
    });

    it('uses the legacy implementation when the setting is enabled', () => {
        setUseLegacy(true);
        expect(create()).to.be.instanceOf(LegacyLogOutput);
    });

    it('offers to reload the window when the setting changes', async () => {
        const messageStub = sinon.stub(vscode.window, 'showInformationMessage').returns(Promise.resolve('Reload Window') as any);
        const executeStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
        create();

        await changeUseLegacy(true);

        expect(messageStub.calledOnce).to.be.true;
        expect(messageStub.getCall(0).args[0]).to.include(USE_LEGACY_LOG_OUTPUT_SETTING);
        expect(executeStub.calledOnceWith('workbench.action.reloadWindow')).to.be.true;
    });

    it('does not reload when the prompt is dismissed', async () => {
        sinon.stub(vscode.window, 'showInformationMessage').returns(Promise.resolve(undefined) as any);
        const executeStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
        create();

        await changeUseLegacy(true);

        expect(executeStub.called).to.be.false;
    });

    it('does not prompt when the setting ends up back where it started', async () => {
        const messageStub = sinon.stub(vscode.window, 'showInformationMessage').returns(Promise.resolve(undefined) as any);
        create();

        await changeUseLegacy(false);

        expect(messageStub.called).to.be.false;
    });
});
