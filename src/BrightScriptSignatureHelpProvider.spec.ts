/* tslint:disable:no-unused-expression */
/* tslint:disable:no-var-requires */
import * as sinon from 'sinon';
let Module = require('module');

import { vscode } from './mockVscode.spec';

//override the "require" call to mock certain items
const { require: oldRequire } = Module.prototype;

Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

import { BrightScriptDeclaration } from './BrightScriptDeclaration';
import BrightScriptSignatureHelpProvider from './BrightScriptSignatureHelpProvider';

describe('BrightScriptSignatureHelpProvider ', () => {
    let providerMock;
    let provider: BrightScriptSignatureHelpProvider;
    let definitionRepo;
    let definitionRepoMock;
    let documentMock;
    let document;

    beforeEach(() => {
        definitionRepo = { findDefinition: () => { } };
        definitionRepoMock = sinon.mock(definitionRepo);
        document = { getText: () => { } };
        documentMock = sinon.mock(document);
        provider = new BrightScriptSignatureHelpProvider(definitionRepo);
        providerMock = sinon.mock(provider);
    });

    afterEach(() => {
        documentMock.restore();
        providerMock.restore();
        definitionRepoMock.restore();
    });

    describe('provideSignatureHelp', () => {
        describe('no symbols', () => {
            it('no symbol at position', () => {
                let text = 'function methodNoArgs()';
                documentMock.expects('getText').once().returns(text);
                let nextStub = sinon.stub();
                nextStub.onCall(0).returns(undefined);
                let def = { next: nextStub };

                definitionRepoMock.expects('findDefinition').once().returns(def);
                let position: any = new vscode.Position(10, 10);
                provider.provideSignatureHelp(document, position, undefined);
                definitionRepoMock.verify();
                documentMock.verify();
            });
            it('no text at position', () => {
                let text = '';
                documentMock.expects('getText').once().returns(text);
                let nextStub = sinon.stub();
                nextStub.onCall(0).returns(undefined);
                let def = { next: nextStub };

                definitionRepoMock.expects('findDefinition').once().returns(def);
                let position: any = new vscode.Position(10, 10);
                provider.provideSignatureHelp(document, position, undefined);
                definitionRepoMock.verify();
                documentMock.verify();
            });
        });

        describe('one symbol', () => {
            it('one arg for function', (done) => {
                let text = 'function methodNoArgs(arg1)';
                documentMock.expects('getText').once().returns(text);
                let nextStub = sinon.stub();
                nextStub.onCall(0).returns(
                    {
                        value: new BrightScriptDeclaration(
                            'methodNoArgs',
                            vscode.SymbolKind.TypeParameter,
                            undefined,
                            ['arg1'],
                            new vscode.Range(0, 0, 0, 0) as any,
                            new vscode.Range(0, 0, 0, 0) as any,
                            undefined)
                    });

                let def = { next: nextStub };
                definitionRepoMock.expects('findDefinition').once().returns(def);
                let position: any = new vscode.Position(10, 10);
                provider.provideSignatureHelp(document, position, undefined).then((res) => {
                    definitionRepoMock.verify();
                    documentMock.verify();
                    done();
                });
            });
        });
    });
});
