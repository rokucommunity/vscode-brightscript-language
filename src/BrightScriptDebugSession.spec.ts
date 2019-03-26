/* tslint:disable:no-unused-expression */
import { expect } from 'chai';

import * as assert from 'assert';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as sinon from 'sinon';

import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';

import {
    BrightScriptDebugSession,
    defer
} from './BrightScriptDebugSession';
import {
    EvaluateContainer,
    HighLevelType,
    PrimativeType
} from './RokuAdapter';

describe('Debugger', () => {
    let session: BrightScriptDebugSession;
    let rokuAdapter: any = {
        on: () => {
            return () => {
            };
        },
        activate: () => Promise.resolve(),
        exitActiveBrightscriptDebugger: () => Promise.resolve()
    };
    beforeEach(() => {
        try {
            session = new BrightScriptDebugSession();

        } catch (e) {
            console.log(e);
        }
        //override the error response function and throw an exception so we can fail any tests
        (session as any).sendErrorResponse = function(...args) {
            throw new Error(args[2]);
        };
        //mock the rokuDeploy module with promises so we can have predictable tests
        session.rokuDeploy = <any>{
            prepublishToStaging: () => {
                return Promise.resolve();
            },
            zipPackage: () => {
                return Promise.resolve();
            },
            pressHomeButton: () => {
                return Promise.resolve();
            },
            publish: () => {
                return Promise.resolve();
            },
            createPackage: () => {
                return Promise.resolve();
            },
            deploy: () => {
                return Promise.resolve();
            },
            getOptions: () => {
            }
        };
        (session as any).rokuAdapter = rokuAdapter;
        //mock the roku adapter
        (session as any).connectRokuAdapter = () => {
            return Promise.resolve(rokuAdapter);
        };
    });

    describe('initializeRequest', () => {
        it('does not throw', () => {
            assert.doesNotThrow(() => {
                session.initializeRequest(<any>{}, <any>{});
            });
        });
    });
    it('baseProjectPath works', async () => {
        sinon.stub(session, 'sendEvent').callsFake((...args) => {
            //do nothing
        });
        (sinon.stub(session, <any>'loadStagingDirPaths') as any).callsFake(() => {

        });

        //skip adding breakpoint statements since that's not what we are currently testing
        (session as any).addBreakpointStatements = () => { };
        await session.launchRequest(<any>{}, <any>{
            rootDir: '1/2/3'
        });
        assert.equal(path.normalize(session.baseProjectPath), path.normalize('1/2/3'));
    });

    describe('evaluating variable', () => {
        let getVariableValue;
        let responseDeferreds = [];
        let responses = [];

        function getResponse(index: number) {
            let deferred = defer();
            (deferred as any).index = index;
            if (responses[index]) {
                deferred.resolve(responses[index]);
            } else {
                //do nothing, it will get resolved later
            }
            responseDeferreds.push(deferred);
            return deferred.promise;
        }

        function getBooleanEvaluateContainer(expression: string, name: string = null) {
            return <EvaluateContainer>{
                name: name || expression,
                evaluateName: expression,
                type: PrimativeType.boolean,
                value: 'true',
                highLevelType: HighLevelType.primative,
                children: null
            };
        }

        beforeEach(() => {
            //clear out the responses before each test
            responses = [];

            sinon.stub(session, 'sendResponse').callsFake((response) => {
                responses.push(response);

                let filteredList = [];

                //notify waiting deferreds
                for (let deferred of responseDeferreds) {
                    let index = (deferred as any).index;
                    if (responses.length - 1 >= index) {
                        deferred.resolve(responses[index]);
                    } else {
                        filteredList.push(deferred);
                    }
                }
            });

            rokuAdapter.getVariable = () => {
                return Promise.resolve(getVariableValue);
            };
        });

        it('returns the correct boolean variable', async () => {
            let expression = 'someBool';
            getVariableValue = getBooleanEvaluateContainer(expression);
            //adapter has to be at prompt for evaluates to work
            rokuAdapter.isAtDebuggerPrompt = true;
            session.evaluateRequest(<any>{}, { context: 'hover', expression: expression });
            let response = <DebugProtocol.EvaluateResponse>await getResponse(0);
            assert.deepEqual(response.body, {
                result: 'true',
                variablesReference: 0,
                namedVariables: 0,
                indexedVariables: 0
            });
        });

        it('returns the correct indexed variables count', async () => {
            let expression = 'someArray';
            getVariableValue = <EvaluateContainer>{
                name: expression,
                evaluateName: expression,
                type: 'roArray',
                value: 'roArray',
                highLevelType: HighLevelType.array,
                //shouldn't actually process the children
                children: [getBooleanEvaluateContainer('someArray[0]', '0'), getBooleanEvaluateContainer('someArray[1]', '1')]
            };
            //adapter has to be at prompt for evaluates to work
            rokuAdapter.isAtDebuggerPrompt = true;
            session.evaluateRequest(<any>{}, { context: 'hover', expression: expression });
            let response = <DebugProtocol.EvaluateResponse>await getResponse(0);
            assert.deepEqual(response.body, {
                result: 'roArray',
                variablesReference: 1,
                namedVariables: 0,
                indexedVariables: 2
            });
        });

        it('returns the correct named variables count', async () => {
            let expression = 'someObject';
            getVariableValue = <EvaluateContainer>{
                name: expression,
                evaluateName: expression,
                type: 'roAssociativeArray',
                value: 'roAssociativeArray',
                highLevelType: HighLevelType.object,
                //shouldn't actually process the children
                children: [getBooleanEvaluateContainer('someObject.isAlive', 'true'), getBooleanEvaluateContainer('someObject.ownsHouse', 'false')]
            };
            //adapter has to be at prompt for evaluates to work
            rokuAdapter.isAtDebuggerPrompt = true;
            session.evaluateRequest(<any>{}, { context: 'hover', expression: expression });
            let response = <DebugProtocol.EvaluateResponse>await getResponse(0);
            assert.deepEqual(response.body, {
                result: 'roAssociativeArray',
                variablesReference: 1,
                namedVariables: 2,
                indexedVariables: 0
            });
        });

        it.skip('allows retrieval of children', async () => {
            let expression = 'someObject';
            getVariableValue = <EvaluateContainer>{
                name: expression,
                evaluateName: expression,
                type: 'roAssociativeArray',
                value: 'roAssociativeArray',
                highLevelType: HighLevelType.object,
                //shouldn't actually process the children
                children: [getBooleanEvaluateContainer('someObject.isAlive', 'isAlive'), getBooleanEvaluateContainer('someObject.ownsHouse', 'ownsHouse')]
            };
            //adapter has to be at prompt for evaluates to work
            rokuAdapter.isAtDebuggerPrompt = true;
            session.evaluateRequest(<any>{}, { context: 'hover', expression: expression });
            /*let response = <DebugProtocol.EvaluateResponse>*/
            await getResponse(0);

            //get variables
            session.variablesRequest(<any>{}, { variablesReference: 1 });
            let childVars = <DebugProtocol.VariablesResponse>await getResponse(1);
            assert.deepEqual(childVars.body.variables, [
                {
                    name: 'isAlive',
                    value: 'true',
                    variablesReference: 2,
                    evaluateName: 'someObject.isAlive'
                }, {
                    name: 'ownsHouse',
                    value: 'true',
                    variablesReference: 3,
                    evaluateName: 'someObject.ownsHouse'
                }
            ]);
        });
    });
    describe('convertDebuggerPathToClient', () => {
        it('handles truncated paths', () => {
            let s: any = session;
            s.stagingDirPaths = ['folderA/file1.brs', 'folderB/file2.brs'];
            s.launchArgs = {
                rootDir: 'C:/someproject/src'
            };
            let clientPath = s.convertDebuggerPathToClient('...erA/file1.brs');
            expect(path.normalize(clientPath)).to.equal(path.normalize('C:/someproject/src/folderA/file1.brs'));

            clientPath = s.convertDebuggerPathToClient('...erB/file2.brs');
            expect(path.normalize(clientPath)).to.equal(path.normalize('C:/someproject/src/folderB/file2.brs'));

        });

        it('handles pkg paths', () => {
            let s: any = session;
            s.stagingDirPaths = ['folderA/file1.brs', 'folderB/file2.brs'];
            s.launchArgs = {
                rootDir: 'C:/someproject/src'
            };
            let clientPath = s.convertDebuggerPathToClient('pkg:folderA/file1.brs');
            expect(path.normalize(clientPath)).to.equal(path.normalize('C:/someproject/src/folderA/file1.brs'));

            clientPath = s.convertDebuggerPathToClient('pkg:folderB/file2.brs');
            expect(path.normalize(clientPath)).to.equal(path.normalize('C:/someproject/src/folderB/file2.brs'));
        });

    });

    describe('findMainFunction', () => {
        let folder;
        afterEach(() => {
            fs.emptyDirSync('./.tmp');
            fs.rmdirSync('./.tmp');
        });

        async function doTest(fileContents: string, lineContents: string, lineNumber: number) {
            fs.emptyDirSync('./.tmp');
            folder = path.resolve('./.tmp/findMainFunctionTests/');
            fs.mkdirSync(folder);

            let filePath = path.resolve(`${folder}/main.brs`);
            fs.writeFileSync(filePath, fileContents);
            let entryPoint = await session.findEntryPoint(folder);
            expect(entryPoint.path).to.equal(filePath);
            expect(entryPoint.lineNumber).to.equal(lineNumber);
            expect(entryPoint.contents).to.equal(lineContents);
        }

        it('works for RunUserInterface', async () => {
            await doTest('\nsub RunUserInterface()\nend sub', 'sub RunUserInterface()', 2);
            //works with args
            await doTest('\n\nsub RunUserInterface(args as Dynamic)\nend sub', 'sub RunUserInterface(args as Dynamic)', 3);
            //works with extra spacing
            await doTest('\n\nsub   RunUserInterface()\nend sub', 'sub   RunUserInterface()', 3);
            await doTest('\n\nsub RunUserInterface   ()\nend sub', 'sub RunUserInterface   ()', 3);
        });
        it('works for sub main', async () => {
            await doTest('\nsub Main()\nend sub', 'sub Main()', 2);
            //works with args
            await doTest('sub Main(args as Dynamic)\nend sub', 'sub Main(args as Dynamic)', 1);
            //works with extra spacing
            await doTest('sub   Main()\nend sub', 'sub   Main()', 1);
            await doTest('sub Main   ()\nend sub', 'sub Main   ()', 1);
        });

        it('works for function main', async () => {
            await doTest('function Main()\nend function', 'function Main()', 1);
            await doTest('function Main(args as Dynamic)\nend function', 'function Main(args as Dynamic)', 1);
            //works with extra spacing
            await doTest('function   Main()\nend function', 'function   Main()', 1);
            await doTest('function Main   ()\nend function', 'function Main   ()', 1);
        });
    });

    describe('setBreakPointsRequest', () => {
        let response;
        let args;
        beforeEach(() => {
            response = undefined;
            //intercept the sent response
            session.sendResponse = (res) => {
                response = res;
            };

            args = {
                source: {
                    path: '/dest/some/file.brs'
                },
                breakpoints: []
            };

            args.breakpoints = [{ line: 1 }];
        });
        it('returns correct results', () => {
            session.setBreakPointsRequest(<any>{}, args);
            expect(response.body.breakpoints).to.deep.equal([{ line: 1, verified: true }]);

            //mark debugger as 'launched' which should change the behavior of breakpoints.
            session.launchRequestWasCalled = true;

            //remove a breakpoint (it should remove the breakpoint)
            args.breakpoints = [];
            session.setBreakPointsRequest(<any>{}, args);
            expect(response.body.breakpoints).to.deep.equal([]);

            //add breakpoint after launchRequestWasCalled finished (i.e. can't set breakpoints anymore)
            args.breakpoints = [{ line: 1 }, { line: 2 }];
            session.setBreakPointsRequest(<any>{}, args);
            expect(response.body.breakpoints).to.deep.equal([{ line: 1, verified: true }, { line: 2, verified: false }]);

        });

        it('handles breakpoints for non-brightscript files', () => {
            args.source.path = '/some/xml-file.xml';
            args.breakpoints = [{ line: 1 }];
            session.setBreakPointsRequest(<any>{}, args);
            //breakpoint should be disabled
            expect(response.body.breakpoints).to.deep.equal([{ line: 1, verified: false }]);

        });

        it('remaps to debug folder when specified', () => {
            (session as any).launchArgs = {
                debugRootDir: path.normalize('/src'),
                rootDir: path.normalize('/dest')
            };
            args.breakpoints = [{ line: 1 }];

            session.setBreakPointsRequest(<any>{}, args);
            expect((session as any).breakpointsByClientPath[path.normalize('/src/some/file.brs')]).not.to.be.undefined;

            delete (session as any).launchArgs.debugRootDir;

            session.setBreakPointsRequest(<any>{}, args);
            expect((session as any).breakpointsByClientPath[path.normalize('/dest/some/file.brs')]).not.to.be.undefined;

        });
    });
});
