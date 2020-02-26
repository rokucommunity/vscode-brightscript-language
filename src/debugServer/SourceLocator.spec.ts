import { expect } from 'chai';
import * as mock from 'mock-fs';
import * as mockFs from 'mock-fs';
import * as path from 'path';
import { SourceMapConsumer, SourceNode } from 'source-map';

import { fileUtils, standardizePath as s } from './FileUtils';
import { SourceLocator } from './SourceLocator';

let cwd = s`${path.dirname(__dirname)}`;
const rootDir = s`${cwd}/rootDir`;
const stagingFolderPath = s`${rootDir}/stagingDir`;
const sourceDirs = [
    s`${cwd}/sourceDir0`,
    s`${cwd}/sourceDir1`,
    s`${cwd}/sourceDir2`
];

describe('SouceLocator', () => {
    let files: { [filePath: string]: string };
    var sourceLocator: SourceLocator;
    beforeEach(() => {
        sourceLocator = new SourceLocator();
        files = {};
        mockFs.restore();
    });
    afterEach(() => {
        mockFs.restore();
    });
    describe('getSourceLocation', () => {

        describe('standard', () => {
            it('simple case, no maps, no breakpoints, no sourceDirs', async () => {
                files[s`${stagingFolderPath}/lib1.brs`] = '';
                files[s`${rootDir}/lib1.brs`] = '';
                mock(files);

                let location = await sourceLocator.getSourceLocation({
                    stagingFilePath: s`${stagingFolderPath}/lib1.brs`,
                    stagingFolderPath: stagingFolderPath,
                    fileMappings: [{
                        src: s`${rootDir}/lib1.brs`,
                        dest: s`${stagingFolderPath}/lib1.brs`
                    }],
                    rootDir: rootDir,
                    lineNumber: 1,
                    columnIndex: 4,
                    enableSourceMaps: true
                });
                expect(location).to.eql({
                    filePath: s`${rootDir}/lib1.brs`,
                    lineNumber: 1,
                    columnIndex: 4
                });
            });

            it('follows sourcemap when present', async () => {
                await preloadWasm();
                let rootFilePath = s`${rootDir}/main.brs`;
                files[rootFilePath] = `sub main()\n    print "hello ";print "world"\nend sub`;

                var node = new SourceNode(null, null, rootFilePath, [
                    new SourceNode(1, 0, rootFilePath, 'sub main()\n'),
                    new SourceNode(2, 4, rootFilePath, '    print "hello "\n'),
                    new SourceNode(2, 19, rootFilePath, '    print "world"\n'),
                    new SourceNode(3, 4, rootFilePath, 'end sub')
                ]);
                var out = node.toStringWithSourceMap();
                files[s`${stagingFolderPath}/main.brs`] = out.code;
                files[s`${stagingFolderPath}/main.brs.map`] = out.map.toString();
                mock(files);

                let location = await sourceLocator.getSourceLocation({
                    stagingFilePath: s`${stagingFolderPath}/main.brs`,
                    stagingFolderPath: stagingFolderPath,
                    fileMappings: [{
                        src: s`${rootDir}/main.brs`,
                        dest: s`${stagingFolderPath}/main.brs`
                    }],
                    rootDir: rootDir,
                    lineNumber: 3,
                    columnIndex: 8,
                    enableSourceMaps: true
                });
                expect(location).to.eql({
                    filePath: s`${rootDir}/main.brs`,
                    lineNumber: 2,
                    columnIndex: 19
                });
            });
        });

        describe('sourceDirs', () => {
            //no maps, sourceDirs[0]
            it('maps staging file to sourceDirs[0]', async () => {
                files[s`${stagingFolderPath}/lib1.brs`] = '';
                files[s`${rootDir}/lib1.brs`] = '';
                files[s`${sourceDirs[0]}/lib1.brs`] = '';
                files[s`${sourceDirs[1]}/lib1.brs`] = '';
                files[s`${sourceDirs[2]}/lib1.brs`] = '';
                mock(files);

                let location = await sourceLocator.getSourceLocation({
                    stagingFilePath: s`${stagingFolderPath}/lib1.brs`,
                    stagingFolderPath: stagingFolderPath,
                    fileMappings: [{
                        src: s`${sourceDirs[0]}/lib1.brs`,
                        dest: '/lib1.brs'
                    }],
                    rootDir: rootDir,
                    lineNumber: 1,
                    columnIndex: 4,
                    sourceDirs: sourceDirs,
                    enableSourceMaps: true
                });
                expect(location).to.eql({
                    filePath: s`${sourceDirs[0]}/lib1.brs`,
                    lineNumber: 1,
                    columnIndex: 4
                });
            });

            //no maps, sourceDirs[1]
            it('maps staging file to sourceDirs[1]', async () => {
                files[s`${stagingFolderPath}/lib1.brs`] = '';
                files[s`${rootDir}/lib1.brs`] = '';
                files[s`${sourceDirs[1]}/lib1.brs`] = '';
                files[s`${sourceDirs[2]}/lib1.brs`] = '';
                mock(files);

                let location = await sourceLocator.getSourceLocation({
                    stagingFilePath: s`${stagingFolderPath}/lib1.brs`,
                    stagingFolderPath: stagingFolderPath,
                    fileMappings: [{
                        src: s`${sourceDirs[1]}/lib1.brs`,
                        dest: '/lib1.brs'
                    }],
                    rootDir: rootDir,
                    lineNumber: 1,
                    columnIndex: 4,
                    sourceDirs: sourceDirs,
                    enableSourceMaps: true
                });
                expect(location).to.eql({
                    filePath: s`${sourceDirs[1]}/lib1.brs`,
                    lineNumber: 1,
                    columnIndex: 4
                });
            });

            //no maps, sourceDirs[2]
            it('maps staging file to sourceDirs[2]', async () => {
                files[s`${stagingFolderPath}/lib1.brs`] = '';
                files[s`${rootDir}/lib1.brs`] = '';
                files[s`${sourceDirs[2]}/lib1.brs`] = '';
                mock(files);

                let location = await sourceLocator.getSourceLocation({
                    stagingFilePath: s`${stagingFolderPath}/lib1.brs`,
                    stagingFolderPath: stagingFolderPath,
                    fileMappings: [{
                        src: s`${sourceDirs[2]}/lib1.brs`,
                        dest: '/lib1.brs'
                    }],
                    rootDir: rootDir,
                    lineNumber: 1,
                    columnIndex: 4,
                    sourceDirs: sourceDirs,
                    enableSourceMaps: true
                });
                expect(location).to.eql({
                    filePath: s`${sourceDirs[2]}/lib1.brs`,
                    lineNumber: 1,
                    columnIndex: 4
                });
            });
        });
    });
});

async function preloadWasm() {
    await SourceMapConsumer.with('{"version":3,"sources":[],"mappings":""}', null, (consumer) => {
        //don't care, just needed it to load the wasm file
    });
}
