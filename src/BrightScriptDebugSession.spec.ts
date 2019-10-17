/* tslint:disable:no-unused-expression */
import { expect } from 'chai';

import * as assert from 'assert';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import * as sinonActual from 'sinon';
let sinon = sinonActual.createSandbox();

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

const rootDir = path.normalize(path.dirname(__dirname));

beforeEach(() => {
    sinon.restore();
});

describe('Debugger', () => {
    let session: BrightScriptDebugSession;
    let rokuAdapter: any = {
        on: () => {
            return () => {
            };
        },
        activate: () => Promise.resolve(),
        exitActiveBrightscriptDebugger: () => Promise.resolve(),
        setRendezvousDebuggerFileConversionFunctions: function(a, b) { },
        setConsoleOutput: function(a) { }
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

    describe('updateManifestBsConsts', () => {
        let constsLine: string;
        let startingFileContents: string;
        let bsConsts: { [key: string]: boolean };

        beforeEach(() => {
            constsLine = 'bs_const=const=false;const2=true;const3=false';
            startingFileContents = `title=ComponentLibraryTestChannel
                subtitle=Test Channel for Scene Graph Component Library
                mm_icon_focus_hd=pkg:/images/MainMenu_Icon_Center_HD.png
                mm_icon_side_hd=pkg:/images/MainMenu_Icon_Side_HD.png
                mm_icon_focus_sd=pkg:/images/MainMenu_Icon_Center_SD43.png
                mm_icon_side_sd=pkg:/images/MainMenu_Icon_Side_SD43.png
                splash_screen_fd=pkg:/images/splash_fhd.jpg
                splash_screen_hd=pkg:/images/splash_hd.jpg
                splash_screen_sd=pkg:/images/splash_sd.jpg
                major_version=1
                minor_version=1
                build_version=00001
                ${constsLine}
            `.replace(/    /g, '');

            bsConsts = { };
        });

        it('should update one bs_const in the bs_const line', async () => {
            let fileContents: string;
            bsConsts.const = true;
            fileContents = await session.updateManifestBsConsts(bsConsts, startingFileContents);
            assert.equal(fileContents, startingFileContents.replace(constsLine, 'bs_const=const=true;const2=true;const3=false'));

            delete bsConsts.const;
            bsConsts.const2 = false;
            fileContents = await session.updateManifestBsConsts(bsConsts, startingFileContents);
            assert.equal(fileContents, startingFileContents.replace(constsLine, 'bs_const=const=false;const2=false;const3=false'));

            delete bsConsts.const2;
            bsConsts.const3 = true;
            fileContents = await session.updateManifestBsConsts(bsConsts, startingFileContents);
            assert.equal(fileContents, startingFileContents.replace(constsLine, 'bs_const=const=false;const2=true;const3=true'));
        });

        it('should update all bs_consts in the bs_const line', async () => {
            bsConsts.const = true;
            bsConsts.const2 = false;
            bsConsts.const3 = true;
            let fileContents = await session.updateManifestBsConsts(bsConsts, startingFileContents);
            assert.equal(fileContents, startingFileContents.replace(constsLine, 'bs_const=const=true;const2=false;const3=true'));
        });

        it('should throw error when there is no bs_const line', async () => {
            await assert.rejects(async () => {
                await session.updateManifestBsConsts(bsConsts, startingFileContents.replace(constsLine, ''));
            });
        });

        it('should throw error if there is consts in the bsConsts that are not in the manifest', async () => {
            bsConsts.const4 = true;
            await assert.rejects(async () => {
                await session.updateManifestBsConsts(bsConsts, startingFileContents);
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
    describe('convertDebuggerPathToClient', () => {
        it('handles truncated paths', () => {
            //mock fsExtra so we don't have to create actual files
            sinon.stub(fsExtra, 'pathExistsSync').callsFake((path: string) => {
                return true;
            });

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
            //mock fsExtra so we don't have to create actual files
            sinon.stub(fsExtra, 'pathExistsSync').callsFake((path: string) => {
                return true;
            });
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

    describe('injectRaleTrackerTaskCode', () => {
        let key: string;
        let trackerTaskCode: string;
        let folder;

        beforeEach(() => {
            key = 'vscode_rale_tracker_entry';
            trackerTaskCode = `if true = CreateObject("roAppInfo").IsDev() then m.vscode_rale_tracker_task = createObject("roSGNode", "TrackerTask") ' Roku Advanced Layout Editor Support`;
        });

        afterEach(() => {
            fsExtra.emptyDirSync('./.tmp');
            fsExtra.rmdirSync('./.tmp');
        });

        async function doTest(fileContents: string, expectedContents: string, fileExt: string = 'brs') {
            fsExtra.emptyDirSync('./.tmp');
            folder = path.resolve('./.tmp/findMainFunctionTests/');
            fsExtra.mkdirSync(folder);

            let filePath = path.resolve(`${folder}/main.${fileExt}`);

            fsExtra.writeFileSync(filePath, fileContents);
            await session.injectRaleTrackerTaskCode(folder);
            let newFileContents = (await fsExtra.readFile(filePath)).toString();
            expect(newFileContents).to.equal(expectedContents);
        }

        it('works for in line comments brs files', async () => {
            let brsSample = `\nsub main()\n  screen.show  <ENTRY>\nend sub`;
            let expectedBrs = brsSample.replace('<ENTRY>', `: ${trackerTaskCode}`);

            await doTest(brsSample.replace('<ENTRY>', `\' ${key}`), expectedBrs);
            await doTest(brsSample.replace('<ENTRY>', `\'${key}`), expectedBrs);
            //works with extra spacing
            await doTest(brsSample.replace('<ENTRY>', `\'         ${key}                 `), expectedBrs);
        });

        it('works for in line comments in xml files', async () => {
            let xmlSample = `<?rokuml version="1.0" encoding="utf-8" ?>
            <!--********** Copyright COMPANY All Rights Reserved. **********-->

            <component name="TrackerTask" extends="Task">
              <interface>
                  <field id="sample" type="string"/>
                  <function name="sampleFunction"/>
              </interface>
                <script type = "text/brightscript" >
                <![CDATA[
                    <ENTRY>
                ]]>
                </script>
            </component>`;
            let expectedXml = xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true : ${trackerTaskCode}\n        end sub`);

            await doTest(xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true ' ${key}\n        end sub`), expectedXml, 'xml');
            await doTest(xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true '${key}\n        end sub`), expectedXml, 'xml');
            //works with extra spacing
            await doTest(xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true '        ${key}      \n        end sub`), expectedXml, 'xml');
        });

        it('works for stand alone comments in brs files', async () => {
            let brsSample = `\nsub main()\n  screen.show\n  <ENTRY>\nend sub`;
            let expectedBrs = brsSample.replace('<ENTRY>', trackerTaskCode);

            await doTest(brsSample.replace('<ENTRY>', `\' ${key}`), expectedBrs);
            await doTest(brsSample.replace('<ENTRY>', `\'${key}`), expectedBrs);
            //works with extra spacing
            await doTest(brsSample.replace('<ENTRY>', `\'         ${key}                 `), expectedBrs);
        });

        it('works for stand alone comments in xml files', async () => {
            let xmlSample = `<?rokuml version="1.0" encoding="utf-8" ?>
            <!--********** Copyright COMPANY All Rights Reserved. **********-->

            <component name="TrackerTask" extends="Task">
              <interface>
                  <field id="sample" type="string"/>
                  <function name="sampleFunction"/>
              </interface>
                <script type = "text/brightscript" >
                <![CDATA[
                    <ENTRY>
                ]]>
                </script>
            </component>`;

            let expectedXml = xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true\n             ${trackerTaskCode}\n        end sub`);

            await doTest(xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true\n             ' ${key}\n        end sub`), expectedXml, 'xml');
            await doTest(xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true\n             '${key}\n        end sub`), expectedXml, 'xml');
            //works with extra spacing
            await doTest(xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true\n             '        ${key}      \n        end sub`), expectedXml, 'xml');
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
            args.source.path = `${rootDir}/some/xml-file.xml`;
            args.breakpoints = [{ line: 1 }];
            session.setBreakPointsRequest(<any>{}, args);
            //breakpoint should be disabled
            expect(response.body.breakpoints).to.deep.equal([{ line: 1, verified: false }]);

        });

        it('remaps to debug folder when specified', () => {
            //mock fsExtra so we don't have to create actual files
            sinon.stub(fsExtra, 'pathExistsSync').callsFake((path: string) => {
                return true;
            });
            (session as any).launchArgs = {
                sourceDirs: [
                    path.normalize(`${rootDir}/src`)
                ],
                rootDir: path.normalize(`${rootDir}/dest`)
            };
            args.breakpoints = [{ line: 1 }];

            session.setBreakPointsRequest(<any>{}, args);
            expect((session as any).breakpointsByClientPath[path.normalize(`${rootDir}/src/some/file.brs`)]).not.to.be.undefined;

            delete (session as any).launchArgs.sourceDirs;

            session.setBreakPointsRequest(<any>{}, args);
            expect((session as any).breakpointsByClientPath[path.normalize(`${rootDir}/dest/some/file.brs`)]).not.to.be.undefined;

        });
    });
});
