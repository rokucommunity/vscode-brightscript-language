//tslint:disable:no-unused-expression
//tslint:disable:jsdoc-format
import { Project, ComponentLibraryProject, ProjectManager, ComponentLibraryConstrutorParams, componentLibraryPostfix } from './ProjectManager';
import { fileUtils } from './FileUtils';
import * as rokuDeploy from 'roku-deploy';
import { expect } from 'chai';
import { standardizePath as s } from './FileUtils';
import * as path from 'path';
import * as fsExtra from 'fs-extra';
import * as sinonActual from 'sinon';
let sinon = sinonActual.createSandbox();
let n = fileUtils.standardizePath.bind(fileUtils);

let cwd = fileUtils.standardizePath(process.cwd());
let tempPath = s`${cwd}/temp`;
let rootDir = s`${tempPath}/rootDir`;
let outDir = s`${tempPath}/outDir`;
let stagingFolderPath = s`${outDir}/stagingDir`;
let compLibOutDir = s`${outDir}/component-libraries`;
let compLibStagingFolderPath = s`${rootDir}/component-libraries/CompLibA`;

beforeEach(() => {
    sinon.restore();
});

describe('ProjectManager', () => {
    var manager: ProjectManager;
    beforeEach(() => {
        manager = new ProjectManager();
        manager.mainProject = <any>{
            stagingFolderPath: stagingFolderPath
        };
        manager.componentLibraryProjects.push(<any>{
            stagingFolderPath: compLibStagingFolderPath,
            libraryIndex: 1,
            outDir: compLibOutDir
        });
    });

    describe('getLineNumberOffsetByBreakpoints', () => {
        let filePath = 'does not matter';
        it('accounts for the entry breakpoint', () => {
            sinon.stub(manager.breakpointManager, 'getBreakpointsForFile').returns(<any>[{
                line: 3
            }, {
                line: 3
            }]);
            //no offset because line is before any breakpoints
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 1)).to.equal(1);
            //after the breakpoints, should be offset by -1
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 4)).to.equal(3);
        });

        it('works with zero breakpoints', () => {
            sinon.stub(manager.breakpointManager, 'getBreakpointsForFile').returns(<any>[]);
            //no offset because line is before any breakpoints
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 1)).to.equal(1);
            //after the breakpoints, should be offset by -1
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 4)).to.equal(4);
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 12)).to.equal(12);
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 50)).to.equal(50);
        });

        it('works for a complex file', () => {
            //original file (star means breakpoint)
            /**
                 function main ()
                    line = 2
                 *  line = 3
                 *  line = 4
                 *  line = 5
                 *  line = 6
                    line = 7
                 *  line = 8
                    line = 9
                 *  line = 10
                    line = 11
                 *  line = 12
                end function
             */

            //modified file
            /**
                 function main ()
                        line = 2
                    STOP
                        line = 3
                    STOP
                        line = 4
                    STOP
                        line = 5
                    STOP
                        line = 6
                        line = 7
                    STOP
                        line = 8
                        line = 9
                    STOP
                        line = 10
                        line = 11
                    STOP
                        line = 12
                end function
             */
            sinon.stub(manager.breakpointManager, 'getBreakpointsForFile').returns(<any>[
                { line: 3 },
                { line: 4 },
                { line: 5 },
                { line: 6 },
                { line: 8 },
                { line: 10 },
                { line: 12 }
            ]);
            //no offset because line is before any breakpoints
            //no breakpoint
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 1)).to.equal(1);
            //no breakpoint
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 2)).to.equal(2);
            //breakpoint
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 3)).to.equal(3);
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 4)).to.equal(3);
            //breakpoint
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 5)).to.equal(4);
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 6)).to.equal(4);
            //breakpoint
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 7)).to.equal(5);
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 8)).to.equal(5);
            //breakpoint
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 9)).to.equal(6);
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 10)).to.equal(6);
            //no breakpoint
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 11)).to.equal(7);
            //breakpoint
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 12)).to.equal(8);
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 13)).to.equal(8);
            //no breakpoint
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 14)).to.equal(9);
            //breakpoint
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 15)).to.equal(10);
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 16)).to.equal(10);
            //no breakpoint
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 17)).to.equal(11);
            //breakpoint
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 18)).to.equal(12);
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 19)).to.equal(12);
            //no breakpoint
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 20)).to.equal(13);

        });
    });

    describe('getStagingFileInfo', () => {
        it('finds standard files in main project', async () => {
            expect(
                await manager.getStagingFileInfo('pkg:/source/main.brs')
            ).to.include({
                absolutePath: s`${stagingFolderPath}/source/main.brs`,
                //the relative path should not include a leading slash
                relativePath: s`source/main.brs`
            });
        });

        it(`searches for partial files in main project when '...' is encountered`, async () => {
            let stub = sinon.stub(fileUtils, 'findPartialFileInDirectory').callsFake(function(partialFilePath, directoryPath) {
                expect(partialFilePath).to.equal('...ource/main.brs');
                expect(directoryPath).to.equal(manager.mainProject.stagingFolderPath);
                return Promise.resolve(`source/main.brs`);
            });
            expect(
                (await manager.getStagingFileInfo('...ource/main.brs')).absolutePath
            ).to.equal(
                s`${stagingFolderPath}/source/main.brs`
            );
            expect(stub.called).to.be.true;
        });

        it(`detects full paths to component library filenames`, async () => {
            expect(
                (await manager.getStagingFileInfo('pkg:/source/main__lib1.brs')).absolutePath
            ).to.equal(
                s`${compLibStagingFolderPath}/source/main__lib1.brs`
            );
        });

        it(`detects partial paths to component library filenames`, async () => {
            let stub = sinon.stub(fileUtils, 'findPartialFileInDirectory').callsFake(function(partialFilePath, directoryPath) {
                expect(partialFilePath).to.equal('...ource/main__lib1.brs');
                expect(directoryPath).to.equal(manager.componentLibraryProjects[0].stagingFolderPath);
                return Promise.resolve(`source/main__lib1.brs`);
            });
            let info = await manager.getStagingFileInfo('...ource/main__lib1.brs');
            expect(info).to.deep.include({
                relativePath: s`source/main__lib1.brs`,
                absolutePath: s`${compLibStagingFolderPath}/source/main__lib1.brs`
            });
            expect(info.project).to.include({
                outDir: compLibOutDir
            });

            expect(stub.called).to.be.true;
        });
    });

    describe('getSourceLocation', () => {
        it('handles truncated paths', async () => {
            //mock fsExtra so we don't have to create actual files
            sinon.stub(fsExtra, 'pathExists').callsFake(async (filePath: string) => {
                if (fileUtils.pathEndsWith(filePath, '.map')) {
                    return false;
                } else {
                    return true;
                }
            });
            sinon.stub(fileUtils, 'getAllRelativePaths').returns(Promise.resolve([
                'source/file1.brs',
                'source/file2.brs'
            ]));
            manager.mainProject.rootDir = rootDir;
            manager.mainProject.stagingFolderPath = stagingFolderPath;
            manager.mainProject.fileMappings = [{
                src: s`${rootDir}/source/file1.brs`,
                dest: s`${stagingFolderPath}/source/file1.brs`
            }, {
                src: s`${rootDir}/source/file2.brs`,
                dest: s`${stagingFolderPath}/source/file2.brs`
            }];

            let sourceLocation = await manager.getSourceLocation('...rce/file1.brs', 1);
            expect(sourceLocation).to.exist;
            expect(n(sourceLocation.filePath)).to.equal(s`${rootDir}/source/file1.brs`);

            sourceLocation = await manager.getSourceLocation('...rce/file2.brs', 1);
            expect(n(sourceLocation.filePath)).to.equal(s`${rootDir}/source/file2.brs`);
        });

        it('handles pkg paths', async () => {
            //mock fsExtra so we don't have to create actual files
            sinon.stub(fsExtra, 'pathExists').callsFake(async (filePath: string) => {
                if (fileUtils.pathEndsWith(filePath, '.map')) {
                    return false;
                } else {
                    return true;
                }
            });
            manager.mainProject.rootDir = rootDir;
            manager.mainProject.stagingFolderPath = stagingFolderPath;
            manager.mainProject.fileMappings = [{
                src: s`${rootDir}/source/file1.brs`,
                dest: s`${stagingFolderPath}/source/file1.brs`
            }, {
                src: s`${rootDir}/source/file2.brs`,
                dest: s`${stagingFolderPath}/source/file2.brs`
            }];

            let sourceLocation = await manager.getSourceLocation('pkg:source/file1.brs', 1);
            expect(n(sourceLocation.filePath)).to.equal(n(`${rootDir}/source/file1.brs`));

            sourceLocation = await manager.getSourceLocation('pkg:source/file2.brs', 1);
            expect(n(sourceLocation.filePath)).to.equal(n(`${rootDir}/source/file2.brs`));

            sourceLocation = await manager.getSourceLocation('pkg:/source/file2.brs', 1);
            expect(n(sourceLocation.filePath)).to.equal(n(`${rootDir}/source/file2.brs`));
        });

    });
});

describe('Project', () => {
    var project: Project;
    beforeEach(() => {
        project = new Project({
            rootDir: cwd,
            outDir: s`${cwd}/out`,
            files: ['a'],
            bsConst: { b: true },
            injectRaleTrackerTask: true,
            sourceDirs: [s`${cwd}/source1`],
            stagingFolderPath: s`${cwd}/staging`,
            raleTrackerTaskFileLocation: 'z'

        });
    });
    it('copies the necessary properties onto the instance', () => {
        expect(project.rootDir).to.equal(cwd);
        expect(project.files).to.eql(['a']);
        expect(project.bsConst).to.eql({ b: true });
        expect(project.injectRaleTrackerTask).to.equal(true);
        expect(project.outDir).to.eql(s`${cwd}/out`);
        expect(project.sourceDirs).to.eql([s`${cwd}/source1`]);
        expect(project.stagingFolderPath).to.eql(s`${cwd}/staging`);
        expect(project.raleTrackerTaskFileLocation).to.eql('z');
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

            bsConsts = {};
        });

        it('should update one bs_const in the bs_const line', () => {
            let fileContents: string;
            bsConsts.const = true;
            fileContents = project.updateManifestBsConsts(bsConsts, startingFileContents);
            expect(fileContents).to.equal(
                startingFileContents.replace(constsLine, 'bs_const=const=true;const2=true;const3=false')
            );

            delete bsConsts.const;
            bsConsts.const2 = false;
            fileContents = project.updateManifestBsConsts(bsConsts, startingFileContents);
            expect(fileContents).to.equal(
                startingFileContents.replace(constsLine, 'bs_const=const=false;const2=false;const3=false')
            );

            delete bsConsts.const2;
            bsConsts.const3 = true;
            fileContents = project.updateManifestBsConsts(bsConsts, startingFileContents);
            expect(fileContents).to.equal(
                startingFileContents.replace(constsLine, 'bs_const=const=false;const2=true;const3=true')
            );
        });

        it('should update all bs_consts in the bs_const line', () => {
            bsConsts.const = true;
            bsConsts.const2 = false;
            bsConsts.const3 = true;
            let fileContents = project.updateManifestBsConsts(bsConsts, startingFileContents);
            expect(fileContents).to.equal(
                startingFileContents.replace(constsLine, 'bs_const=const=true;const2=false;const3=true')
            );
        });
        it('should throw error when there is no bs_const line', async () => {
            expect(() => {
                project.updateManifestBsConsts(bsConsts, startingFileContents.replace(constsLine, ''));
            }).to.throw;
        });

        it('should throw error if there is consts in the bsConsts that are not in the manifest', async () => {
            bsConsts.const4 = true;
            expect(() => {
                project.updateManifestBsConsts(bsConsts, startingFileContents);
            }).to.throw;
        });
    });

    describe('copyAndTransformRaleTrackerTask', () => {
        let tempPath = s`${cwd}/tmp`;
        let raleTrackerTaskFileLocation = s`${cwd}/TrackerTask.xml`;
        before(() => {
            fsExtra.writeFileSync(raleTrackerTaskFileLocation, `<!--dummy contents-->`);
        });
        after(() => {
            fsExtra.removeSync(tempPath);
            fsExtra.removeSync(raleTrackerTaskFileLocation);
        });
        afterEach(() => {
            fsExtra.emptyDirSync(tempPath);
            fsExtra.rmdirSync(tempPath);
        });

        async function doTest(fileContents: string, expectedContents: string, fileExt: string = 'brs') {
            fsExtra.emptyDirSync(tempPath);
            let folder = s`${tempPath}/findMainFunctionTests/`;
            fsExtra.mkdirSync(folder);

            let filePath = s`${folder}/main.${fileExt}`;

            fsExtra.writeFileSync(filePath, fileContents);
            project.stagingFolderPath = folder;
            project.injectRaleTrackerTask = true;
            //these file contents don't actually matter
            project.raleTrackerTaskFileLocation = raleTrackerTaskFileLocation;
            await project.copyAndTransformRaleTrackerTask();
            let newFileContents = (await fsExtra.readFile(filePath)).toString();
            expect(newFileContents).to.equal(expectedContents);
        }

        it('copies the RALE xml file', async () => {
            fsExtra.ensureDirSync(tempPath);
            fsExtra.writeFileSync(`${tempPath}/RALE.xml`, 'test contents');
            await doTest(`sub main()\nend sub`, `sub main()\nend sub`);
            expect(fsExtra.pathExistsSync(s`${project.stagingFolderPath}/components/TrackerTask.xml`), 'TrackerTask.xml was not copied to staging').to.be.true;
        });

        it('works for inline comments brs files', async () => {
            let brsSample = `\nsub main()\n  screen.show  <ENTRY>\nend sub`;
            let expectedBrs = brsSample.replace('<ENTRY>', `: ${Project.RALE_TRACKER_TASK_CODE}`);

            await doTest(brsSample.replace('<ENTRY>', `\' ${Project.RALE_TRACKER_ENTRY}`), expectedBrs);
            await doTest(brsSample.replace('<ENTRY>', `\'${Project.RALE_TRACKER_ENTRY}`), expectedBrs);
            //works with extra spacing
            await doTest(brsSample.replace('<ENTRY>', `\'         ${Project.RALE_TRACKER_ENTRY}                 `), expectedBrs);
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
            let expectedXml = xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true : ${Project.RALE_TRACKER_TASK_CODE}\n        end sub`);

            await doTest(xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true ' ${Project.RALE_TRACKER_ENTRY}\n        end sub`), expectedXml, 'xml');
            await doTest(xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true '${Project.RALE_TRACKER_ENTRY}\n        end sub`), expectedXml, 'xml');
            //works with extra spacing
            await doTest(xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true '        ${Project.RALE_TRACKER_ENTRY}      \n        end sub`), expectedXml, 'xml');
        });

        it('works for stand alone comments in brs files', async () => {
            let brsSample = `\nsub main()\n  screen.show\n  <ENTRY>\nend sub`;
            let expectedBrs = brsSample.replace('<ENTRY>', Project.RALE_TRACKER_TASK_CODE);

            await doTest(brsSample.replace('<ENTRY>', `\' ${Project.RALE_TRACKER_ENTRY}`), expectedBrs);
            await doTest(brsSample.replace('<ENTRY>', `\'${Project.RALE_TRACKER_ENTRY}`), expectedBrs);
            //works with extra spacing
            await doTest(brsSample.replace('<ENTRY>', `\'         ${Project.RALE_TRACKER_ENTRY}                 `), expectedBrs);
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

            let expectedXml = xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true\n             ${Project.RALE_TRACKER_TASK_CODE}\n        end sub`);

            await doTest(xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true\n             ' ${Project.RALE_TRACKER_ENTRY}\n        end sub`), expectedXml, 'xml');
            await doTest(xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true\n             '${Project.RALE_TRACKER_ENTRY}\n        end sub`), expectedXml, 'xml');
            //works with extra spacing
            await doTest(xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true\n             '        ${Project.RALE_TRACKER_ENTRY}      \n        end sub`), expectedXml, 'xml');
        });
    });
});

describe('ComponentLibraryProject', () => {
    let params: ComponentLibraryConstrutorParams;
    beforeEach(() => {
        params = {
            rootDir: rootDir,
            outDir: `${outDir}/component-libraries`,
            files: ['a'],
            bsConst: { b: true },
            injectRaleTrackerTask: true,
            sourceDirs: [s`${tempPath}/source1`],
            stagingFolderPath: s`${outDir}/complib1-staging`,
            raleTrackerTaskFileLocation: 'z',
            libraryIndex: 0,
            outFile: 'PrettyComponent.zip'
        };
    });

    describe('computeOutFileName', () => {
        it('properly computes the outFile name', () => {
            var project = new ComponentLibraryProject(params);
            expect(project.outFile).to.equal('PrettyComponent.zip');
            (project as any).computeOutFileName();
            expect(project.outFile).to.equal('PrettyComponent.zip');
        });
    });

    describe('stage', () => {
        it('computes stagingFolderPath before calling getFileMappings', async () => {
            delete params.stagingFolderPath;
            let project = new ComponentLibraryProject(params);

            sinon.stub(rokuDeploy, 'getFilePaths').returns(Promise.resolve([
                { src: s`${rootDir}/manifest`, dest: s`manifest` },
                { src: s`${rootDir}/source/main.brs`, dest: s`source/main.brs` }
            ]));
            sinon.stub(Project.prototype, 'stage').returns(Promise.resolve());

            await project.stage();
            expect(project.fileMappings[0]).to.eql({
                src: s`${rootDir}/manifest`,
                dest: s`${outDir}/component-libraries/PrettyComponent/manifest`
            });
            expect(project.fileMappings[1]).to.eql({
                src: s`${rootDir}/source/main.brs`,
                dest: s`${outDir}/component-libraries/PrettyComponent/source/main.brs`
            });
        });
    });

    describe('removeFileNamePostfix', () => {
        let project: ComponentLibraryProject;
        beforeEach(() => {
            project = new ComponentLibraryProject(params);
        });

        it('removes postfix from paths that contain it', () => {
            expect(project.removeFileNamePostfix(`source/main__lib0.brs`)).to.equal('source/main.brs');
            expect(project.removeFileNamePostfix(`components/component1__lib0.brs`)).to.equal('components/component1.brs');
        });

        it('removes postfix case insensitive', () => {
            expect(project.removeFileNamePostfix(`source/main__LIB0.brs`)).to.equal('source/main.brs');
            expect(project.removeFileNamePostfix(`source/MAIN__lib0.brs`)).to.equal('source/MAIN.brs');
        });

        it('does nothing to files without the postfix', () => {
            expect(project.removeFileNamePostfix(`source/main.brs`)).to.equal('source/main.brs');
        });

        it('does nothing to files with a different postfix', () => {
            expect(project.removeFileNamePostfix(`source/main__lib1.brs`)).to.equal('source/main__lib1.brs');
        });

        it('only removes the postfix from the end of the file', () => {
            expect(project.removeFileNamePostfix(`source/__lib1.brs/main.brs`)).to.equal('source/__lib1.brs/main.brs');
        });
    });
});
