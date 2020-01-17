// tslint:disable:no-unused-expression
import { expect } from 'chai';
import * as fsExtra from 'fs-extra';
import { SourceMapConsumer } from 'source-map';

import { BreakpointManager } from './BreakpointManager';
import { fileUtils } from './FileUtils';
import { Project } from './ProjectManager';
let n = fileUtils.standardizePath.bind(fileUtils);
import { standardizePath as s } from './FileUtils';

describe('BreakpointManager', () => {
    let cwd = fileUtils.standardizePath(process.cwd());

    let bpManager: BreakpointManager;
    //cast the manager as any to simplify some of the tests
    let b: any;
    beforeEach(() => {
        bpManager = new BreakpointManager();
        b = bpManager;
    });

    describe('getSourceAndMapWithBreakpoints', () => {
        it('correctly injects standard breakpoints', () => {
            expect(bpManager.getSourceAndMapWithBreakpoints(`
                    function Main()
                        print "Hello world"
                    end function
                `,
                [<any>{
                    lineNumber: 3,
                    columnIndex: 5
                }]).code
            ).to.equal(`
                    function Main()\nSTOP
                        print "Hello world"
                    end function
                `);
        });

        it('injects conditions', () => {
            expect(bpManager.getSourceAndMapWithBreakpoints(`
                function Main()
                    print "Hello world"
                end function
            `, <any>[{
                lineNumber: 3,
                columnIndex: 5,
                condition: 'age=1'
            }]).code).to.equal(`
                function Main()\nif age=1 then : STOP : end if
                    print "Hello world"
                end function
            `);
        });

        it('injects hit conditions', () => {
            expect(bpManager.getSourceAndMapWithBreakpoints(`
                function Main()
                    print "Hello world"
                end function
            `, <any>[{
                lineNumber: 3,
                columnIndex: 5,
                hitCondition: '1'
            }]).code).to.equal(`
                function Main()\nif Invalid = m.vscode_bp OR Invalid = m.vscode_bp.bp1 then if Invalid = m.vscode_bp then m.vscode_bp = {bp1: 0} else m.vscode_bp.bp1 = 0 else m.vscode_bp.bp1 ++ : if m.vscode_bp.bp1 >= 1 then STOP
                    print "Hello world"
                end function
            `);
        });

        it('injects regular stop when hit condition is 0', () => {
            expect(bpManager.getSourceAndMapWithBreakpoints(`
                function Main()
                    print "Hello world"
                end function
            `, <any>[{
                lineNumber: 3,
                columnIndex: 5,
                hitCondition: '0'
            }]).code).to.equal(`
                function Main()\nSTOP
                    print "Hello world"
                end function
            `);
        });

        it('injects logMessage', () => {
            expect(bpManager.getSourceAndMapWithBreakpoints(`
                function Main()
                    print "Hello world"
                end function
            `, <any>[{
                lineNumber: 3,
                columnIndex: 5,
                logMessage: 'test print'
            }]).code).to.equal(`
                function Main()\nPRINT "test print"
                    print "Hello world"
                end function
            `);
        });

        it('injects logMessage with interpolated values', () => {
            expect(bpManager.getSourceAndMapWithBreakpoints(`
                function Main()
                    print "Hello world"
                end function
            `, <any>[{
                lineNumber: 3,
                columnIndex: 5,
                logMessage: 'hello {name}, how is {city}'
            }]).code).to.equal(`
                function Main()\nPRINT "hello "; name;", how is "; city;""
                    print "Hello world"
                end function
            `);
        });

        it('generates valid source map', async () => {
            let result = bpManager.getSourceAndMapWithBreakpoints(`
                function Main()
                    print "Hello world"
                end function
            `, [{
                lineNumber: 3,
                columnIndex: 5,
                sourceFilePath: 'rootDir/source/test.brs',
                stagingFilePath: 'stagingDir/source/test.brs',
                type: 'sourceDirs'
            }]);
            expect(result.map).to.exist;

            //validate that the source map is correct
            await SourceMapConsumer.with(result.map.toString(), null, (consumer) => {
                expect(consumer.originalPositionFor({
                    line: 4,
                    column: 0
                })).contain({
                    line: 3
                });
            });
        });
    });

    describe('setBreakpointsForFile', () => {
        it('verifies all breakpoints before launch', () => {
            expect(bpManager.setBreakpointsForFile(n(`${cwd}/file.brs`), [{
                line: 0,
                column: 0
            }, {
                line: 1,
                column: 0
            }])).to.have.deep.members([{
                line: 0,
                column: 0,
                verified: true,
                wasAddedBeforeLaunch: true
            }, {
                line: 1,
                column: 0,
                verified: true,
                wasAddedBeforeLaunch: true
            }]);
        });

        it('does not verify breakpoints after launch', () => {
            bpManager.setLaunchArgs({});
            expect(bpManager.setBreakpointsForFile(n(`${cwd}/file.brs`), [{
                line: 0,
                column: 0
            }])).to.have.deep.members([{
                line: 0,
                column: 0,
                verified: false,
                wasAddedBeforeLaunch: false
            }]);
        });

        it('re-verifies breakpoint after launch toggle', () => {
            //set the breakpoint before launch
            bpManager.setBreakpointsForFile(n(`${cwd}/file.brs`), [{
                line: 0,
                column: 0
            }]);

            //launch
            bpManager.setLaunchArgs({});

            //toggle off
            expect(bpManager.setBreakpointsForFile(n(`${cwd}/file.brs`), [])).to.have.deep.members([]);

            //toggle on
            expect(bpManager.setBreakpointsForFile(n(`${cwd}/file.brs`), [{
                line: 0,
                column: 0
            }])).to.have.deep.members([{
                line: 0,
                column: 0,
                verified: true,
                wasAddedBeforeLaunch: true
            }]);
        });
    });

    describe('writeBreakpointsForProject', () => {
        let rootDir = n(`${cwd}/.tmp/rokuProject`);
        let stagingDir = n(`${cwd}/.tmp/staging`);
        let sourceDir1 = n(`${cwd}/.tmp/source1`);
        let sourceDir2 = n(`${cwd}/.tmp/source2`);

        beforeEach(() => {
            fsExtra.ensureDirSync(`${rootDir}/source`);
            fsExtra.ensureDirSync(`${stagingDir}/source`);
            fsExtra.ensureDirSync(`${sourceDir1}/source`);
            fsExtra.ensureDirSync(`${sourceDir2}/source`);
        });

        afterEach(() => {
            try { fsExtra.removeSync(`${cwd}/.tmp`); } catch (e) { }
        });

        it.skip('works with normal flow', async () => {
            fsExtra.writeFileSync(`${rootDir}/source/main.brs`, `sub main()\n    print 1\n    print 2\nend sub`);

            //set the breakpoint before launch
            bpManager.setBreakpointsForFile(n(`${rootDir}/source/main.brs`), [{
                line: 3,
                column: 0
            }]);

            //copy the file to staging
            fsExtra.copyFileSync(`${rootDir}/source/main.brs`, `${stagingDir}/source/main.brs`);

            //launch
            bpManager.setLaunchArgs({});

            //sourcemap was not yet created
            expect(fsExtra.pathExistsSync(`${stagingDir}/source/main.brs.map`)).to.be.false;

            await bpManager.writeBreakpointsForProject(new Project(<any>{
                rootDir: rootDir,
                outDir: s`${cwd}/out`,
                stagingDir: stagingDir
            }));

            //it wrote the breakpoint in the correct location
            expect(fsExtra.readFileSync(`${stagingDir}/source/main.brs`).toString()).to.equal(`sub main()\n    print 1\nSTOP\n    print 2\nend sub`);

            //sourcemap was created
            expect(fsExtra.pathExistsSync(`${stagingDir}/source/main.brs.map`)).to.be.true;

            //sourcemap points to correct location (notice we ask about line 4, but get back line 3)
            expect(await fileUtils.getSourceLocationFromSourceMap(`${stagingDir}/source/main.brs`, 4, 0)).to.eql({
                columnIndex: 0,
                lineNumber: 3,
                pathAbsolute: n(`${rootDir}/source/main.brs`)
            });
        });

        it.skip('works with sourceDir1', async () => {
            //create file
            fsExtra.writeFileSync(`${sourceDir1}/source/main.brs`, `sub main()\n    print 1\n    print 2\nend sub`);

            //mimic custom build by copying the file from sourceDir into rootDir
            fsExtra.copyFileSync(`${sourceDir1}/source/main.brs`, `${rootDir}/source/main.brs`);

            //copy the file to staging (this is what the extension would normally do automatically)
            fsExtra.copyFileSync(`${rootDir}/source/main.brs`, `${stagingDir}/source/main.brs`);

            //set the breakpoint before launch
            bpManager.setBreakpointsForFile(n(`${sourceDir1}/source/main.brs`), [{
                line: 3,
                column: 0
            }]);

            //launch
            bpManager.setLaunchArgs({});

            //sourcemap was not yet created
            expect(fsExtra.pathExistsSync(`${stagingDir}/source/main.brs.map`)).to.be.false;

            await bpManager.writeBreakpointsForProject(
                new Project(<any>{
                    rootDir: rootDir,
                    outDir: s`${cwd}/out`,
                    sourceDirs: [sourceDir1],
                    stagingFolderPath: stagingDir
                })
            );

            expect(fsExtra.readFileSync(`${stagingDir}/source/main.brs`).toString()).to.equal(`sub main()\n    print 1\nSTOP\n    print 2\nend sub`);

            //sourcemap was created
            expect(fsExtra.pathExistsSync(`${stagingDir}/source/main.brs.map`)).to.be.true;

            //sourcemap points to correct location (notice we ask about line 4, but get back line 3)
            expect(await fileUtils.getSourceLocationFromSourceMap(`${stagingDir}/source/main.brs`, 4, 0)).to.eql({
                columnIndex: 0,
                lineNumber: 3,
                pathAbsolute: n(`${sourceDir1}/source/main.brs`)
            });
        });

        it('works with file existing in second sourceDir but not first', async () => {
            //create file
            fsExtra.writeFileSync(`${sourceDir2}/source/main.brs`, `sub main()\n    print 1\n    print 2\nend sub`);

            //mimic custom build by copying the file from sourceDir into rootDir
            fsExtra.copyFileSync(`${sourceDir2}/source/main.brs`, `${rootDir}/source/main.brs`);

            //copy the file to staging (this is what the extension would normally do automatically
            fsExtra.copyFileSync(`${rootDir}/source/main.brs`, `${stagingDir}/source/main.brs`);

            //set the breakpoint before launch
            bpManager.setBreakpointsForFile(n(`${sourceDir2}/source/main.brs`), [{
                line: 3,
                column: 0
            }]);

            //launch
            bpManager.setLaunchArgs({});

            await bpManager.writeBreakpointsForProject(
                new Project(<any>{
                    rootDir: rootDir,
                    outDir: s`${cwd}/out`,
                    sourceDirs: [sourceDir1, sourceDir2],
                    stagingFolderPath: stagingDir
                })
            );

            expect(fsExtra.readFileSync(`${stagingDir}/source/main.brs`).toString()).to.equal(`sub main()\n    print 1\nSTOP\n    print 2\nend sub`);
        });

        it('does not duplicate breakpoints with breakpoint set in both sourceDir files', async () => {
            //create file
            fsExtra.writeFileSync(`${sourceDir1}/source/main.brs`, `sub main()\n    print 1\n    print 2\nend sub`);

            //duplicate file in sourceDir2
            fsExtra.copyFileSync(`${sourceDir1}/source/main.brs`, `${sourceDir2}/source/main.brs`);

            //mimic custom build by copying the file from sourceDir into rootDir
            fsExtra.copyFileSync(`${sourceDir2}/source/main.brs`, `${rootDir}/source/main.brs`);

            //copy the file to staging (this is what the extension would normally do automatically
            fsExtra.copyFileSync(`${rootDir}/source/main.brs`, `${stagingDir}/source/main.brs`);

            //set the breakpoint before launch
            bpManager.setBreakpointsForFile(n(`${sourceDir1}/source/main.brs`), [{
                line: 3,
                column: 0
            }]);
            bpManager.setBreakpointsForFile(n(`${sourceDir2}/source/main.brs`), [{
                line: 3,
                column: 0
            }]);

            //launch
            bpManager.setLaunchArgs({});

            await bpManager.writeBreakpointsForProject(
                new Project(<any>{
                    rootDir: rootDir,
                    outDir: s`${cwd}/out`,
                    sourceDirs: [sourceDir1, sourceDir2],
                    stagingFolderPath: stagingDir
                })
            );

            expect(fsExtra.readFileSync(`${stagingDir}/source/main.brs`).toString()).to.equal(`sub main()\n    print 1\nSTOP\n    print 2\nend sub`);
        });
    });
});
