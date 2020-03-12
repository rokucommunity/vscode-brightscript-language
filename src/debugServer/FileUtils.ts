import * as eol from 'eol';
import * as findInFiles from 'find-in-files';
import * as fsExtra from 'fs-extra';
import glob = require('glob');
import * as path from 'path';
import { RawSourceMap, SourceMapConsumer, SourceNode } from 'source-map';
import { promisify } from 'util';

import { SourceLocation } from './SourceLocator';
const globp = promisify(glob);

export class FileUtils {

    /**
     * Determine if the `subjectPath` contains and also ends with the test path
     * @param subjectPath the path that `testPath` should be found within
     * @param testPath the path that the `subjectPath` should end with
     */
    public pathEndsWith(subjectPath: string, testPath: string) {
        subjectPath = this.standardizePath(subjectPath);
        testPath = this.standardizePath(testPath);
        let idx = subjectPath.indexOf(testPath);
        return (idx > -1 && subjectPath.endsWith(testPath));
    }

    /**
     * Determines if the `subject` path includes `search` path, with case sensitive comparison
     * @param subject
     * @param search
     */
    public pathIncludesCaseInsensitive(subject: string, search: string) {
        if (!subject || !search) {
            return false;
        }
        return path.normalize(subject.toLowerCase()).indexOf(path.normalize(search.toLowerCase())) > -1;
    }

    /**
     * Replace the first instance of `search` in `subject` with `replacement`
     */
    public replaceCaseInsensitive(subject: string, search: string, replacement: string) {
        let idx = subject.toLowerCase().indexOf(search.toLowerCase());
        if (idx > -1) {
            let result = subject.substring(0, idx) + replacement + subject.substring(idx + search.length);
            return result;
        } else {
            return subject;
        }
    }

    /**
     * Given a `directoryPath`, find and return all file paths relative to the `directoryPath`
     * @param directoryPath
     */
    public async getAllRelativePaths(directoryPath: string) {
        //normalize the path
        directoryPath = path.normalize(directoryPath);
        let paths = await globp(path.join(directoryPath, '**/*'));
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
    public async findPartialFileInDirectory(partialFilePath: string, directoryPath: string) {
        //the debugger path was truncated, so try and map it to a file in the outdir
        partialFilePath = this.standardizePath(
            this.removeFileTruncation(partialFilePath)
        );

        //find any files from the outDir that end the same as this file
        let results: string[] = [];

        let relativePaths = await this.getAllRelativePaths(directoryPath);
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
     * Given a relative file path, and a list of directories, find the first directory that contains the relative file.
     * This is basically a utility function for the sourceDirs concept
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
     * Determine if the filename ends with one of the specified extensions
     */
    public hasAnyExtension(fileName: string, extensions: string[]) {
        var ext = path.extname(fileName);
        return extensions.indexOf(ext) > -1;
    }

    /**
     * Given a path to a directory, and an absolute path to a file,
     * get the relative file path (relative to the containingFolderPath)
     */
    public getRelativePath(containingFolderPath: string, filePathAbsolute: string) {
        return fileUtils.replaceCaseInsensitive(filePathAbsolute, containingFolderPath, '');
    }

    /**
     * Find the first `directoryPath` that is a parent to `filePathAbsolute`
     * @param filePathAbsolute - the absolute path to the file
     * @param directoryPaths - a list of directories where this file might reside
     */
    public findFirstParent(filePathAbsolute: string, directoryPaths: string[]) {
        filePathAbsolute = this.standardizePath(filePathAbsolute);
        for (let directoryPath of directoryPaths) {
            directoryPath = this.standardizePath(directoryPath);
            if (filePathAbsolute.indexOf(directoryPath) === 0) {
                return directoryPath;
            }
        }
    }

    /**
     * Find the number at the end of component library prefix at the end of the file.
     * (i.e. "pkg:/source/main_lib1.brs" returns 1)
     * All files in component libraries are renamed to include the component library index as the ending portion of the filename,
     * which is necessary because the Roku debugger doesn't tell you which component library a file came from.
     */
    public getComponentLibraryIndexFromFileName(filePath: string, postfix: string) {
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
     * Replace all directory separators with current OS separators,
     * force all drive letters to lower case (because that's what VSCode does sometimes so this makes it consistent)
     * @param thePath
     */
    public standardizePath(thePath: string) {
        if (!thePath) {
            return thePath;
        }
        var normalizedPath = path.normalize(
            thePath.replace(/[\/\\]+/g, path.sep)
        );
        //force the drive letter to lower case
        let match = /^[a-zA-Z]:/.exec(normalizedPath);
        if (match) {
            normalizedPath = match[0].toLowerCase() + normalizedPath.substring(2);
        }
        return normalizedPath;
    }

    /**
     * Given a source location, compute its location in staging. You should call this for the main app (rootDir, rootDir+sourceDirs),
     * and also once for each component library
     */
    public async getStagingLocationsFromSourceLocation(
        sourceFilePath: string,
        sourceLineNumber: number,
        sourceColumnIndex: number,
        sourceDirs: string[],
        stagingFolderPath: string
    ): Promise<{ type: 'sourceMap' | 'sourceDirs', locations: SourceLocation[] }> {

        sourceFilePath = fileUtils.standardizePath(sourceFilePath);
        sourceDirs = sourceDirs.map(x => fileUtils.standardizePath(x));
        stagingFolderPath = fileUtils.standardizePath(stagingFolderPath);

        //look through the sourcemaps in the staging folder for any instances of this source location
        let locations = await this.findSourceLocationInStagingSourceMaps({
            filePath: sourceFilePath,
            lineNumber: sourceLineNumber,
            columnIndex: sourceColumnIndex
        }, stagingFolderPath);

        if (locations.length > 0) {
            return {
                type: 'sourceMap',
                locations: locations
            };

            //no sourcemaps were found that reference this file.
            //walk look through each sourceDir in order, computing the relative path for the file, and
            //comparing that relative path to the relative path in the staging directory
            //so look for a file with the same relative location in the staging folder
        } else {

            //compute the relative path for this file
            let parentFolderPath = fileUtils.findFirstParent(sourceFilePath, sourceDirs);
            if (parentFolderPath) {
                let relativeFilePath = fileUtils.replaceCaseInsensitive(sourceFilePath, parentFolderPath, '');
                let stagingFilePathAbsolute = path.join(stagingFolderPath, relativeFilePath);
                return {
                    type: 'sourceDirs',
                    locations: [{
                        filePath: stagingFilePathAbsolute,
                        columnIndex: sourceColumnIndex,
                        lineNumber: sourceLineNumber
                    }]
                };
            } else {
                //return an empty array so the result is still iterable
                return {
                    type: 'sourceDirs',
                    locations: []
                };
            }
        }
    }

    /**
     * Get the location in the out/dist/generated file for a source location
     * @param sourceLocation - the source location that sound be converted to staging locations
     * @param stagingFolderPath - the path to the staging folder.
     */
    public async findSourceLocationInStagingSourceMaps(sourceLocation: SourceLocation, stagingFolderPath: string) {
        let sourceFilePathAbsolute = this.standardizePath(sourceLocation.filePath);
        //find every *.map file in the staging folder
        let sourceMapPaths = glob.sync('**/*.map', {
            cwd: stagingFolderPath,
            absolute: true
        });

        let locations = [] as SourceLocation[];

        //search through every source map async
        await Promise.all(sourceMapPaths.map(async (sourceMapPath) => {
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
                        line: sourceLocation.lineNumber,
                        column: sourceLocation.columnIndex,
                        source: sourceFilePathAbsolute
                    });
                });
                locations.push({
                    columnIndex: position.column,
                    lineNumber: position.line,
                    //remove the .map extension
                    filePath: sourceMapPath.replace(/\.map$/g, '')
                });
            }
        }));
        return locations;
    }

    /**
     * Get the source location of a position using a source map. If no source map is found, undefined is returned
     * @param filePathAbsolute - the absolute path to the file
     * @param debuggerLineNumber - the line number provided by the debugger
     * @param debuggerColumnIndex - the column number provided by the debugger. This is zero based.
     */
    public async getSourceLocationFromSourceMap(filePathAbsolute: string, debuggerLineNumber: number, debuggerColumnIndex: number = 0): Promise<SourceLocation> {
        //look for a source map for this file
        let sourceMapPath = `${filePathAbsolute}.map`;

        //if we have a source map, use it
        if (await fsExtra.pathExists(sourceMapPath)) {
            let sourceMapText = (await fsExtra.readFile(sourceMapPath)).toString();
            let sourceMap = JSON.parse(sourceMapText);
            let position = await SourceMapConsumer.with(sourceMap, null, (consumer) => {
                return consumer.originalPositionFor({
                    line: debuggerLineNumber,
                    column: debuggerColumnIndex
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
                filePath: sourcePathAbsolute
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

    /**
     * Given a path to a folder, search all files until an entry point is found.
     * (An entry point is a function that roku uses as the Main function to start the program).
     * @param projectPath - a path to a Roku project
     */
    public async findEntryPoint(projectPath: string) {
        let results = Object.assign(
            {},
            await findInFiles.find({ term: 'sub\\s+RunUserInterface\\s*\\(', flags: 'ig' }, projectPath, /.*\.brs/),
            await findInFiles.find({ term: 'function\\s+RunUserInterface\\s*\\(', flags: 'ig' }, projectPath, /.*\.brs/),
            await findInFiles.find({ term: 'sub\\s+main\\s*\\(', flags: 'ig' }, projectPath, /.*\.brs/),
            await findInFiles.find({ term: 'function\\s+main\\s*\\(', flags: 'ig' }, projectPath, /.*\.brs/),
            await findInFiles.find({ term: 'sub\\s+RunScreenSaver\\s*\\(', flags: 'ig' }, projectPath, /.*\.brs/),
            await findInFiles.find({ term: 'function\\s+RunScreenSaver\\s*\\(', flags: 'ig' }, projectPath, /.*\.brs/)
        );
        let keys = Object.keys(results);
        if (keys.length === 0) {
            throw new Error('Unable to find an entry point. Please make sure that you have a RunUserInterface, RunScreenSaver, or Main sub/function declared in your BrightScript project');
        }

        let entryPath = keys[0];

        let entryLineContents = results[entryPath].line[0];

        let lineNumber: number;
        //load the file contents
        let contents = await fsExtra.readFile(entryPath);
        let lines = eol.split(contents.toString());
        //loop through the lines until we find the entry line
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            if (line.indexOf(entryLineContents) > -1) {
                lineNumber = i + 1;
                break;
            }
        }

        return {
            filePath: entryPath,
            contents: entryLineContents,
            lineNumber: lineNumber
        };
    }

    /**
     * If a string has a leading slash, remove it
     */
    public removeLeadingSlash(thePath: string) {
        if (typeof thePath === 'string') {
            while (thePath.startsWith('/') || thePath.startsWith('\\')) {
                thePath = thePath.substring(1);
            }
        }
        return thePath;
    }

    /**
     * Create a sourceMap file that contains the contents of the `destPath` file,
     * but points to the `srcPath` for its location in the sourceMap.
     * This is mainly used to support sourceDirs where the line numbers should be the same.
     * @param srcPath
     * @param destPath
     */
    public async createSourcemap(srcPath: string, destPath: string) {
        var fileContents = await fsExtra.readFile(destPath);
        var lines = eol.split(fileContents.toString());
        var chunks = [];
        let newline = '\n';
        for (let i = 0; i < lines.length; i++) {
            //is final line
            if (i === lines.length - 1) {
                newline = '';
            }
            chunks.push(
                new SourceNode(i + 1, 0, srcPath, `${lines[i]}${newline}`)
            );
        }
        let node = new SourceNode(null, null, srcPath, chunks);
        var result = node.toStringWithSourceMap();
        var mapText = JSON.stringify(result.map);
        //write the file
        await fsExtra.writeFile(`${destPath}.map`, mapText);
    }
}

export let fileUtils = new FileUtils();

/**
 * A tagged template literal function for standardizing the path.
 */
export function standardizePath(stringParts, ...expressions: any[]) {
    let result = [];
    for (var i = 0; i < stringParts.length; i++) {
        result.push(stringParts[i], expressions[i]);
    }
    return fileUtils.standardizePath(
        result.join('')
    );
}
