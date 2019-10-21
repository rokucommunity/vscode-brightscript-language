import * as fsExtra from 'fs-extra';
import glob = require('glob');
import * as path from 'path';
import { RawSourceMap, SourceMapConsumer } from 'source-map';

import { SourceLocation } from './BrightScriptDebugSession';

export class FileUtils {

    /**
     * Determine if the `subjectPath` contains and also ends with the test path
     * @param subjectPath the path that `testPath` should be found within
     * @param testPath the path that the `subjectPath` should end with
     */
    public pathEndsWith(subjectPath: string, testPath: string) {
        let idx = subjectPath.indexOf(testPath);
        return (idx > -1 && subjectPath.endsWith(testPath));
    }

    /**
     * Given a `directoryPath`, find and return all file paths relative to the `directoryPath`
     * @param directoryPath
     */
    public getAllRelativePaths(directoryPath: string) {
        //normalize the path
        directoryPath = path.normalize(directoryPath);
        let paths = glob.sync(path.join(directoryPath, '**/*'));
        for (let i = 0; i < paths.length; i++) {
            //make the path relative (+1 for removing the slash)
            paths[i] = paths[i].substring(directoryPath.length + 1);
        }
        return paths;
    }

    /**
     * Given a partial file path (truncated path from Roku telnet console),
     * search through the staging directory and find any paths that appear to
     * match the partial file path
     * @param partialFilePath the partial file path to search for
     * @param directoryPath the path to the directory to search through
     * @returns a relative path to the first match found in the directory
     */
    public findPartialFileInDirectory(partialFilePath: string, directoryPath: string) {
        //the debugger path was truncated, so try and map it to a file in the outdir
        partialFilePath = this.removeFileTruncation(partialFilePath);

        //find any files from the outDir that end the same as this file
        let results: string[] = [];

        let relativePaths = this.getAllRelativePaths(directoryPath);
        for (let relativePath of relativePaths) {
            //if the staging path looks like the debugger path, keep it for now
            if (this.pathEndsWith(relativePath, partialFilePath)) {
                results.push(relativePath);
            }
        }

        //TODO is there something more we should do about finding multiple matches?
        if (results.length > 1) {
            console.warn(
                `Found multiple paths in '${directoryPath}' that match '${partialFilePath}'. Returning the first result, but you should consider renaming files in longer file paths to something unique`
            );
        }

        //return the first path found (or undefined if no results found);
        return results[0];
    }

    /**
     * The Roku telnet debugger truncates file paths, so this removes that truncation piece.
     * @param filePath
     */
    public removeFileTruncation(filePath) {
        return (filePath.indexOf('...') === 0) ? filePath.substring(3) : filePath;
    }

    /**
     * Given a relative file path, and a list of directories, find the first directory that contains the relative file
     * @param relativeFilePath - the path to the item relative to each `directoryPath`
     * @param directoryPaths - an array of directory paths
     * @returns the first path that was found to exist, or undefined if the file was not found in any of the `directoryPaths`
     */
    public async findFirstRelativeFile(relativeFilePath: string, directoryPaths: string[]) {
        for (let directoryPath of directoryPaths) {
            let fullPath = path.normalize(path.join(directoryPath, relativeFilePath));
            if (await fsExtra.pathExists(fullPath)) {
                return fullPath;
            }
        }
    }

    /**
     * Find the number at the end of component library prefix at the end of the file.
     * (i.e. "pkg:/source/main_lib1.brs" returns 1)
     * All files in component libraries are renamed to include the component library index as the ending portion of the filename,
     * which is necessary because the Roku debugger doesn't tell you which component library a file came from.
     */
    public getComponentLibraryIndex(filePath: string, postfix: string) {
        let regex = new RegExp(postfix + '(\\d+)');
        let match = regex.exec(filePath);
        let result: number | undefined;
        if (match) {
            result = parseInt(match[1]);
            if (isNaN(result)) {
                result = undefined;
            }
        }
        return result;
    }

    /**
     * Normalize path and replace all directory separators with current OS separators
     * @param thePath
     */
    public standardizePath(thePath: string) {
        if (!thePath) {
            return thePath;
        }
        return path.normalize(
            thePath.replace(/[\/\\]+/g, path.sep)
        );
    }

    /**
     * Get the location in the out/dist/generated file for a source location
     * @param sourceFilePathAbsolute - the absolute path to the source file
     * @param stagingFolderPath - the path to the staging folder.
     * @param sourceLineNumber - the line number of the source file location. this is one based.
     * @param sourceColumnNumber - the column number of the source file location. this is zero based
     */
    public async getGeneratedLocationsFromSourcemap(sourceFilePathAbsolute: string, stagingFolderPath: string, sourceLineNumber: number, sourceColumnIndex: number = 0) {
        sourceFilePathAbsolute = this.standardizePath(sourceFilePathAbsolute);
        //find every *.map file in the staging folder
        let sourceMapPaths = glob.sync('**/*.map', {
            cwd: stagingFolderPath,
            absolute: true
        });

        let locations = [] as SourceLocation[];

        for (let sourceMapPath of sourceMapPaths) {
            // try {
            let sourceMapText = fsExtra.readFileSync(sourceMapPath).toString();
            let rawSourceMap = JSON.parse(sourceMapText) as RawSourceMap;
            let absoluteSourcePaths = rawSourceMap.sources.map(x =>
                this.standardizePath(
                    path.resolve(
                        //path.resolve throws an exception if passed `undefined`, so use empty string if sourceRoot is null or undefined
                        //the sourcemap should be providing a valid sourceRoot, or using absolute paths for maps
                        rawSourceMap.sourceRoot || '',
                        x
                    )
                )
            );
            //if the source path was found in the sourceMap, convert the source location into a target location
            if (absoluteSourcePaths.indexOf(sourceFilePathAbsolute) > -1) {
                let position = await SourceMapConsumer.with(rawSourceMap, null, (consumer) => {
                    return consumer.generatedPositionFor({
                        line: sourceLineNumber,
                        column: sourceColumnIndex,
                        source: sourceFilePathAbsolute
                    });
                });
                locations.push({
                    columnIndex: position.column,
                    lineNumber: position.line,
                    //remove the .map extension
                    pathAbsolute: sourceMapPath.replace(/\.map$/g, '')
                });
            }
            // } catch{
            //we don't care about errors, just assume this is not a match
            // }
        }
        return locations;
    }

    /**
     * Get the source location of a position using a source map. If no source map is found, undefined is returned
     * @param filePathAbsolute - the absolute path to the file
     * @param debuggerLineNumber - the line number provided by the debugger
     * @param debuggerColumnNumber - the column number provided by the debugger. This is zero based.
     */
    public async getSourceLocationFromSourceMap(filePathAbsolute: string, debuggerLineNumber: number, debuggerColumnNumber: number = 0): Promise<SourceLocation> {
        //look for a source map for this file
        let sourceMapPath = `${filePathAbsolute}.map`;

        //if we have a source map, use it
        if (await fsExtra.pathExists(sourceMapPath)) {
            let sourceMapText = (await fsExtra.readFile(sourceMapPath)).toString();
            let sourceMap = JSON.parse(sourceMapText);
            let position = await SourceMapConsumer.with(sourceMap, null, (consumer) => {
                return consumer.originalPositionFor({
                    line: debuggerLineNumber,
                    column: debuggerColumnNumber
                });
            });
            //if the sourcemap didn't find a valid mapped location, return undefined and fallback to whatever location the debugger produced
            if (!position || !position.source) {
                return undefined;
            }
            //get the path to the folder this source map lives in
            let folderPathForStagingFile = path.dirname(sourceMapPath);
            //get the absolute path to the source file
            let sourcePathAbsolute = path.resolve(folderPathForStagingFile, position.source);
            return {
                columnIndex: position.column,
                lineNumber: position.line,
                pathAbsolute: sourcePathAbsolute
            };
        }
    }

    /**
     * Get a file url for a file path (i.e. file:///C:/projects/Something or file:///projects/something
     * @param fullPath
     */
    public getFileProtocolPath(fullPath: string) {
        if (fullPath.indexOf('file://') === 0) {
            return fullPath;
        }
        let result: string;
        if (fullPath.indexOf('/') === 0 || fullPath.indexOf('\\') === 0) {
            result = `file://${fullPath}`;
        } else {
            result = `file:///${fullPath}`;
        }
        return result;
    }

}

export let fileUtils = new FileUtils();
