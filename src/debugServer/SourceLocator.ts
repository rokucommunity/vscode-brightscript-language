import { FilesType } from 'roku-deploy';
import * as fsExtra from 'fs-extra';
import * as rokuDeploy from 'roku-deploy';
import { SourceMapConsumer } from 'source-map';

import { util } from './util';
import { fileUtils } from './FileUtils';
/**
 * Find original source locations based on debugger/staging locations.
 */
export class SourceLocator {
    /**
     * Given a debugger/staging location, convert that to a source location
     */
    public async getSourceLocation(options: SourceLocatorOptions): Promise<SourceLocation> {
        let rootDir = fileUtils.standardizePath(options.rootDir);
        let stagingFolderPath = fileUtils.standardizePath(options.stagingFolderPath);
        let filePathInStaging = fileUtils.standardizePath(options.stagingFilePath);
        let sourceDirs = options.sourceDirs ? options.sourceDirs.map(x => fileUtils.standardizePath(x)) : [];
        //throw out any sourceDirs pointing the rootDir
        sourceDirs = sourceDirs.filter(x => x !== rootDir);

        //look for a sourcemap for this file (if source maps are enabled)
        if (options?.enableSourceMaps !== false) {
            let sourceMapPath = `${filePathInStaging}.map`;
            if (fsExtra.existsSync(sourceMapPath)) {
                //load sourceMap into memory
                var sourceMap = fsExtra.readFileSync(sourceMapPath).toString();
                //parse sourcemap and get original position for the staging location
                var originalPosition = await SourceMapConsumer.with(sourceMap, null, (consumer) => {
                    return consumer.originalPositionFor({
                        line: options.lineNumber,
                        column: options.columnIndex
                    });
                });
                return {
                    lineNumber: originalPosition.line,
                    columnIndex: originalPosition.column,
                    filePath: originalPosition.source
                };
            }
        }

        //if we have sourceDirs, rootDir is the project's OUTPUT folder, so skip looking for files there, and
        //instead walk backwards through sourceDirs until we find the file we want
        if (sourceDirs.length > 0) {
            let relativeFilePath = fileUtils.getRelativePath(stagingFolderPath, filePathInStaging);
            let sourceDirsFilePath = await fileUtils.findFirstRelativeFile(relativeFilePath, sourceDirs);
            //if we found a file in one of the sourceDirs, use that
            if (sourceDirsFilePath) {
                return {
                    filePath: sourceDirsFilePath,
                    lineNumber: options.lineNumber,
                    columnIndex: options.columnIndex
                };
            }
        }

        //no sourceDirs and no sourceMap. assume direct file copy using roku-deploy.
        if (!options.fileMappings) {
            throw new Error('fileMappings cannot be undefined');
        }
        let lowerFilePathInStaging = filePathInStaging.toLowerCase();
        let fileEntry = options.fileMappings.find(x => {
            return fileUtils.standardizePath(x.dest.toLowerCase()) === lowerFilePathInStaging;
        });

        if (fileEntry && await fsExtra.pathExists(fileEntry.src)) {
            return {
                filePath: fileEntry.src,
                lineNumber: options.lineNumber,
                columnIndex: options.columnIndex
            };
        }
        return undefined;
    }

}

export interface SourceLocatorOptions {
    /**
     * The absolute path to the staging folder
     */
    stagingFolderPath: string;

    /**
     * The absolute path to the file in the staging folder
     */
    stagingFilePath: string;

    /**
     * The absolute path to the root directory
     */
    rootDir: string;
    /**
     *  An array of sourceDir paths
     */
    sourceDirs?: string[];
    /**
     * The result of rokuDeploy.getFilePaths(). This is passed in so it can be cached on the outside in order to improve performance
     */
    fileMappings: { src: string; dest: string }[];
    /**
     * The debugger line number (1-based)
     */
    lineNumber: number;
    /**
     * The debugger column index (0-based)
     */
    columnIndex: number;
    /**
     * If true, then use source maps as part of the process
     */
    enableSourceMaps: boolean;
}

export interface SourceLocation {
    /**
     * The path to the file in the source location
     */
    filePath: string;
    /**
     * 1-based line number
     */
    lineNumber: number;
    /**
     * 0-based column index
     */
    columnIndex: number;
}
