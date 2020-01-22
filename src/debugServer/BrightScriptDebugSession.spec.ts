/* tslint:disable:no-unused-expression */
import { expect } from 'chai';

import * as assert from 'assert';
import * as fsExtra from 'fs-extra';
import { Server } from 'https';
import * as path from 'path';
import * as sinonActual from 'sinon';
import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';
import {
    BrightScriptDebugSession,
    defer
} from '../BrightScriptDebugSession';
import { fileUtils } from './FileUtils';
import {
    EvaluateContainer,
    HighLevelType,
    PrimativeType
} from '../RokuAdapter';
import { DebugSession } from 'vscode-debugadapter';

let sinon = sinonActual.createSandbox();
let n = path.normalize;
let cwd = fileUtils.standardizePath(process.cwd());
let outDir = fileUtils.standardizePath(`${cwd}/outDir`);
let stagingFolderPath = fileUtils.standardizePath(`${outDir}/stagingDir`);
const rootDir = path.normalize(path.dirname(__dirname));

beforeEach(() => {
    sinon.restore();
});

afterEach(() => {
    fsExtra.remove(outDir);
});

describe('Debugger', () => {
    let session: BrightScriptDebugSession;
    //session of type any so we can do private-ish things
    let s: any;
    let rokuAdapter: any = {
        on: () => {
            return () => {
            };
        },
        activate: () => Promise.resolve(),
        exitActiveBrightscriptDebugger: () => Promise.resolve(),
        registerSourceLocator: function(a, b) { },
        setConsoleOutput: function(a) { }
    };
    beforeEach(() => {
        try {
            session = new BrightScriptDebugSession();
            s = session;
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
            },
            getFilePaths: () => {
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
            responseDeferreds = [];

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

        //this fails on TravisCI for some reason. TODO - fix this
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

    describe('findMainFunction', () => {
        let folder;
        afterEach(() => {
            fsExtra.emptyDirSync('./.tmp');
            fsExtra.rmdirSync('./.tmp');
        });

        async function doTest(fileContents: string, lineContents: string, lineNumber: number) {
            fsExtra.emptyDirSync('./.tmp');
            folder = path.resolve('./.tmp/findMainFunctionTests/');
            fsExtra.mkdirSync(folder);

            let filePath = path.resolve(`${folder}/main.brs`);

            //prevent actually talking to the file system...just hardcode the list to exactly our main file
            (session.rokuDeploy as any).getFilePaths = function() {
                return [{
                    src: filePath,
                    dest: filePath
                }];
            };

            fsExtra.writeFileSync(filePath, fileContents);
            (session as any).launchArgs = {
                files: [
                    folder + '/**/*'
                ]
            };
            let entryPoint = await fileUtils.findEntryPoint(folder);
            expect(entryPoint.filePath).to.equal(filePath);
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

        it('works for sub RunScreenSaver', async () => {
            await doTest('sub RunScreenSaver()\nend sub', 'sub RunScreenSaver()', 1);
            //works with extra spacing
            await doTest('sub   RunScreenSaver()\nend sub', 'sub   RunScreenSaver()', 1);
            await doTest('sub RunScreenSaver   ()\nend sub', 'sub RunScreenSaver   ()', 1);
        });

        it('works for function RunScreenSaver', async () => {
            await doTest('function RunScreenSaver()\nend function', 'function RunScreenSaver()', 1);
            //works with extra spacing
            await doTest('function   RunScreenSaver()\nend function', 'function   RunScreenSaver()', 1);
            await doTest('function RunScreenSaver   ()\nend function', 'function RunScreenSaver   ()', 1);
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
                    path: path.normalize(`${rootDir}/dest/some/file.brs`)
                },
                breakpoints: []
            };
        });

        it('returns correct results', () => {
            args.breakpoints = [{ line: 1 }];
            session.setBreakPointsRequest(<any>{}, args);
            expect(response.body.breakpoints[0]).to.deep.include({
                line: 1,
                verified: true
            });

            //mark debugger as 'launched' which should change the behavior of breakpoints.
            session.breakpointManager.lockBreakpoints();

            //remove the breakpoint breakpoint (it should not remove the breakpoint because it was already verified)
            args.breakpoints = [];
            session.setBreakPointsRequest(<any>{}, args);
            expect(response.body.breakpoints).to.be.lengthOf(0);

            //add breakpoint during live debug session. one was there before, the other is new. Only one will be verified
            args.breakpoints = [{ line: 1 }, { line: 2 }];
            session.setBreakPointsRequest(<any>{}, args);
            expect(
                response.body.breakpoints.map(x => ({ line: x.line, verified: x.verified }))
            ).to.eql([{
                line: 1,
                verified: true
            }, {
                line: 2,
                verified: false
            }]);
        });

        it('supports breakpoints within xml files', () => {
            args.source.path = `${rootDir}/some/xml-file.xml`;
            args.breakpoints = [{ line: 1 }];
            session.setBreakPointsRequest(<any>{}, args);
            //breakpoint should be disabled
            expect(response.body.breakpoints[0]).to.deep.include({ line: 1, verified: true });
        });

        it('handles breakpoints for non-brightscript files', () => {
            args.source.path = `${rootDir}/some/xml-file.jpg`;
            args.breakpoints = [{ line: 1 }];
            session.setBreakPointsRequest(<any>{}, args);
            expect(response.body.breakpoints).to.be.lengthOf(1);
            //breakpoint should be disabled
            expect(response.body.breakpoints[0]).to.deep.include({ line: 1, verified: false });
        });
    });

    describe('handleEntryBreakpoint', () => {
        it('registers the entry breakpoint when stopOnEntry is enabled', async () => {
            (session as any).launchArgs = { stopOnEntry: true };
            session.projectManager.mainProject = <any>{
                stagingFolderPath: stagingFolderPath
            };
            let stub = sinon.stub(session.projectManager, 'registerEntryBreakpoint').returns(Promise.resolve());
            await session.handleEntryBreakpoint();
            expect(stub.called).to.be.true;
            expect(stub.args[0][0]).to.equal(stagingFolderPath);
        });
        it('does NOT register the entry breakpoint when stopOnEntry is enabled', async () => {
            (session as any).launchArgs = { stopOnEntry: false };
            let stub = sinon.stub(session.projectManager, 'registerEntryBreakpoint').returns(Promise.resolve());
            await session.handleEntryBreakpoint();
            expect(stub.called).to.be.false;
        });
    });

    describe('shutdown', () => {
        it('erases all staging folders when configured to do so', () => {
            var stub = sinon.stub(fsExtra, 'removeSync').returns(null);
            session.projectManager.mainProject = <any>{
                stagingFolderPath: 'stagingPathA'
            };
            session.projectManager.componentLibraryProjects.push(<any>{
                stagingFolderPath: 'stagingPathB'
            });
            (session as any).launchArgs = {
                retainStagingFolder: false
            };
            //stub the super shutdown call so it doesn't kill the test session
            sinon.stub(DebugSession.prototype, 'shutdown').returns(null);

            session.shutdown();
            expect(stub.callCount).to.equal(2);
            expect(stub.args.map(x => x[0])).to.eql([
                'stagingPathA',
                'stagingPathB'
            ]);
        });
    });
});
