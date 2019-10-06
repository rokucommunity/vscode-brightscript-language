// tslint:disable: no-unused-expression
import { expect } from 'chai';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import * as rmfr from 'rmfr';
import * as sinonActual from 'sinon';

import { fileUtils } from './FileUtils';
import { SourceNode } from 'source-map';

let sinon = sinonActual.createSandbox();
let n = path.normalize;
const rootDir = path.normalize(path.dirname(__dirname));

describe('FileUtils', () => {
    afterEach(() => {
        sinon.restore();
    });

    describe('getAllRelativePaths', () => {
        //basic test to get code coverage...we don't need to test the glob code too much here...
        it('works', () => {
            expect(fileUtils.getAllRelativePaths(path.join(__dirname, '..', 'images'))).to.contain(path.join('icon.png'));
        });
    });

    describe('removeFileTruncation', () => {
        it('does not replace when the `...` character is missing', () => {
            expect(fileUtils.removeFileTruncation('project1/main.brs')).to.equal('project1/main.brs');
        });

        it('removes leading ... when present', () => {
            expect(fileUtils.removeFileTruncation('...project1/main.brs')).to.equal('project1/main.brs');
        });
    });

    describe('pathEndsWith', () => {
        it('accepts same path', () => {
            expect(fileUtils.pathEndsWith('project1/main.brs', 'project1/main.brs')).to.be.true;
        });

        it('rejects contained path not found at end', () => {
            expect(fileUtils.pathEndsWith('project1/main.brs.map', 'project1/main.brs')).to.be.false;
        });

        it('rejects non-similar path', () => {
            expect(fileUtils.pathEndsWith('project1/main.brs.map', 'project2/lib.brs')).to.be.false;
        });
    });

    describe('findPartialFileInDirectory', () => {
        beforeEach(() => {
            sinon.stub(fileUtils, 'getAllRelativePaths').returns([
                'source/main.brs',
                'source/lib1/lib.brs',
                'source/lib2/lib.brs'
            ]);
        });

        it('normalizes the paths', () => {
            expect(fileUtils.findPartialFileInDirectory('...ource\\lib2//lib.brs', 'NOT_IMPORTANT_DUE_TO_MOCK'));
        });

        it('returns first result when multiple matches are found', () => {
            let stub = sinon.stub(console, 'warn').returns(undefined);

            expect(fileUtils.findPartialFileInDirectory('...lib.brs', 'SomeAppDir')).to.equal('source/lib1/lib.brs');

            //a warning should be logged to the console about the fact that there are multiple matches
            expect(stub.getCalls()).to.be.lengthOf(1);
        });

        it('returns undefined when no results found', () => {
            expect(fileUtils.findPartialFileInDirectory('...promise.brs', 'SomeAppDir')).to.be.undefined;
        });
    });

    describe('getComponentLibraryIndex', () => {
        it('finds the index', () => {
            expect(fileUtils.getComponentLibraryIndex('pkg:/source/main__lib0.brs', '__lib')).to.equal(0);
            expect(fileUtils.getComponentLibraryIndex('pkg:/source/main__lib1.brs', '__lib')).to.equal(1);
            expect(fileUtils.getComponentLibraryIndex('pkg:/source/main__lib12.brs', '__lib')).to.equal(12);
        });
        it('returns undefined no number was found', () => {
            expect(fileUtils.getComponentLibraryIndex('pkg:/source/main__lib.brs', '__lib')).to.be.undefined;
        });
        it('returns undefined no postfix was found', () => {
            expect(fileUtils.getComponentLibraryIndex('pkg:/source/main__notlib1.brs', '__lib')).to.be.undefined;
        });
        it('returns undefined when item after postfix is not a number', () => {
            expect(fileUtils.getComponentLibraryIndex('pkg:/source/main__libcat.brs', '__lib')).to.be.undefined;
        });
    });

    describe('findFirstRelativeFile', () => {
        let paths = [] as string[];
        let rootA = n(`${rootDir}/compLibA`);
        let rootB = n(`${rootDir}/compLibB`);
        let rootC = n(`${rootDir}/compLibC`);
        let pathA = path.join(rootA, 'main.brs');
        let pathB = path.join(rootB, 'main.brs');
        let pathC = path.join(rootC, 'main.brs');

        beforeEach(() => {
            sinon.stub(fsExtra, 'pathExists').callsFake((filePath: string) => {
                return paths.indexOf(filePath) > -1;
            });
        });

        it('finds file from first folder', async () => {
            paths = [pathA, pathB, pathC];
            expect(await fileUtils.findFirstRelativeFile('main.brs', [rootA, rootB, rootC])).to.equal(pathA);
        });

        it('finds file from middle folder', async () => {
            paths = [pathB, pathC];
            expect(await fileUtils.findFirstRelativeFile('main.brs', [rootA, rootB, rootC])).to.equal(pathB);
        });

        it('finds file from last folder', async () => {
            paths = [pathC];
            expect(await fileUtils.findFirstRelativeFile('main.brs', [rootA, rootB, rootC])).to.equal(pathC);
        });
    });

    describe('getSourceLocationFromSourceMap', () => {
        let tempDirPath = n(`${rootDir}/.test_temp`);
        let sourceDirPath = n(`${tempDirPath}/source`);
        let outDirPath = n(`${tempDirPath}/out`);
        let sourceFilePath = n(`${sourceDirPath}/file.brs`);
        let outFilePath = n(`${outDirPath}/file.brs`);
        let outFileMapPath = n(`${outFilePath}.map`);

        beforeEach(async () => {
            await rmfr(tempDirPath);

            await fsExtra.mkdir(tempDirPath);
            await fsExtra.mkdir(sourceDirPath);
            await fsExtra.mkdir(outDirPath);

            let sourceContents = `function main()\n    print "hello"\n    print "world"\nend function
            `;

            //create a source file
            await fsExtra.writeFile(sourceFilePath, sourceContents);
        });

        afterEach(async () => {
            await rmfr(tempDirPath);
        });

        async function createOutFiles(sourcePath) {
            //transform the file (by adding extra newlines
            let result = new SourceNode(null, null, sourcePath, [
                new SourceNode(1, 0, sourcePath, 'function main()\n'),
                '\n',
                new SourceNode(2, 0, sourcePath, '    print "hello"\n'),
                '\n',
                new SourceNode(3, 0, sourcePath, '    print "world"\n'),
                '\n',
                new SourceNode(4, 0, sourcePath, 'end function\n')
            ]).toStringWithSourceMap();
            await fsExtra.writeFile(outFilePath, result.code);
            await fsExtra.writeFile(outFileMapPath, result.map);
        }

        it('supports absolute paths in source map', async () => {
            await createOutFiles(sourceFilePath);
            let location = await fileUtils.getSourceLocationFromSourcemap(outFilePath, 3);
            expect(location).to.eql({
                pathAbsolute: sourceFilePath,
                lineNumber: 2,
                columnIndex: 0
            });
        });

        it('supports relative paths in source map', async () => {
            await createOutFiles('../source/file.brs');
            let location = await fileUtils.getSourceLocationFromSourcemap(outFilePath, 3);
            expect(location).to.eql({
                pathAbsolute: sourceFilePath,
                lineNumber: 2,
                columnIndex: 0
            });
        });
    });
});
