import glob = require('glob');
import * as path from 'path';

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
     * Given a file path provided by the debugger, find the path to that file in the staging directory
     * @param debuggerPath the path to the file which was provided by the debugger
     * @param stagingFolderPath - the path to the root of the staging folder (where all of the files were copied before deployment)
     * @return a full path to the file in the staging directory
     */
    public getStagingFilePathFromDebuggerPath(debuggerPath: string, stagingFolderPath: string) {
        let relativePath: string;

        //remove preceding pkg:
        if (debuggerPath.toLowerCase().indexOf('pkg:') === 0) {
            relativePath = debuggerPath.substring(4);
        } else {
            relativePath = fileUtils.findPartialFileInDirectory(debuggerPath, stagingFolderPath);
        }
        let stagingFilePath = path.join(stagingFolderPath, relativePath);
        return stagingFilePath;

        //TODO support component libraries

        // if (debuggerPath.includes(this.componentLibraryPostfix)) {
        //     //remove preceding slash
        //     if (debuggerPath.toLowerCase().indexOf('/') === 0) {
        //         debuggerPath = debuggerPath.substring(1);
        //     }

        //     debuggerPath = fileUtils.removeFileTruncation(debuggerPath);

        //     //find any files from the outDir that end the same as this file
        //     let results: string[] = [];
        //     let libTagIndex = debuggerPath.indexOf(this.componentLibraryPostfix);
        //     let libIndex = parseInt(debuggerPath.substr(libTagIndex + this.componentLibraryPostfix.length, debuggerPath.indexOf('.brs') - libTagIndex - 5)) - 1;
        //     let componentLibraryPaths = this.componentLibrariesStagingDirPaths[libIndex];
        //     let componentLibrary: any = this.launchArgs.componentLibraries[libIndex];
        //     // Update the root dir
        //     sourceDirs = [componentLibrary.rootDir];

        //     Object.keys(componentLibraryPaths).forEach((key, index) => {
        //         //if the staging path looks like the debugger path, keep it for now
        //         if (fileUtils.pathEndsWith(key, debuggerPath)) {
        //             results.push(componentLibraryPaths[key]);
        //         }
        //     });

        //     if (results.length > 0) {
        //         //a wrong file, which has output is more useful than nothing!
        //         debuggerPath = results[0];
        //     } else {
        //         //we found multiple files with the exact same path (unlikely)...nothing we can do about it.
        //     }
        // } else {
    }
}

export let fileUtils = new FileUtils();