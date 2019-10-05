import * as fsExtra from 'fs-extra';
import glob = require('glob');
import * as path from 'path';
import { SourceMapConsumer } from 'source-map';

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
     * Get the source location of a position using a sourcemap. If no sourcemap is found, undefined is returned
     * @param filePathAbsolute - the absolute path to the file
     * @param debuggerLineNumber - the line number provided by the debugger
     * @param debuggerColumnNumber - the column number provided by the debugger
     */
    public async getSourceLocationFromSourcemap(filePathAbsolute: string, debuggerLineNumber: number, debuggerColumnNumber: number = 0): Promise<SourceLocation> {
        //look for a sourcemap for this file
        let sourcemapPath = `${filePathAbsolute}.map`;

        //if we have a sourcemap, use it
        if (await fsExtra.pathExists(sourcemapPath)) {
            // let sourcemapText = (await fsExtra.readFile(stagingFileMapPath)).toString();
            // let sourcemap = JSON.parse(sourcemapText);
            let position = await SourceMapConsumer.with(null, sourcemapPath, (consumer) => {
                return consumer.originalPositionFor({
                    line: debuggerLineNumber,
                    column: debuggerColumnNumber
                });
            });
            //get the path to the folder this sourcemap lives in
            let folderPathForStagingFile = path.dirname(sourcemapPath);
            //get the absolute path to the source file
            let sourcePathAbsolute = path.resolve(folderPathForStagingFile, position.source);
            return {
                columnIndex: position.column,
                lineNumber: position.line,
                pathAbsolute: sourcePathAbsolute
            };
        }
    }
}

export let fileUtils = new FileUtils();
