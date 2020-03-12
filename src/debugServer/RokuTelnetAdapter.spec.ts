/* tslint:disable:no-unused-expression */
/* tslint:disable:no-var-requires */
import { assert, expect } from 'chai';
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

import { EvaluateContainer, RokuTelnetAdapter } from './RokuTelnetAdapter';

describe('RokuAdapter ', () => {
    let adapter: RokuTelnetAdapter;
    let adapterMock;
    let languagesMock;

    beforeEach(() => {
        const outputChannel = new vscode.OutputChannel();
        const debugCollection = new vscode.DebugCollection();
        languagesMock = sinon.mock(vscode.languages);
        languagesMock.expects('createDiagnosticCollection').returns(debugCollection);

        adapter = new RokuTelnetAdapter('127.0.0.1');
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

    describe('getExpressionDetails', () => {
        it('correctly handles both types of line endings', () => {
            expect(adapter.getExpressionDetails(
                'vscode_key_start:message1:vscode_key_stop vscode_is_string:trueHello\r\n' +
                'vscode_key_start:message2:vscode_key_stop vscode_is_string:trueWorld\r\n' +
                '\r\n' +
                'Brightscript Debugger>'
            )).to.equal((
                'vscode_key_start:message1:vscode_key_stop vscode_is_string:trueHello\r\n' +
                'vscode_key_start:message2:vscode_key_stop vscode_is_string:trueWorld\r\n'
            ));
        });
    });

    describe('getHighLevelTypeDetails', () => {
        it('works', () => {
            expect(adapter.getObjectType('<Component: roAssociativeArray>')).to.equal('roAssociativeArray');
            expect(adapter.getObjectType('<Component: roInvalid>')).to.equal('roInvalid');
            expect(adapter.getObjectType('<Component: roSGNode:ContentNode>')).to.equal('roSGNode:ContentNode');
        });
    });

    // tslint:disable:no-trailing-whitespace disable for this test because trailing whitespace matters
    describe('getForLoopPrintedChildren', () => {
        it('finds the proper number of children', () => {
            expect(adapter.getForLoopPrintedChildren('arr', `
                vscode_is_string:falsetrue
                vscode_is_string:falsefalse
                vscode_is_string:truecat
                vscode_is_string:truecat 
                vscode_is_string:true
                vscode_is_string:true 
            `).length).to.equal(6);
        });
        it('handles basic arrays', () => {
            expect(adapter.getForLoopPrintedChildren('arr', `vscode_is_string:false 1.1 `)[0]).to.deep.include(<EvaluateContainer>{
                name: '0',
                evaluateName: 'arr[0]',
                type: 'Integer',
                value: '1.1'
            });
            expect(adapter.getForLoopPrintedChildren('arr', `vscode_is_string:falsetrue`)[0]).to.deep.include(<EvaluateContainer>{
                type: 'Boolean',
                value: 'true'
            });
            expect(adapter.getForLoopPrintedChildren('arr', `vscode_is_string:falsefalse`)[0]).to.deep.include(<EvaluateContainer>{
                type: 'Boolean',
                value: 'false'
            });
            expect(adapter.getForLoopPrintedChildren('arr', `vscode_is_string:trueTrailingSpace `)[0]).to.deep.include(<EvaluateContainer>{
                type: 'String',
                value: '"TrailingSpace "'
            });
            //empty string
            expect(adapter.getForLoopPrintedChildren('arr', `vscode_is_string:true`)[0]).to.deep.include(<EvaluateContainer>{
                type: 'String',
                value: '""'
            });
            //whitespace-only string
            expect(adapter.getForLoopPrintedChildren('arr', `vscode_is_string:true `)[0]).to.deep.include(<EvaluateContainer>{
                type: 'String',
                value: '" "'
            });
        });

        it('handles newlines in strings', () => {
            expect(adapter.getForLoopPrintedChildren('arr', `vscode_is_string:true\n`)[0]).to.deep.include(<EvaluateContainer>{
                type: 'String',
                value: '"\n"'
            });
            expect(adapter.getForLoopPrintedChildren('arr', `vscode_is_string:trueRoku\n`)[0]).to.deep.include(<EvaluateContainer>{
                type: 'String',
                value: '"Roku\n"'
            });
            expect(adapter.getForLoopPrintedChildren('arr', `vscode_is_string:true\nRoku`)[0]).to.deep.include(<EvaluateContainer>{
                type: 'String',
                value: '"\nRoku"'
            });
            expect(adapter.getForLoopPrintedChildren('arr', `vscode_is_string:trueRoku\nRoku`)[0]).to.deep.include(<EvaluateContainer>{
                type: 'String',
                value: '"Roku\nRoku"'
            });
        });

        it('skips empty lines', () => {
            //not sure when this would happen in reality, but test it just in case
            expect(adapter.getForLoopPrintedChildren('testNode', `
                vscode_key_start:focusable:vscode_key_stop vscode_is_string:falsefalse

                vscode_key_start:id:vscode_key_stop vscode_is_string:true
            `)).to.be.lengthOf(2);
        });

        it('handles lists larger than 100', () => {

        });

        it('does not include an extra newline for the last item when it is a string', () => {
            const variables = adapter.getForLoopPrintedChildren('testNode',
                'vscode_key_start:message1:vscode_key_stop vscode_is_string:trueHello\n' +
                'vscode_key_start:message2:vscode_key_stop vscode_is_string:trueWorld'
            );
            expect(variables.find(x => x.name === 'message1').value).to.equal('"Hello"');
            expect(variables.find(x => x.name === 'message2').value).to.equal('"World"');
        });

        it('handles nodes with nested arrays', () => {
            const variables = adapter.getForLoopPrintedChildren('testNode',
                `vscode_key_start:change:vscode_key_stop vscode_is_string:false<Component: roAssociativeArray> =
{
    Index1: 0
    Index2: 0
    Operation: "none"
}
vscode_key_start:EDID:vscode_key_stop vscode_is_string:false<Component: roByteArray> =
[
    0
    ...
]
vscode_key_start:focusable:vscode_key_stop vscode_is_string:falsefalse
vscode_key_start:focusedChild:vscode_key_stop vscode_is_string:false<Component: roInvalid>
vscode_key_start:id:vscode_key_stop vscode_is_string:true
vscode_key_start:mynewfield:vscode_key_stop vscode_is_string:false<Component: roSGNode:ContentNode> =
{
    change: <Component: roAssociativeArray>
    focusable: false
    focusedChild: <Component: roInvalid>
    id: ""
    TITLE: "Node Three"
}`
            );
            expect(variables).to.be.lengthOf(6);

            expect(variables.find(x => x.name === 'change')).to.deep.include(<EvaluateContainer>{
                evaluateName: 'testNode["change"]',
                type: 'roAssociativeArray',
            });
            // check children of testNode.change
            {
                expect(variables.find(x => x.name === 'change').children[0]).to.deep.include(<EvaluateContainer>{
                    name: 'Index1',
                    evaluateName: 'testNode["change"].Index1',
                    //TODO -- is this correct?
                    type: 'Float',
                    value: '0'
                });
                //TODO check children of testNode.change
                expect(variables.find(x => x.name === 'change').children[1]).to.deep.include(<EvaluateContainer>{
                    name: 'Index2',
                    evaluateName: 'testNode["change"].Index2',
                    //TODO -- is this correct?
                    type: 'Float',
                    value: '0'
                });
                //TODO check children of testNode.change
                expect(variables.find(x => x.name === 'change').children[2]).to.deep.include(<EvaluateContainer>{
                    name: 'Operation',
                    evaluateName: 'testNode["change"].Operation',
                    type: 'String',
                    value: '"none"'
                });
            }
            expect(variables.find(x => x.name === 'EDID')).to.deep.include(<EvaluateContainer>{
                evaluateName: 'testNode["EDID"]',
                type: 'roByteArray',
            });
            //children of EDID should be null, because we encountered the elipses (...) which means it should be evaluated later 
            expect(variables.find(x => x.name === 'EDID').children[0]).to.be.undefined;

            expect(variables.find(x => x.name === 'focusable')).to.deep.include(<EvaluateContainer>{
                evaluateName: 'testNode["focusable"]',
                type: 'Boolean',
                value: 'false'
            });
            expect(variables.find(x => x.name === 'focusedChild')).to.deep.include(<EvaluateContainer>{
                evaluateName: 'testNode["focusedChild"]',
                type: 'roInvalid',
                value: 'roInvalid'
            });
            expect(variables.find(x => x.name === 'id')).to.deep.include(<EvaluateContainer>{
                evaluateName: 'testNode["id"]',
                type: 'String',
                value: '""'
            });
            expect(variables.find(x => x.name === 'mynewfield')).to.deep.include(<EvaluateContainer>{
                evaluateName: 'testNode["mynewfield"]',
                type: 'roSGNode:ContentNode',
            });
        });

    });
});
