/* tslint:disable:no-unused-expression */
/* tslint:disable:no-var-requires */
/* tslint:disable:no-string-literal */
import { createSandbox } from 'sinon';
let Module = require('module');
import { vscode, vscodeLanguageClient } from './mockVscode.spec';
import { LanguageServerManager } from './LanguageServerManager';
import { expect } from 'chai';
import { DefinitionRepository } from './DefinitionRepository';
import { DeclarationProvider } from './DeclarationProvider';
import { ExtensionContext } from 'vscode';

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
    });

    it('registers referenceProvider', async () => {
        let spy = sinon.spy(vscode.languages, 'registerReferenceProvider');
        expect(spy.calledOnce).to.be.false;
        languageServerManager['enableSimpleProviders']();
        expect(spy.calledOnce).to.be.true;
    });

    it('registers signatureHelpProvider', async () => {
        let spy = sinon.spy(vscode.languages, 'registerSignatureHelpProvider');
        expect(spy.calledOnce).to.be.false;
        languageServerManager['enableSimpleProviders']();
        expect(spy.calledOnce).to.be.true;
    });

    it('registers workspace symbol provider', async () => {
        let spy = sinon.spy(vscode.languages, 'registerWorkspaceSymbolProvider');
        expect(spy.calledOnce).to.be.false;
        languageServerManager['enableSimpleProviders']();
        expect(spy.calledOnce).to.be.true;
    });

    it('registers document symbol provider', async () => {
        let spy = sinon.spy(vscode.languages, 'registerDocumentSymbolProvider');
        expect(spy.calledOnce).to.be.false;
        languageServerManager['enableSimpleProviders']();
        expect(spy.calledOnce).to.be.true;
    });
});
