import { Project } from './ProjectManager';
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
