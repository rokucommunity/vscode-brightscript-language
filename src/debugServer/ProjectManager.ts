import * as fsExtra from 'fs-extra';
import * as path from 'path';
import { FilesType, RokuDeploy } from 'roku-deploy';
import * as rokuDeploy from 'roku-deploy';
import { fileUtils } from './FileUtils';
import { standardizePath as s } from './FileUtils';
import * as findInFiles from 'find-in-files';
import { util } from '../util';
import { SourceLocator } from './SourceLocator';
import * as assert from 'assert';
import * as eol from 'eol';
import { BreakpointManager } from './BreakpointManager';
// tslint:disable-next-line:no-var-requires Had to add the import as a require do to issues using this module with normal imports
let replaceInFile = require('replace-in-file');

export const componentLibraryPostfix: string = '__lib';

/**
 * Manages the collection of brightscript projects being used in a debug session.
 * Will contain the main project (in rootDir), as well as component libraries.
 */
export class ProjectManager {
    /**
     * A class that keeps track of all the breakpoints for a debug session.
     * It needs to be notified of any changes in breakpoints
     */
    public breakpointManager = new BreakpointManager();

    public launchArgs: {
        enableSourceMaps: boolean;
    };

    public mainProject: Project;
    public componentLibraryProjects = [] as ComponentLibraryProject[];

    public addComponentLibraryProject(project: ComponentLibraryProject) {
        this.componentLibraryProjects.push(project);
    }

    /**
     * Get the list of staging folder paths from all projects
     */
    public getStagingFolderPaths() {
        let projects = [
            ...(this.mainProject ? [this.mainProject] : []),
            ...(this.componentLibraryProjects ?? [])
        ];
        return projects.map(x => x.stagingFolderPath);
    }

    /**
     * Given a debugger path and line number, compensate for the injected breakpoint line offsets
     * @param filePath - the path to the file that may or may not have breakpoints
     * @param debuggerLineNumber - the line number from the debugger
     */
    public getLineNumberOffsetByBreakpoints(filePath: string, debuggerLineNumber: number) {
        let breakpoints = this.breakpointManager.getBreakpointsForFile(filePath);
        //throw out duplicate breakpoints (account for entry breakpoint) and sort them ascending
        breakpoints = this.breakpointManager.sortAndRemoveDuplicateBreakpoints(breakpoints);

        let sourceLineByDebuggerLine = {};
        let sourceLineNumber = 0;
        for (let loopDebuggerLineNumber = 1; loopDebuggerLineNumber <= debuggerLineNumber; loopDebuggerLineNumber++) {
            sourceLineNumber++;
            sourceLineByDebuggerLine[loopDebuggerLineNumber] = sourceLineNumber;

            /**
             * A line with a breakpoint on it should share the same debugger line number.
             * The injected `STOP` line will be given the correct line number automatically,
             * but we need to compensate for the actual code line. So if there's a breakpoint
             * on this line, handle the next line's mapping as well (and skip one iteration of the loop)
             */
            let breakpointForLine = breakpoints.find(x => x.line === sourceLineNumber);
            if (breakpointForLine) {
                sourceLineByDebuggerLine[loopDebuggerLineNumber + 1] = sourceLineNumber;
                loopDebuggerLineNumber++;
            }
        }

        return sourceLineByDebuggerLine[debuggerLineNumber];
    }

    /**
     * @param debuggerPath
     * @param debuggerLineNumber - the 1-based line number from the debugger
     */
    public async getSourceLocation(debuggerPath: string, debuggerLineNumber: number) {
        //get source location using
        let stagingFileInfo = await this.getStagingFileInfo(debuggerPath);
        if (!stagingFileInfo) {
            return;
        }
        let project = stagingFileInfo.project;

        var locator = new SourceLocator();
        var sourceLocation = await locator.getSourceLocation({
            lineNumber: debuggerLineNumber,
            columnIndex: 0,
            fileMappings: project.fileMappings,
            rootDir: project.rootDir,
            stagingFilePath: stagingFileInfo.absolutePath,
            stagingFolderPath: project.stagingFolderPath,
            sourceDirs: project.sourceDirs,
            enableSourceMaps: this.launchArgs?.enableSourceMaps ?? true
        });

        //if sourcemaps are disabled, account for the breakpoint offsets
        if (this.launchArgs?.enableSourceMaps === false) {
            sourceLocation.lineNumber = this.getLineNumberOffsetByBreakpoints(sourceLocation.filePath, sourceLocation.lineNumber);
        }

        return sourceLocation;
    }

    /**
     *
     * @param stagingFolderPath - the path to
     */
    public async registerEntryBreakpoint(stagingFolderPath: string) {
        //find the main function from the staging flder
        let entryPoint = await fileUtils.findEntryPoint(stagingFolderPath);

        //convert entry point staging location to source location
        let sourceLocation = await this.getSourceLocation(entryPoint.filePath, entryPoint.lineNumber);

        //register the entry breakpoint
        this.breakpointManager.registerBreakpoint(sourceLocation.filePath, {
            //+1 to select the first line of the function
            line: sourceLocation.lineNumber + 1
        });
    }

    /**
     * Given a path to a file in some staging directory, find the project that file belongs to
     */
    private getProjectForStagingFile(stagingFilePath: string) {
        let lowerStagingFilePath = stagingFilePath.toLowerCase();
        let projects = [this.mainProject, ...this.componentLibraryProjects];
        for (let project of projects) {
            if (lowerStagingFilePath.indexOf(project.stagingFolderPath.toLowerCase()) === 0) {
                return project;
            }
        }
    }

    /**
     * Given a debugger-relative file path, find the path to that file in the staging directory.
     * This supports the standard out dir, as well as component library out dirs
     * @param debuggerOrStagingPath the path to the file which was provided by the debugger (or an absolute path to a file in the staging directory)
     * @param stagingFolderPath - the path to the root of the staging folder (where all of the files were copied before deployment)
     * @return a full path to the file in the staging directory
     */
    public async getStagingFileInfo(debuggerOrStagingPath: string) {
        let project: Project;

        let componentLibraryIndex = fileUtils.getComponentLibraryIndexFromFileName(debuggerOrStagingPath, componentLibraryPostfix);
        //component libraries
        if (componentLibraryIndex !== undefined) {
            let lib = this.componentLibraryProjects.find(x => x.libraryIndex === componentLibraryIndex);
            if (lib) {
                project = lib;
            } else {
                throw new Error(`There is no component library with index ${componentLibraryIndex}`);
            }
            //standard project files
        } else {
            project = this.mainProject;
        }

        let relativePath: string;

        //if the path starts with pkg, we have an exact match.
        if (debuggerOrStagingPath.toLowerCase().indexOf('pkg:') === 0) {
            relativePath = debuggerOrStagingPath.substring(4);

            //an absolute path to a file in the staging directory
        } else if (path.isAbsolute(debuggerOrStagingPath)) {
            project = this.getProjectForStagingFile(debuggerOrStagingPath);
            relativePath = fileUtils.replaceCaseInsensitive(debuggerOrStagingPath, project.stagingFolderPath, '');
        } else {
            relativePath = await fileUtils.findPartialFileInDirectory(debuggerOrStagingPath, project.stagingFolderPath);
        }
        if (relativePath) {
            return {
                relativePath: path.normalize(relativePath),
                absolutePath: s`${project.stagingFolderPath}/${relativePath}`,
                project: project
            };
        } else {
            return undefined;
        }
    }
}

interface AddProjectParams {
    rootDir: string;
    outDir: string;
    sourceDirs?: string[];
    files: Array<FilesType>;
    injectRaleTrackerTask?: boolean;
    trackerTaskFileLocation?: string;
    bsConst?: { [key: string]: boolean };
    stagingFolderPath?: string;
}

export class Project {
    constructor(params: AddProjectParams) {
        assert(params?.rootDir, 'rootDir is required');
        this.rootDir = fileUtils.standardizePath(params.rootDir);

        assert(params?.outDir, 'outDir is required');
        this.outDir = fileUtils.standardizePath(params.outDir);

        this.stagingFolderPath = params.stagingFolderPath ?? rokuDeploy.getStagingFolderPath(this);
        this.bsConst = params.bsConst;
        this.sourceDirs = (params.sourceDirs ?? [])
            //standardize every sourcedir
            .map(x => fileUtils.standardizePath(x));
        this.injectRaleTrackerTask = params.injectRaleTrackerTask ?? false;
        this.trackerTaskFileLocation = params.trackerTaskFileLocation;
        this.files = params.files ?? [];
    }
    public rootDir: string;
    public outDir: string;
    public sourceDirs: string[];
    public files: Array<FilesType>;
    public stagingFolderPath: string;
    public fileMappings: Array<{ src: string; dest: string; }>;
    public bsConst: { [key: string]: boolean };
    public injectRaleTrackerTask: boolean;
    public trackerTaskFileLocation: string;

    public async stage() {
        var rokuDeploy = new RokuDeploy();
        if (!this.fileMappings) {
            this.fileMappings = await this.getFileMappings();
        }

        //override the getFilePaths function so rokuDeploy doesn't run it again during prepublishToStaging
        (rokuDeploy as any).getFilePaths = () => Promise.resolve(this.fileMappings);

        //copy all project files to the staging folder
        await rokuDeploy.prepublishToStaging({
            rootDir: this.rootDir,
            stagingFolderPath: this.stagingFolderPath,
            files: this.files,
            outDir: this.outDir,
        });

        //preload the original location of every file
        await this.resolveFileMappingsForSourceDirs();

        await this.transformManifestWithBsConst();

        await this.transformRaleTrackerTask();
    }

    /**
     * If the project uses sourceDirs, replace every `fileMapping.src` with its original location in sourceDirs
     */
    private resolveFileMappingsForSourceDirs() {
        return Promise.all([
            this.fileMappings.map(async x => {
                let stagingFilePathRelative = fileUtils.getRelativePath(this.stagingFolderPath, x.dest);
                let sourceDirFilePath = await fileUtils.findFirstRelativeFile(stagingFilePathRelative, this.sourceDirs);
                if (sourceDirFilePath) {
                    x.src = sourceDirFilePath;
                }
            })
        ]);
    }

    /**
     * Apply the bsConst transformations to the manifest file for this project
     */
    public async transformManifestWithBsConst() {
        if (this.bsConst) {
            let manifestPath = s`${this.stagingFolderPath}/manifest`;
            if (await fsExtra.pathExists(manifestPath)) {
                // Update the bs_const values in the manifest in the staging folder before side loading the channel
                let fileContents = (await fsExtra.readFile(manifestPath)).toString();
                fileContents = this.updateManifestBsConsts(this.bsConst, fileContents);
                await fsExtra.writeFile(manifestPath, fileContents);
            }
        }
    }

    public updateManifestBsConsts(consts: { [key: string]: boolean }, fileContents: string): string {
        let bsConstLine;
        let missingConsts: string[] = [];
        let lines = eol.split(fileContents);

        let newLine;
        //loop through the lines until we find the bs_const line if it exists
        for (const line of lines) {
            if (line.toLowerCase().startsWith('bs_const')) {
                bsConstLine = line;
                newLine = line;
                break;
            }
        }

        if (bsConstLine) {
            // update the consts in the manifest and check for missing consts
            missingConsts = Object.keys(consts).reduce((results, key) => {
                let match;
                if (match = new RegExp('(' + key + '\\s*=\\s*[true|false]+[^\\S\\r\\n]*\)', 'i').exec(bsConstLine)) {
                    newLine = newLine.replace(match[1], `${key}=${consts[key].toString()}`);
                } else {
                    results.push(key);
                }

                return results;
            }, []);

            // check for consts that where not in the manifest
            if (missingConsts.length > 0) {
                throw new Error(`The following bs_const keys were not defined in the channel's manifest:\n\n${missingConsts.join(',\n')}`);
            } else {
                // update the manifest contents
                return fileContents.replace(bsConstLine, newLine);
            }
        } else {
            throw new Error('bs_const was defined in the launch.json but not in the channel\'s manifest');
        }
    }

    /**
     *  Will search the project files for the comment "' vscode_rale_tracker_entry" and replace it with the code needed to start the TrackerTask.
     */
    public async transformRaleTrackerTask() {
        // inject the tracker task into the staging files if we have everything we need
        if (!this.injectRaleTrackerTask || !this.trackerTaskFileLocation) {
            return;
        }
        try {
            await fsExtra.copy(this.trackerTaskFileLocation, s`${this.stagingFolderPath}/components/TrackerTask.xml`);
            console.log('TrackerTask successfully injected');
            // Search for the tracker task entry injection point
            let trackerEntryTerm = `('\\s*vscode_rale_tracker_entry[^\\S\\r\\n]*)`;
            let results = Object.assign(
                {},
                await findInFiles.find({ term: trackerEntryTerm, flags: 'ig' }, this.stagingFolderPath, /.*\.brs/),
                await findInFiles.find({ term: trackerEntryTerm, flags: 'ig' }, this.stagingFolderPath, /.*\.xml/)
            );

            let keys = Object.keys(results);
            if (keys.length === 0) {
                // Do not throw an error as we don't want to prevent the user from launching the channel
                // just because they don't have a local version of the TrackerTask.

                //TODO how do we send debug logs from inside this class??
                // this.sendDebugLogLine('WARNING: Unable to find an entry point for Tracker Task.');
                // this.sendDebugLogLine('Please make sure that you have the following comment in your BrightScript project: "\' vscode_rale_tracker_entry"');
            } else {
                // This code will start the tracker task in the project
                let trackerTaskSupportCode = `if true = CreateObject("roAppInfo").IsDev() then m.vscode_rale_tracker_task = createObject("roSGNode", "TrackerTask") ' Roku Advanced Layout Editor Support`;

                // process the entry points found in the files
                // unlikely but we might have more then one
                for (const key of keys) {
                    let fileResults = results[key];
                    let fileContents = (await fsExtra.readFile(key)).toString();

                    let index = 0;
                    for (const line of fileResults.line) {
                        // Remove the comment part of the match from the line to use as a base for the new line
                        let newLine = line.replace(fileResults.matches[index], '');
                        let match;
                        if (match = /[\S]/.exec(newLine)) {
                            // There was some form of code before the comment the was removed
                            // append and use single line syntax
                            newLine += `: ${trackerTaskSupportCode}`;
                        } else {
                            newLine += trackerTaskSupportCode;
                        }

                        // Replace the found line with the new line containing the tracker task code
                        fileContents = fileContents.replace(line, newLine);
                        index++;
                    }

                    // safe the changes back to the staging file
                    await fsExtra.writeFile(key, fileContents);
                }
            }
        } catch (err) {
            console.error(err);
        }
    }

    /**
     *
     * @param stagingPath
     */
    public async zipPackage(params: { retainStagingFolder: true }) {
        await rokuDeploy.zipPackage({
            ...this,
            ...params
        });
    }

    /**
     * For every referenced file, ensure there is a sourcemap. If an external build tool
     * created the map, then that map is left intact. If no map is found, we walk backwards through
     * the sourceDirs to find the file.
     */
    public async ensureSourceMaps() {
        return Promise.all([
            this.fileMappings.map(async x => {
                //skip non brightscript-enabled files
                if (fileUtils.hasAnyExtension(x.src.toLowerCase(), ['.xml', '.brs']) === false) {
                    return;
                }

                let mapFilePath = s`${x.src}.map`;
                //if this file doesn't have a sourcemap, make one
                if (await fsExtra.pathExists(mapFilePath) === false) {
                    await fileUtils.createSourcemap(x.src, x.dest);
                }
            })
        ]);
    }

    /**
     * Get the file paths from roku-deploy, and ensure the dest paths are absolute
     * (`dest` paths are relative in later versions of roku-deploy)
     */
    protected async getFileMappings() {
        let fileMappings = await rokuDeploy.getFilePaths(this.files, this.stagingFolderPath, this.rootDir);
        for (let mapping of fileMappings) {
            //if the dest path is relative, make it absolute (relative to the staging dir)
            mapping.dest = path.resolve(this.stagingFolderPath, mapping.dest);
            //standardize the paths once here, and don't need to do it again anywhere else in this project
            mapping.src = fileUtils.standardizePath(mapping.src);
            mapping.dest = fileUtils.standardizePath(mapping.dest);
        }
        return fileMappings;
    }
}

export interface ComponentLibraryConstrutorParams extends AddProjectParams {
    outFile: string;
    libraryIndex: number;
}

export class ComponentLibraryProject extends Project {
    constructor(params: ComponentLibraryConstrutorParams) {
        super(params);
        this.outFile = params.outFile;
        this.libraryIndex = params.libraryIndex;
    }
    public outFile: string;
    public libraryIndex: number;

    /**
     * Takes a component Library and checks the outFile for replaceable values pulled from the libraries manifest
     * @param componentLibrary The library to check
     * @param stagingFolder staging folder of the component library to search for the manifest file
     */
    private async computeOutFileName(manifestPath: string) {
        let regexp = /\$\{([\w\d_]*)\}/;
        let renamingMatch;
        let manifestValues;

        // search the outFile for replaceable values such as ${title}
        while (renamingMatch = regexp.exec(this.outFile)) {
            if (!manifestValues) {
                // The first time a value is found we need to get the manifest values
                manifestValues = await util.convertManifestToObject(manifestPath);

                if (!manifestValues) {
                    throw new Error(`Cannot find manifest file at "${manifestPath}"\n\nCould not complete automatic component library naming.`);
                }
            }

            // replace the replaceable key with the manifest value
            let manifestVariableName = renamingMatch[1];
            let manifestVariableValue = manifestValues[manifestVariableName];
            if (manifestVariableValue) {
                this.outFile = this.outFile.replace(renamingMatch[0], manifestVariableValue);
            } else {
                throw new Error(`Cannot find manifest value:\n"${manifestVariableName}"\n\nCould not complete automatic component library naming.`);
            }
        }
    }

    public async stage() {
        //compute the file mappings now (the parent function will use these)
        this.fileMappings = await this.getFileMappings();
        let manifestPathRelative = fileUtils.standardizePath('/manifest');
        var manifestFileEntry = this.fileMappings.find(x => x.src.endsWith(manifestPathRelative));
        if (manifestFileEntry) {
            await this.computeOutFileName(manifestFileEntry.src);
        } else {
            throw new Error(`Could not find manifest path for component library at '${this.rootDir}'`);
        }
        this.stagingFolderPath = s`${this.outDir}/${path.basename(this.outFile)}`;
        return await super.stage();
    }

    public async postfixFiles() {
        let pathDetails: object = {};
        let postfix = `${componentLibraryPostfix}${this.libraryIndex}`;
        await Promise.all(this.fileMappings.map(async (fileMapping) => {
            let relativePath = fileUtils.removeLeadingSlash(
                fileUtils.getRelativePath(this.stagingFolderPath, fileMapping.dest)
            );
            let parsedPath = path.parse(relativePath);

            if (parsedPath.ext) {
                let originalRelativePath = relativePath;

                if (parsedPath.ext === '.brs') {
                    // Create the new file name to be used
                    let newFileName: string = `${parsedPath.name}${postfix}${parsedPath.ext}`;
                    relativePath = path.join(parsedPath.dir, newFileName);

                    // Rename the brs files to include the postfix namespacing tag
                    await fsExtra.move(fileMapping.dest, path.join(this.stagingFolderPath, relativePath));
                }

                // Add to the map of original paths and the new paths
                pathDetails[relativePath] = originalRelativePath;
            }
        }));

        // Update all the file name references in the library to the new file names
        await replaceInFile({
            files: [
                path.join(this.stagingFolderPath, '**/*.xml'),
                path.join(this.stagingFolderPath, '**/*.brs')
            ],
            from: /uri="(.+)\.brs"([^\/]*)\/>/gi,
            to: (match) => {
                return match.replace('.brs', postfix + '.brs');
            }
        });
    }
}
