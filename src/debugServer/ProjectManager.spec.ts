import { Project, ComponentLibraryProject } from './ProjectManager';
import { fileUtils } from './FileUtils';
import { expect } from 'chai';
import { standardizePath as s } from './FileUtils';

let cwd = fileUtils.standardizePath(process.cwd());

describe.only('Project', () => {
    it('copies the necessary properties onto the instance', () => {
        var project = new Project({
            rootDir: cwd,
            outDir: s`${cwd}/out`,
            files: ['a'],
            bsConst: { b: true },
            injectRaleTrackerTask: true,
            sourceDirs: [s`${cwd}/source1`],
            stagingFolderPath: s`${cwd}/staging`,
            trackerTaskFileLocation: 'z'

        });
        expect(project.rootDir).to.equal(cwd);
        expect(project.files).to.eql(['a']);
        expect(project.bsConst).to.eql({ b: true });
        expect(project.injectRaleTrackerTask).to.equal(true);
        expect(project.outDir).to.eql(s`${cwd}/out`);
        expect(project.sourceDirs).to.eql([s`${cwd}/source1`]);
        expect(project.stagingFolderPath).to.eql(s`${cwd}/staging`);
        expect(project.trackerTaskFileLocation).to.eql('z');
    });
});

describe.only('ComponentLibraryProject', () => {
    describe('computeOutFileName', () => {
        it('properly computes the outFile name', () => {
            var project = new ComponentLibraryProject({
                rootDir: cwd,
                outDir: s`${cwd}/out`,
                files: ['a'],
                bsConst: { b: true },
                injectRaleTrackerTask: true,
                sourceDirs: [s`${cwd}/source1`],
                stagingFolderPath: s`${cwd}/staging`,
                trackerTaskFileLocation: 'z',
                libraryIndex: 0,
                outFile: 'PrettyComponent.zip'
            });
            expect(project.outFile).to.equal('PrettyComponent.zip');
            (project as any).computeOutFileName();
            expect(project.outFile).to.equal('PrettyComponent.zip');
        });
    });
});
