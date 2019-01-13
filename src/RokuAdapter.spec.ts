/* tslint:disable:no-unused-expression */
/* tslint:disable:no-var-requires */
import { assert } from 'chai';
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

import { RokuAdapter } from './RokuAdapter';

describe('RokuAdapter ', () => {
    let adapter: RokuAdapter;
    let adapterMock;
    let languagesMock;

    beforeEach(() => {
        const outputChannel = new vscode.OutputChannel();
        const debugCollection = new vscode.DebugCollection();
        languagesMock = sinon.mock(vscode.languages);
        languagesMock.expects('createDiagnosticCollection').returns(debugCollection);

        adapter = new RokuAdapter('127.0.0.1');
        adapterMock = sinon.mock(adapter);
    });

    afterEach(() => {
        languagesMock.restore();
        adapterMock.restore();
    });

    describe('getSingleFileXmlError ', () => {
        it('tests no input', () => {
            let input = [''];
            let errors = adapter.getSingleFileXmlError(input);
            assert.isEmpty(errors);
        });

        it('tests no match', () => {
            let input = ['some other output'];
            let errors = adapter.getSingleFileXmlError(input);
            assert.isEmpty(errors);
        });

        it('tests no match multiline', () => {
            let input = [`multiline text`, `with no match`];
            let errors = adapter.getSingleFileXmlError(input);
            assert.isEmpty(errors);
        });

        it('match', () => {
            let input = [`-------> Error parsing XML component SimpleEntitlements.xml`];
            let errors = adapter.getSingleFileXmlError(input);
            assert.lengthOf(errors, 1);
            let error = errors[0];
            assert.equal(error.path, 'SimpleEntitlements.xml');
        });
    });

    describe('getMultipleFileXmlError ', () => {
        it('tests no input', () => {
            let input = [''];
            let errors = adapter.getMultipleFileXmlError(input);
            assert.isEmpty(errors);
        });

        it('tests no match', () => {
            let input = ['some other output'];
            let errors = adapter.getMultipleFileXmlError(input);
            assert.isEmpty(errors);
        });

        it('tests no match multiline', () => {
            let input = [`multiline text`, `with no match`];
            let errors = adapter.getMultipleFileXmlError(input);
            assert.isEmpty(errors);
        });

        it('match 1 file', () => {
            let input = [`-------> Error parsing multiple XML components (SimpleEntitlements.xml)`];
            let errors = adapter.getMultipleFileXmlError(input);
            assert.lengthOf(errors, 1);
            let error = errors[0];
            assert.equal(error.path, 'SimpleEntitlements.xml');
        });

        it('match 2 files', () => {
            let input = [`-------> Error parsing multiple XML components (SimpleEntitlements.xml, Otherfile.xml)`];
            let errors = adapter.getMultipleFileXmlError(input);
            assert.lengthOf(errors, 2);
            let error = errors[0];
            assert.equal(error.path, 'SimpleEntitlements.xml');

            let error2 = errors[1];
            assert.equal(error2.path, 'Otherfile.xml');
        });

        it('match 2 files amongst other stuff', () => {
            let input = [
                `some other output`,
                `some other output2`,
                `-------> Error parsing multiple XML components (SimpleEntitlements.xml, Otherfile.xml)`,
                `some other output3`
            ];
            let errors = adapter.getMultipleFileXmlError(input);
            assert.lengthOf(errors, 2);
            let error = errors[0];
            assert.equal(error.path, 'SimpleEntitlements.xml');

            let error2 = errors[1];
            assert.equal(error2.path, 'Otherfile.xml');
        });
    });
});
