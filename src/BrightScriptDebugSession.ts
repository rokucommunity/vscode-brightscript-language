import * as eol from 'eol';
import * as findInFiles from 'find-in-files';
import * as fsExtra from 'fs-extra';
import * as glob from 'glob';
import * as path from 'path';
import * as request from 'request';
import { FilesType, RokuDeploy } from 'roku-deploy';
import {
    DebugSession,
    Handles,
    InitializedEvent,
    OutputEvent,
    Scope,
    Source,
    StackFrame,
    StoppedEvent,
    TerminatedEvent,
    Thread,
    Variable
} from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';

import { ComponentLibraryServer } from './ComponentLibraryServer';
import { RendezvousHistory } from './RendezvousTracker';
import {
    EvaluateContainer,
    RokuAdapter
} from './RokuAdapter';
import { util } from './util';

// tslint:disable-next-line:no-var-requires Had to add the import as a require do to issues using this module with normal imports
let replaceInFile = require('replace-in-file');

class CompileFailureEvent implements DebugProtocol.Event {
    constructor(compileError: any) {
        this.body = compileError;
    }

    public body: any;
    public event: string;
    public seq: number;
    public type: string;
}

class LogOutputEvent implements DebugProtocol.Event {
    constructor(lines: string) {
        this.body = lines;
        this.event = 'BSLogOutputEvent';
    }

    public body: any;
    public event: string;
    public seq: number;
    public type: string;
}

class RendezvousEvent implements DebugProtocol.Event {
    constructor(output: RendezvousHistory) {
        this.body = output;
        this.event = 'BSRendezvousEvent';
    }

    public body: RendezvousHistory;
    public event: string;
    public seq: number;
    public type: string;
}

class LaunchStartEvent implements DebugProtocol.Event {
    constructor(args: LaunchRequestArguments) {
        this.body = args;
        this.event = 'BSLaunchStartEvent';
    }

    public body: any;
    public event: string;
    public seq: number;
    public type: string;
}

export class BrightScriptDebugSession extends DebugSession {
    public constructor() {
        super();
        // this debugger uses zero-based lines and columns
        this.setDebuggerLinesStartAt1(true);
        this.setDebuggerColumnsStartAt1(true);
    }

    //set imports as class properties so they can be spied upon during testing
    public rokuDeploy = require('roku-deploy') as RokuDeploy;

    private componentLibrariesOutDir: string;
    private componentLibraryServer = new ComponentLibraryServer();

    private rokuAdapterDeferred = defer<RokuAdapter>();
    /**
     * A promise that is resolved whenever the app has started running for the first time
     */
    private firstRunDeferred = defer<void>();

    private breakpointsByClientPath: { [clientPath: string]: DebugProtocol.SourceBreakpoint[] } = {};
    private breakpointIdCounter = 0;
    private evaluateRefIdLookup: { [expression: string]: number } = {};
    private evaluateRefIdCounter = 1;

    private variables: { [refId: number]: AugmentedVariable } = {};

    private variableHandles = new Handles<string>();

    private rokuAdapter: RokuAdapter;

    private getRokuAdapter() {
        return this.rokuAdapterDeferred.promise;
    }

    private launchArgs: LaunchRequestArguments;

    public get baseProjectPath() {
        return path.normalize(this.launchArgs.rootDir);
    }

    /**
     * The 'initialize' request is the first request called by the frontend
     * to interrogate the features the debug adapter provides.
     */
    public initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        // since this debug adapter can accept configuration requests like 'setBreakpoint' at any time,
        // we request them early by sending an 'initializeRequest' to the frontend.
        // The frontend will end the configuration sequence by calling 'configurationDone' request.
        this.sendEvent(new InitializedEvent());
        response.body = response.body || {};

        // This debug adapter implements the configurationDoneRequest.
        response.body.supportsConfigurationDoneRequest = true;

        // make VS Code to use 'evaluate' when hovering over source
        response.body.supportsEvaluateForHovers = true;

        // make VS Code to show a 'step back' button
        response.body.supportsStepBack = false;

        // This debug adapter supports conditional breakpoints
        response.body.supportsConditionalBreakpoints = true;

        // This debug adapter supports breakpoints that break execution after a specified number of hits
        response.body.supportsHitConditionalBreakpoints = true;

        // This debug adapter supports log points by interpreting the 'logMessage' attribute of the SourceBreakpoint
        response.body.supportsLogPoints = true;

        this.sendResponse(response);
    }

    /**
     * The path to the staging folder
     */
    private stagingPath: string;

    public launchRequestWasCalled = false;

    public async launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments) {
        this.launchArgs = args;
        this.launchRequestWasCalled = true;
        let disconnect = () => {
        };
        this.sendEvent(new LaunchStartEvent(args));

        let error: Error;
        this.log('Packaging and deploying to roku');
        try {

            this.sendDebugLogLine('Moving selected files to staging area');
            //copy all project files to the staging folder
            this.stagingPath = await this.rokuDeploy.prepublishToStaging(args as any);

            if (this.launchArgs.bsConst) {
                let manifestPath = path.join(this.stagingPath, '/manifest');
                if (util.fileExists(manifestPath)) {
                    // Update the bs_const values in the manifest in the staging folder before side loading the channel
                    let fileContents = (await fsExtra.readFile(manifestPath)).toString();
                    fileContents = await this.updateManifestBsConsts(this.launchArgs.bsConst, fileContents);
                    await fsExtra.writeFile(manifestPath, fileContents);
                }
            }

            // inject the tracker task into the staging files if we have everything we need
            if (this.launchArgs.injectRaleTrackerTask && this.launchArgs.trackerTaskFileLocation) {
                try {
                    await fsExtra.copy(this.launchArgs.trackerTaskFileLocation, path.join(this.stagingPath + '/components/', 'TrackerTask.xml'));
                    console.log('TrackerTask successfully injected');
                    await this.injectRaleTrackerTaskCode(this.stagingPath);
                } catch (err) {
                    console.error(err);
                }
            }

            //build a list of all files in the staging folder
            this.loadStagingDirPaths(this.stagingPath);

            //convert source breakpoint paths to build paths
            if (this.launchArgs.sourceDirs) {
                let combinedSourceDirs = [];
                for (let dir of this.launchArgs.sourceDirs) {
                    combinedSourceDirs.push(dir);
                }

                // If we have component libraries we need to make sure we don't remove breakpoints from them by mistake
                if (this.launchArgs.componentLibraries) {
                    for (let library of this.launchArgs.componentLibraries as any) {
                        combinedSourceDirs.push(library.rootDir);
                    }
                }

                //clear any breakpoints that are out of scope
                this.removeOutOfScopeBreakpointPaths(combinedSourceDirs, this.launchArgs.rootDir);
                for (const sourceDir of this.launchArgs.sourceDirs) {
                    this.convertBreakpointPaths(sourceDir, this.launchArgs.rootDir);
                }
            }
            //add breakpoint lines to source files and then publish
            this.sendDebugLogLine('Adding stop statements for active breakpoints');
            await this.addBreakpointStatements(this.stagingPath);

            //convert source breakpoint paths to build paths
            if (this.launchArgs.sourceDirs) {
                for (const sourceDir of this.launchArgs.sourceDirs) {
                    this.convertBreakpointPaths(this.launchArgs.rootDir, sourceDir);
                }
            }

            //create zip package from staging folder
            this.sendDebugLogLine('Creating zip archive from project sources');
            await this.rokuDeploy.zipPackage(args as any);

            await this.prepareAndHostComponentLibraries(this.launchArgs.componentLibraries, this.launchArgs.componentLibrariesOutDir, this.launchArgs.componentLibrariesPort);

            this.sendDebugLogLine(`Connecting to Roku via telnet at ${args.host}`);

            //connect to the roku debug via telnet
            await this.connectRokuAdapter(args.host);

            await this.rokuAdapter.exitActiveBrightscriptDebugger();

            //pass the debug functions used to locate the client files and lines thought the adapter to the RendezvousTracker
            this.rokuAdapter.setRendezvousDebuggerFileConversionFunctions(
                (debuggerPath: string, lineNumber: number) => {
                    return this.convertDebuggerLineToClientLine(debuggerPath, lineNumber);
                },
                (debuggerPath: string) => {
                    return this.convertDebuggerPathToClient(debuggerPath);
                }
            );

            //pass the log level down thought the adapter to the RendezvousTracker
            this.rokuAdapter.setConsoleOutput(this.launchArgs.consoleOutput);

            //pass along the console output
            if (this.launchArgs.consoleOutput === 'full') {
                this.rokuAdapter.on('console-output', (data) => {
                    //forward the console output
                    this.sendEvent(new OutputEvent(data, 'stdout'));
                    this.sendEvent(new LogOutputEvent(data));
                });
            } else {
                this.rokuAdapter.on('unhandled-console-output', (data) => {
                    //forward the console output
                    this.sendEvent(new OutputEvent(data, 'stdout'));
                    this.sendEvent(new LogOutputEvent(data));
                });
            }

            // Send rendezvous events to the extension
            this.rokuAdapter.on('rendezvous-event', (output) => {
                this.sendEvent(new RendezvousEvent(output));
            });

            //listen for a closed connection (shut down when received)
            this.rokuAdapter.on('close', (reason = '') => {
                if (reason === 'compileErrors') {
                    error = new Error('compileErrors');
                } else {
                    error = new Error('Unable to connect to Roku. Is another device already connected?');
                }
            });

            //watch
            // disconnect = this.rokuAdapter.on('compile-errors', (compileErrors) => {
            this.rokuAdapter.on('compile-errors', (compileErrors) => {
                for (let compileError of compileErrors) {
                    compileError.lineNumber = this.convertDebuggerLineToClientLine(compileError.path, compileError.lineNumber);
                    compileError.path = this.convertDebuggerPathToClient(compileError.path);
                }

                this.sendEvent(new CompileFailureEvent(compileErrors));
                //stop the roku adapter and exit the channel
                this.rokuAdapter.destroy();
                this.rokuDeploy.pressHomeButton(this.launchArgs.host);
            });
            this.rokuAdapter.on('app-exit', async () => {
                if (this.launchArgs.stopDebuggerOnAppExit) {
                    const message = 'App exit event detected and launchArgs.stopDebuggerOnAppExit is true - shutting down debug session';
                    console.log(message);
                    this.sendEvent(new LogOutputEvent(message));
                    if (this.rokuAdapter) {
                        this.rokuAdapter.destroy();
                    }
                    //return to the home screen
                    await this.rokuDeploy.pressHomeButton(this.launchArgs.host);
                    this.shutdown();
                    disconnect();
                    this.sendEvent(new TerminatedEvent());
                } else {
                    const message = 'App exit detected; but launchArgs.stopDebuggerOnAppExit is set to false, so keeping debug session running.';
                    console.log(message);
                    this.sendEvent(new LogOutputEvent(message));
                }
            });

            //ignore the compile error failure from within the publish
            (args as any).failOnCompileError = false;
            //publish the package to the target Roku
            await this.rokuDeploy.publish(args as any);

            //tell the adapter adapter that the channel has been launched.
            await this.rokuAdapter.activate();

            if (!error) {
                if (this.rokuAdapter.connected) {
                    // Host connection was established before the main public process was completed
                    console.log(`deployed to Roku@${this.launchArgs.host}`);
                    this.sendResponse(response);
                } else {
                    // Main public process was completed but we are still waiting for a connection to the host
                    this.rokuAdapter.on('connected', (status) => {
                        if (status) {
                            console.log(`deployed to Roku@${this.launchArgs.host}`);
                            this.sendResponse(response);
                        }
                    });
                }
            } else {
                throw error;
            }
        } catch (e) {
            //if the message is anything other than compile errors, we want to display the error
            //TODO: look into the reason why we are getting the 'Invalid response code: 400' on compile errors
            if (e.message !== 'compileErrors' && e.message !== 'Invalid response code: 400') {
                //TODO make the debugger stop!
                this.sendDebugLogLine('Encountered an issue during the publish process');
                this.sendDebugLogLine(e.message);
                this.sendErrorResponse(response, -1, e.message);
            }
            this.shutdown();
            return;
        } finally {
            //disconnect the compile error watcher
            disconnect();
        }

        //at this point, the project has been deployed. If we need to use a deep link, launch it now.
        if (args.deepLinkUrl) {
            //wait until the first entry breakpoint has been hit
            await this.firstRunDeferred.promise;
            //if we are at a breakpoint, continue
            await this.rokuAdapter.continue();
            //kill the app on the roku
            await this.rokuDeploy.pressHomeButton(this.launchArgs.host);
            //send the deep link http request
            await new Promise((resolve, reject) => {
                request.post(this.launchArgs.deepLinkUrl, function(err, response) {
                    return err ? reject(err) : resolve(response);
                });
            });
        }
    }

    /**
     * Accepts custom events and requests from the extension
     * @param command name of the command to execute
     */
    protected customRequest(command: string) {
        if (command === 'rendezvous.clearHistory') {
            this.rokuAdapter.clearRendezvousHistory();
        }
    }

    /**
     * updates the staging manifest with the supplied bsConsts from the launch config
     * @param consts object of consts to be updated
     * @param fileContents
     */
    public async updateManifestBsConsts(consts: { [key: string]: boolean }, fileContents: string): Promise<string> {
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

    private componentLibraryPostfix: string = '__lib';

    protected async prepareAndHostComponentLibraries(componentLibraries, componentLibrariesOutDir: string, port: number) {
        if (componentLibraries && componentLibrariesOutDir) {
            this.componentLibrariesOutDir = componentLibrariesOutDir;
            this.componentLibrariesStagingDirPaths = [];
            let libraryNumber: number = 0;

            // #region Prepare the component libraries and create some name spacing for debugging
            for (const componentLibrary of componentLibraries as any) {
                libraryNumber++;
                componentLibrary.outDir = componentLibrariesOutDir;
                let stagingFolder = await this.rokuDeploy.prepublishToStaging(componentLibrary);

                // check the component library for any replaceable values used for auto naming from manifest values
                await this.processComponentLibraryForAutoNaming(componentLibrary, stagingFolder);

                let paths = glob.sync(path.join(stagingFolder, '**/*'));
                let pathDetails: object = {};

                // Add breakpoint lines to the staging files and before publishing
                this.sendDebugLogLine('Adding stop statements for active breakpoints in Component Libraries');
                this.convertBreakpointPaths(componentLibrary.rootDir, componentLibrary.rootDir);
                await this.addBreakpointStatements(stagingFolder, componentLibrary.rootDir);

                await Promise.all(paths.map(async (filePath) => {
                    //make the path relative (+1 for removing the slash)
                    let relativePath = filePath.substring(stagingFolder.length + 1);
                    let parsedPath = path.parse(relativePath);

                    if (parsedPath.ext) {
                        let originalRelativePath = relativePath;

                        if (parsedPath.ext === '.brs') {
                            // Create the new file name to be used
                            let newFileName: string = `${parsedPath.name}${this.componentLibraryPostfix}${libraryNumber}${parsedPath.ext}`;
                            relativePath = path.join(parsedPath.dir, newFileName);

                            // Update all the file name references in the library to the new file names
                            replaceInFile.sync({
                                files: [
                                    path.join(stagingFolder, '**/*.xml'),
                                    path.join(stagingFolder, '**/*.brs')
                                ],
                                from: (file) => new RegExp(parsedPath.base, 'gi'),
                                to: newFileName
                            });

                            // Rename the brs files to include the postfix name spacing tag
                            await fsExtra.move(filePath, path.join(stagingFolder, relativePath));
                        }

                        // Add to the map of original paths and the new paths
                        pathDetails[relativePath] = originalRelativePath;
                    }
                }));

                // push one file map object for each library we prepare
                this.componentLibrariesStagingDirPaths.push(pathDetails);
                await this.rokuDeploy.zipPackage(componentLibrary);
            }
            // #endregion

            // prepare static file hosting
            this.componentLibraryServer.startStaticFileHosting(this.componentLibrariesOutDir, port, (message) => { this.sendDebugLogLine(message); });
        }
    }

    /**
     * Takes a component Library and checks the outFile for replaceable values pulled from the libraries manifest
     * @param componentLibrary The library to check
     * @param stagingFolder staging folder of the component library to search for the manifest file
     */
    private async processComponentLibraryForAutoNaming(componentLibrary: { outFile: string }, stagingFolder: string) {
        let regexp = /\$\{([\w\d_]*)\}/;
        let renamingMatch;
        let manifestValues;

        // search the outFile for replaceable values such as ${title}
        while (renamingMatch = regexp.exec(componentLibrary.outFile)) {
            if (!manifestValues) {
                // The first time a value is found we need to get the manifest values
                let manifestPath = path.join(stagingFolder + '/', 'manifest');
                manifestValues = await util.convertManifestToObject(manifestPath);

                if (!manifestValues) {
                    throw new Error(`Cannot find manifest file at "${manifestPath}"\n\nCould not complete automatic component library naming.`);
                }
            }

            // replace the replaceable key with the manifest value
            let manifestVariableName = renamingMatch[1];
            let manifestVariableValue = manifestValues[manifestVariableName];
            if (manifestVariableValue) {
                componentLibrary.outFile = componentLibrary.outFile.replace(renamingMatch[0], manifestVariableValue);
            } else {
                throw new Error(`Cannot find manifest value:\n"${manifestVariableName}"\n\nCould not complete automatic component library naming.`);
            }
        }
    }

    private componentLibrariesStagingDirPaths: object[];

    protected sourceRequest(response: DebugProtocol.SourceResponse, args: DebugProtocol.SourceArguments) {
        this.log('sourceRequest');
        let old = this.sendResponse;
        this.sendResponse = function(...args) {
            old.apply(this, args);
            this.sendResponse = old;
        };
        super.sourceRequest(response, args);
    }

    protected removeOutOfScopeBreakpointPaths(sourcePaths: string[], toRootPath: string) {
        //convert paths to sourceDirs paths for any breakpoints set before this launch call
        if (sourcePaths) {
            for (let clientPath in this.breakpointsByClientPath) {
                let included = false;
                for (const fromRootPath of sourcePaths) {
                    // Roku is already case insensitive so lower the paths to address where Node on Windows can be inconsistent in what case builtin functions return for drive letters
                    if (pathIncludesCaseInsensitive(clientPath, fromRootPath + path.sep)) {
                        included = true;
                        break;
                    }
                }
                if (!included) {
                    delete this.breakpointsByClientPath[clientPath];
                }
            }
        }
    }

    protected convertBreakpointPaths(fromRootPath: string, toRootPath: string) {
        //convert paths to sourceDirs paths for any breakpoints set before this launch call

        if (fromRootPath && toRootPath) {
            for (let clientPath in this.breakpointsByClientPath) {
                // Roku is already case insensitive so lower the paths to address where Node on Windows can be inconsistent in what case builtin functions return for drive letters
                if (pathIncludesCaseInsensitive(clientPath, fromRootPath)) {
                    let debugClientPath = path.normalize(clientPath.replace(fromRootPath, toRootPath));
                    this.breakpointsByClientPath[debugClientPath] = this.getBreakpointsForClientPath(clientPath);

                    // Make sure the debugClientPath is not the same as the clientPath.
                    if (path.normalize(debugClientPath).toLowerCase() !== path.normalize(clientPath).toLowerCase()) {
                        this.deleteBreakpointsForClientPath(clientPath);
                    }
                }
            }
        }
    }

    protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments) {
        console.log('configurationDoneRequest');
    }

    public setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments) {
        let clientPath = path.normalize(args.source.path);
        //if we have a sourceDirs, convert the rootDir path to sourceDirs path
        if (this.launchArgs && this.launchArgs.sourceDirs) {
            let lastWorkingPath = '';
            for (const sourceDir of this.launchArgs.sourceDirs) {
                clientPath = clientPath.replace(this.launchArgs.rootDir, sourceDir);
                if (fsExtra.pathExistsSync(clientPath)) {
                    lastWorkingPath = clientPath;
                }
            }
            clientPath = lastWorkingPath;
        }
        let extension = path.extname(clientPath).toLowerCase();

        //only accept breakpoints from brightscript files
        if (extension === '.brs') {
            if (!this.launchRequestWasCalled) {
                //store the breakpoints indexed by clientPath
                this.breakpointsByClientPath[clientPath] = args.breakpoints;
                for (let b of args.breakpoints) {
                    (b as any).verified = true;
                }
            } else {
                //mark the breakpoints as verified or not based on the original breakpoints
                let verifiedBreakpoints = this.getBreakpointsForClientPath(clientPath);
                outer: for (let breakpoint of args.breakpoints) {
                    for (let verifiedBreakpoint of verifiedBreakpoints) {
                        if (breakpoint.line === verifiedBreakpoint.line) {
                            (breakpoint as any).verified = true;
                            continue outer;
                        }
                    }
                    (breakpoint as any).verified = false;
                }
            }
        } else {
            //mark every breakpoint as NOT verified
            for (let bp of args.breakpoints) {
                (bp as any).verified = false;
            }
        }

        response.body = {
            breakpoints: <any>args.breakpoints
        };
        this.sendResponse(response);
    }

    protected async exceptionInfoRequest(response: DebugProtocol.ExceptionInfoResponse, args: DebugProtocol.ExceptionInfoArguments) {
        this.log('exceptionInfoRequest');
    }

    protected async threadsRequest(response: DebugProtocol.ThreadsResponse) {
        this.log('threadsRequest');
        //wait for the roku adapter to load
        await this.getRokuAdapter();

        let threads = [];

        //only send the threads request if we are at the debugger prompt
        if (this.rokuAdapter.isAtDebuggerPrompt) {
            let rokuThreads = await this.rokuAdapter.getThreads();

            for (let thread of rokuThreads) {
                threads.push(
                    new Thread(thread.threadId, `Thread ${thread.threadId}`)
                );
            }
        } else {
            console.log('Skipped getting threads because the RokuAdapter is not accepting input at this time.');
        }

        response.body = {
            threads: threads
        };

        this.sendResponse(response);
    }

    protected async stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments) {
        this.log('stackTraceRequest');
        let frames = [];

        if (this.rokuAdapter.isAtDebuggerPrompt) {
            let stackTrace = await this.rokuAdapter.getStackTrace();

            for (let debugFrame of stackTrace) {

                let clientPath = this.convertDebuggerPathToClient(debugFrame.filePath);
                let clientLineNumber = this.convertDebuggerLineToClientLine(debugFrame.filePath, debugFrame.lineNumber);
                //the stacktrace returns function identifiers in all lower case. Try to get the actual case
                //load the contents of the file and get the correct casing for the function identifier
                try {
                    let fileContents = (await fsExtra.readFile(clientPath)).toString();
                    let match = new RegExp(`(?:sub|function)\\s+(${debugFrame.functionIdentifier})`, 'i').exec(fileContents);
                    if (match) {
                        debugFrame.functionIdentifier = match[1];
                    }
                } catch (e) {
                }

                let frame = new StackFrame(
                    debugFrame.frameId,
                    `${debugFrame.functionIdentifier}`,
                    new Source(path.basename(clientPath), clientPath),
                    clientLineNumber,
                    1
                );
                frames.push(frame);
            }
        } else {
            console.log('Skipped calculating stacktrace because the RokuAdapter is not accepting input at this time');
        }
        response.body = {
            stackFrames: frames,
            totalFrames: frames.length
        };
        this.sendResponse(response);
    }

    protected async scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments) {
        const scopes = new Array<Scope>();
        scopes.push(new Scope('Local', this.variableHandles.create('local'), true));
        response.body = {
            scopes: scopes
        };
        this.sendResponse(response);
    }

    protected async continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments) {
        this.log('continueRequest');
        await this.rokuAdapter.continue();
        this.sendResponse(response);
    }

    protected async pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments) {
        this.log('pauseRequest');
        await this.rokuAdapter.pause();
        this.sendResponse(response);
    }

    protected reverseContinueRequest(response: DebugProtocol.ReverseContinueResponse, args: DebugProtocol.ReverseContinueArguments) {
        this.log('reverseContinueRequest');
        this.sendResponse(response);
    }

    /**
     * Clicked the "Step Over" button
     * @param response
     * @param args
     */
    protected async nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments) {
        this.log('nextRequest');
        await this.rokuAdapter.stepOver();
        this.sendResponse(response);
    }

    protected async stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments) {
        this.log('stepInRequest');
        await this.rokuAdapter.stepInto();
        this.sendResponse(response);
    }

    protected async stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments) {
        this.log('stepOutRequest');
        await this.rokuAdapter.stepOut();
        this.sendResponse(response);
    }

    protected stepBackRequest(response: DebugProtocol.StepBackResponse, args: DebugProtocol.StepBackArguments) {
        this.log('stepBackRequest');

        this.sendResponse(response);
    }

    public async variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments) {
        this.log(`variablesRequest: ${JSON.stringify(args)}`);

        let childVariables: AugmentedVariable[] = [];
        //wait for any `evaluate` commands to finish so we have a higher likelyhood of being at a debugger prompt
        await this.evaluateRequestPromise;
        if (this.rokuAdapter.isAtDebuggerPrompt) {
            const reference = this.variableHandles.get(args.variablesReference);
            if (reference) {
                if (this.launchArgs.enableVariablesPanel) {
                    const vars = await this.rokuAdapter.getScopeVariables(reference);

                    for (const varName of vars) {
                        let result = await this.rokuAdapter.getVariable(varName);
                        let tempVar = this.getVariableFromResult(result);
                        childVariables.push(tempVar);
                    }
                } else {
                    childVariables.push(new Variable('variables disabled by launch.json setting', 'enableVariablesPanel: false'));
                }
            } else {
                //find the variable with this reference
                let v = this.variables[args.variablesReference];
                //query for child vars if we haven't done it yet.
                if (v.childVariables.length === 0) {
                    let result = await this.rokuAdapter.getVariable(v.evaluateName);
                    let tempVar = this.getVariableFromResult(result);
                    v.childVariables = tempVar.childVariables;
                }
                childVariables = v.childVariables;
            }

            //if the variable is an array, send only the requested range
            if (Array.isArray(childVariables) && args.filter === 'indexed') {
                //only send the variable range requested by the debugger
                childVariables = childVariables.slice(args.start, args.start + args.count);
            }
            response.body = {
                variables: childVariables
            };
        } else {
            console.log('Skipped getting variables because the RokuAdapter is not accepting input at this time');
        }
        this.sendResponse(response);
    }

    private evaluateRequestPromise = Promise.resolve();

    public async evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments) {
        let deferred = defer<any>();

        this.evaluateRequestPromise = this.evaluateRequestPromise.then(() => {
            return deferred.promise;
        });
        try {
            if (this.rokuAdapter.isAtDebuggerPrompt) {
                if (['hover', 'watch'].indexOf(args.context) > -1 || args.expression.toLowerCase().trim().startsWith('print ')) {
                    //if this command has the word print in front of it, remove that word
                    let expression = args.expression.replace(/^print/i, '').trim();
                    let refId = this.getEvaluateRefId(expression);
                    let v: DebugProtocol.Variable;
                    //if we already looked this item up, return it
                    if (this.variables[refId]) {
                        v = this.variables[refId];
                    } else {
                        let result = await this.rokuAdapter.getVariable(expression);
                        v = this.getVariableFromResult(result);
                        //TODO - testing something, remove later
                        (v as any).request_seq = response.request_seq;
                    }
                    response.body = {
                        result: v.value,
                        variablesReference: v.variablesReference,
                        namedVariables: v.namedVariables || 0,
                        indexedVariables: v.indexedVariables || 0
                    };
                } else if (args.context === 'repl') {
                    //exclude any of the standard interaction commands so we don't screw up the IDE's debugger state
                    let excludedExpressions = ['cont', 'c', 'down', 'd', 'exit', 'over', 'o', 'out', 'step', 's', 't', 'thread', 'th', 'up', 'u'];
                    if (excludedExpressions.indexOf(args.expression.toLowerCase().trim()) > -1) {
                        this.sendEvent(new OutputEvent(`Expression '${args.expression}' not permitted when debugging in VSCode`, 'stdout'));
                    } else {
                        let result = await this.rokuAdapter.evaluate(args.expression);
                        response.body = <any>{
                            result: result
                        };
                        // //print the output to the screen
                        // this.sendEvent(new OutputEvent(result, 'stdout'));
                    }
                }
            } else {
                console.log('Skipped evaluate request because RokuAdapter is not accepting requests at this time');
            }
        } finally {
            deferred.resolve();
        }
        this.sendResponse(response);
    }

    private loadStagingDirPaths(stagingDir: string) {
        if (!this.stagingDirPaths) {
            let paths = glob.sync(path.join(stagingDir, '**/*'));
            this.stagingDirPaths = [];
            for (let filePath of paths) {
                //make the path relative (+1 for removing the slash)
                let relativePath = filePath.substring(stagingDir.length + 1);
                this.stagingDirPaths.push(relativePath);
            }
        }
        return this.stagingDirPaths;
    }

    private stagingDirPaths: string[];

    /**
     * Given a path from the debugger, convert it to a client path
     * @param debuggerPath
     */
    protected convertDebuggerPathToClient(debuggerPath: string) {
        let fullPath = false;
        let rootDir = this.launchArgs.sourceDirs ? this.launchArgs.sourceDirs : [this.launchArgs.rootDir];

        //remove preceding pkg:
        if (debuggerPath.toLowerCase().indexOf('pkg:') === 0) {
            debuggerPath = debuggerPath.substring(4);
            fullPath = true;
        }

        if (debuggerPath.includes(this.componentLibraryPostfix)) {
            //remove preceding slash
            if (debuggerPath.toLowerCase().indexOf('/') === 0) {
                debuggerPath = debuggerPath.substring(1);
            }

            debuggerPath = this.removeFileTruncation(debuggerPath);

            //find any files from the outDir that end the same as this file
            let results: string[] = [];
            let libTagIndex = debuggerPath.indexOf(this.componentLibraryPostfix);
            let libIndex = parseInt(debuggerPath.substr(libTagIndex + this.componentLibraryPostfix.length, debuggerPath.indexOf('.brs') - libTagIndex - 5)) - 1;
            let componentLibraryPaths = this.componentLibrariesStagingDirPaths[libIndex];
            let componentLibrary: any = this.launchArgs.componentLibraries[libIndex];
            // Update the root dir
            rootDir = [componentLibrary.rootDir];

            Object.keys(componentLibraryPaths).forEach((key, index) => {
                //if the staging path looks like the debugger path, keep it for now
                if (this.isFileAPossibleMatch(key, debuggerPath)) {
                    results.push(componentLibraryPaths[key]);
                }
            });

            if (results.length > 0) {
                //a wrong file, which has output is more useful than nothing!
                debuggerPath = results[0];
            } else {
                //we found multiple files with the exact same path (unlikely)...nothing we can do about it.
            }
        } else {
            if (!fullPath) {
                //the debugger path was truncated, so try and map it to a file in the outdir
                debuggerPath = this.removeFileTruncation(debuggerPath);

                //find any files from the outDir that end the same as this file
                let results: string[] = [];

                for (let stagingPath of this.stagingDirPaths) {
                    //if the staging path looks like the debugger path, keep it for now
                    if (this.isFileAPossibleMatch(stagingPath, debuggerPath)) {
                        results.push(stagingPath);
                    }
                }

                if (results.length > 0) {
                    //a wrong file, which has output is more useful than nothing!
                    debuggerPath = results[0];
                } else {
                    //we found multiple files with the exact same path (unlikely)...nothing we can do about it.
                }
            }
        }

        //use sourceDirs if provided, or rootDir if not provided.
        let lastExistingPath = '';
        for (const sourceDir of rootDir) {
            let clientPath = path.normalize(path.join(sourceDir, debuggerPath));
            if (fsExtra.pathExistsSync(clientPath)) {
                lastExistingPath = clientPath;
            }
        }
        return lastExistingPath;
    }

    private removeFileTruncation(filePath) {
        return (filePath.indexOf('...') === 0) ? filePath.substring(3) : filePath;
    }

    private isFileAPossibleMatch(stagingPath: string, testPath: string) {
        let idx = stagingPath.indexOf(testPath);
        //if the staging path looks like the debugger path, keep it for now
        return (idx > -1 && stagingPath.endsWith(testPath));
    }

    /**
     * Called when the host stops debugging
     * @param response
     * @param args
     */
    protected async disconnectRequest(response: any, args: any) {
        if (this.rokuAdapter) {
            this.rokuAdapter.destroy();
        }
        //return to the home screen
        await this.rokuDeploy.pressHomeButton(this.launchArgs.host);
        this.sendResponse(response);
    }

    /**
     * Creates and registers the main events for the RokuAdapter
     * @param host ip address to connect to
     */
    private async connectRokuAdapter(host: string) {
        //register events
        this.rokuAdapter = new RokuAdapter(
            host,
            this.launchArgs.enableDebuggerAutoRecovery
        );

        this.rokuAdapter.on('start', async () => {
            if (!this.firstRunDeferred.isCompleted) {
                this.firstRunDeferred.resolve();
            }
        });

        //when the debugger suspends (pauses for debugger input)
        this.rokuAdapter.on('suspend', async () => {
            let threads = await this.rokuAdapter.getThreads();
            let threadId = threads[0].threadId;

            this.clearState();
            let exceptionText = '';
            const event: StoppedEvent = new StoppedEvent(StoppedEventReason.breakpoint, threadId, exceptionText);
            (event.body as any).allThreadsStopped = false;
            this.sendEvent(event);
        });

        //anytime the adapter encounters an exception on the roku,
        this.rokuAdapter.on('runtime-error', async (exception) => {
            let threads = await (await this.getRokuAdapter()).getThreads();
            let threadId = threads[0].threadId;
            this.sendEvent(new StoppedEvent('exception', threadId, exception.message));
        });

        // If the roku says it can't continue, we are no longer able to debug, so kill the debug session
        this.rokuAdapter.on('cannot-continue', () => {
            this.sendEvent(new TerminatedEvent());
        });
        //make the connection
        await this.rokuAdapter.connect();
        this.rokuAdapterDeferred.resolve(this.rokuAdapter);
    }

    /**
     * Write "stop" lines into source code of each file for each breakpoint
     * @param stagingPath
     * @param basePath Optional override to the project base path. Used for things like component libraries that may be parallel to the project
     */
    public async addBreakpointStatements(stagingPath: string, basePath: string = this.baseProjectPath) {
        let promises = [];
        let addBreakpointsToFile = async (clientPath, basePath) => {
            let breakpoints = this.getBreakpointsForClientPath(clientPath);
            let stagingFilePath: string;
            //find the manifest file for the file
            clientPath = path.normalize(clientPath);
            // normalize the base path to remove things like ..
            basePath = path.normalize(basePath);

            // Make sure the breakpoint to be added is for this base path
            if (pathIncludesCaseInsensitive(clientPath, basePath)) {
                let relativeClientPath = replaceCaseInsensitive(clientPath.toString(), basePath, '');
                stagingFilePath = path.join(stagingPath, relativeClientPath);
                //load the file as a string
                let fileContents = (await fsExtra.readFile(stagingFilePath)).toString();
                //split the file by newline
                let lines = eol.split(fileContents);

                let bpIndex = 0;
                for (let breakpoint of breakpoints) {
                    bpIndex++;

                    //since arrays are indexed by zero, but the breakpoint lines are indexed by 1, we need to subtract 1 from the breakpoint line number
                    let lineIndex = breakpoint.line - 1;
                    let line = lines[lineIndex];

                    if (breakpoint.condition) {
                        // add a conditional STOP statement right before this line
                        lines[lineIndex] = `if ${breakpoint.condition} then : STOP : end if\n${line} `;
                    } else if (breakpoint.hitCondition) {
                        let hitCondition = parseInt(breakpoint.hitCondition);

                        if (isNaN(hitCondition) || hitCondition === 0) {
                            // add a STOP statement right before this line
                            lines[lineIndex] = `STOP\n${line} `;
                        } else {

                            let prefix = `m.vscode_bp`;
                            let bpName = `bp${bpIndex}`;
                            let checkHits = `if ${prefix}.${bpName} >= ${hitCondition} then STOP`;
                            let increment = `${prefix}.${bpName} ++`;

                            // Create the BrightScript code required to track the number of executions
                            let trackingExpression = `
                                if Invalid = ${prefix} OR Invalid = ${prefix}.${bpName} then
                                    if Invalid = ${prefix} then
                                        ${prefix} = {${bpName}: 0}
                                    else
                                        ${prefix}.${bpName} = 0
                                else
                                    ${increment} : ${checkHits}
                            `;
                            //coerce the expression into single-line
                            trackingExpression = trackingExpression.replace(/\n/gi, '').replace(/\s+/g, ' ').trim();
                            // Add the tracking expression right before this line
                            lines[lineIndex] = `${trackingExpression}\n${line} `;
                        }
                    } else if (breakpoint.logMessage) {
                        let logMessage = breakpoint.logMessage;
                        //wrap the log message in quotes
                        logMessage = `"${logMessage}"`;
                        let expressionsCheck = /\{(.*?)\}/g;
                        let match;

                        // Get all the value to evaluate as expressions
                        while (match = expressionsCheck.exec(logMessage)) {
                            logMessage = logMessage.replace(match[0], `"; ${match[1]};"`);
                        }

                        // add a PRINT statement right before this line with the formated log message
                        lines[lineIndex] = `PRINT ${logMessage}\n${line} `;
                    } else {
                        // add a STOP statement right before this line
                        lines[lineIndex] = `STOP\n${line} `;
                    }
                }
                fileContents = lines.join('\n');
                await fsExtra.writeFile(stagingFilePath, fileContents);
            }
        };

        //add the entry breakpoint if stopOnEntry is true
        if (this.launchArgs.stopOnEntry) {
            await this.addEntryBreakpoint();
        }

        //add breakpoints to each client file
        for (let clientPath in this.breakpointsByClientPath) {
            promises.push(addBreakpointsToFile(clientPath, basePath));
        }
        await Promise.all(promises);
    }

    /**
     * Will search the project files for the comment "' vscode_rale_tracker_entry" and replace it with the code needed to start the TrackerTask.
     * @param stagingPath
     */
    public async injectRaleTrackerTaskCode(stagingPath: string) {
        // Search for the tracker task entry injection point
        let trackerEntryTerm = `('\\s*vscode_rale_tracker_entry[^\\S\\r\\n]*)`;
        let results = Object.assign(
            {},
            await findInFiles.find({ term: trackerEntryTerm, flags: 'ig' }, stagingPath, /.*\.brs/),
            await findInFiles.find({ term: trackerEntryTerm, flags: 'ig' }, stagingPath, /.*\.xml/)
        );

        let keys = Object.keys(results);
        if (keys.length === 0) {
            // Do not throw an error as we don't want to prevent the user from launching the channel
            // just because they don't have a local version of the TrackerTask.
            this.sendDebugLogLine('WARNING: Unable to find an entry point for Tracker Task.');
            this.sendDebugLogLine('Please make sure that you have the following comment in your BrightScript project: "\' vscode_rale_tracker_entry"');
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
    }

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
            throw new Error('Unable to find an entry point. Please make sure that you have a RunUserInterface or Main sub/function declared in your BrightScript project');
        }

        //throw out any entry points from files not included in this project's `files` array
        let files = await this.rokuDeploy.getFilePaths(this.launchArgs.files, this.stagingPath, this.launchArgs.rootDir);
        let paths = files.map((x) => x.src);
        keys = keys.filter((x) => paths.indexOf(x) > -1);

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
            path: entryPath,
            contents: entryLineContents,
            lineNumber: lineNumber
        };
    }

    private entryBreakpoint: DebugProtocol.SourceBreakpoint;
    private async addEntryBreakpoint() {
        let entryPoint = await this.findEntryPoint(this.baseProjectPath);

        let entryBreakpoint = {
            verified: true,
            //create a breakpoint on the line BELOW this location, which is the first line of the program
            line: entryPoint.lineNumber + 1,
            id: this.breakpointIdCounter++,
            isEntryBreakpoint: true
        };
        this.entryBreakpoint = <any>entryBreakpoint;

        //put this breakpoint into the list of breakpoints, in order
        let breakpoints = this.getBreakpointsForClientPath(entryPoint.path);
        breakpoints.push(entryBreakpoint);
        //sort the breakpoints in order of line number
        breakpoints.sort((a, b) => {
            if (a.line > b.line) {
                return 1;
            } else if (a.line < b.line) {
                return -1;
            } else {
                return 0;
            }
        });

        //if the user put a breakpoint on the first line of their program, we want to keep THEIR breakpoint, not the entry breakpoint
        let index = breakpoints.indexOf(this.entryBreakpoint);
        let bpBefore = breakpoints[index - 1];
        let bpAfter = breakpoints[index + 1];
        if (
            (bpBefore && bpBefore.line === this.entryBreakpoint.line) ||
            (bpAfter && bpAfter.line === this.entryBreakpoint.line)
        ) {
            breakpoints.splice(index, 1);
            this.entryBreakpoint = undefined;
        }
    }

    /**
     * File paths can be different casing sometimes,
     * so find the data from `breakpointsByClientPath` case insensitive
     */
    public getBreakpointsForClientPath(clientPath: string) {
        for (let key in this.breakpointsByClientPath) {
            if (clientPath.toLowerCase() === key.toLowerCase()) {
                return this.breakpointsByClientPath[key];
            }
        }
        //create a new array and return it
        return this.breakpointsByClientPath[clientPath] = [];
    }

    /**
     * File paths can be different casing sometimes,
     * so delete from `breakpointsByClientPath` case-insensitive
     */
    public deleteBreakpointsForClientPath(clientPath: string) {
        for (let key in this.breakpointsByClientPath) {
            if (clientPath.toLowerCase() === key.toLowerCase()) {
                delete this.breakpointsByClientPath[key];
            }
        }
    }

    /**
     * Given a full path to a file, walk up the tree until we have found the base project path (full path to the folder containing the manifest file)
     * @param filePath
     */
    // private async getBaseProjectPath(filePath: string) {
    // 	//try walking up 10 levels. If we haven't found it by then, there is nothing we can do.
    // 	let folderPath = filePath;
    // 	for (let i = 0; i < 10; i++) {
    // 		folderPath = path.dirname(folderPath);
    // 		let files = await Q.nfcall(glob, path.join(folderPath, 'manifest'));
    // 		if (files.length === 1) {
    // 			let dir = path.dirname(files[0]);
    // 			return path.normalize(dir);
    // 		}
    // 	}
    // 	throw new Error('Unable to find base project path');
    // }

    /**
     * We set "breakpoints" by inserting 'STOP' lines into the code. So to translate the debugger lines back to client lines,
     * we need to subtract those 'STOP' lines from the line count
     * @param debuggerPath
     * @param debuggerLineNumber
     */
    private convertDebuggerLineToClientLine(debuggerPath: string, debuggerLineNumber: number) {
        let clientPath = this.convertDebuggerPathToClient(debuggerPath);
        let breakpoints = this.getBreakpointsForClientPath(clientPath);

        let resultLineNumber = debuggerLineNumber;
        for (let breakpoint of breakpoints) {
            if (breakpoint.line <= resultLineNumber) {
                resultLineNumber--;
            } else {
                break;
            }
        }
        return resultLineNumber;
    }

    private log(...args) {
        console.log.apply(console, args);
    }

    private sendDebugLogLine(message: string) {
        this.sendEvent(new LogOutputEvent(`debugger: ${message}`));
    }

    private getVariableFromResult(result: EvaluateContainer) {
        let v: AugmentedVariable;
        if (result.highLevelType === 'primative' || result.highLevelType === 'uninitialized') {
            v = new Variable(result.name, `${result.value}`);
        } else if (result.highLevelType === 'array') {
            let refId = this.getEvaluateRefId(result.evaluateName);
            v = new Variable(result.name, result.type, refId, result.children.length, 0);
            this.variables[refId] = v;
        } else if (result.highLevelType === 'object') {
            let refId = this.getEvaluateRefId(result.evaluateName);
            v = new Variable(result.name, result.type, refId, 0, result.children.length);
            this.variables[refId] = v;
        } else if (result.highLevelType === 'function') {
            v = new Variable(result.name, result.value);
        }
        v.evaluateName = result.evaluateName;
        if (result.children) {
            let childVariables = [];
            for (let childContainer of result.children) {
                let childVar = this.getVariableFromResult(childContainer);
                childVariables.push(childVar);
            }
            v.childVariables = childVariables;
        }
        return v;
    }

    private getEvaluateRefId(expression: string) {
        if (!this.evaluateRefIdLookup[expression]) {
            this.evaluateRefIdLookup[expression] = this.evaluateRefIdCounter++;
        }
        return this.evaluateRefIdLookup[expression];
    }

    private clearState() {
        //erase all cached variables
        this.variables = {};
    }

}

/**
 * This interface should always match the schema found in the mock-debug extension manifest.
 */
interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
    /**
     * The host or ip address for the target Roku
     */
    host: string;
    /**
     * The password for the developer page on the target Roku
     */
    password: string;
    /**
     * The root directory that contains your Roku project. This path should point to the folder containing your manifest file
     */
    rootDir: string;
    /**
     * If you have a build system, rootDir will point to the build output folder, and this path should point to the actual source folder
     * so that breakpoints can be set in the source files when debugging. In order for this to work, your build process cannot change
     * line offsets between source files and built files, otherwise debugger lines will be out of sync.
     * @deprecated Use sourceDirs instead
     */
    debugRootDir: string;
    /**
     * If you have a build system, rootDir will point to the build output folder, and this path should point to the actual source folders
     * so that breakpoints can be set in the source files when debugging. In order for this to work, your build process cannot change
     * line offsets between source files and built files, otherwise debugger lines will be out of sync.
     */
    sourceDirs: string[];
    /**
     * An object of bs_const values to be updated in the manifest before side loading.
     */
    bsConst?: { [key: string]: boolean };
    /**
     * Port to access component libraries.
     */
    componentLibrariesPort: number;
    /**
     * Output folder the component libraries will be hosted in.
     */
    componentLibrariesOutDir: string;
    /**
     * An array of file path sets. One for each component library.
     * Each index is an array of file paths, file globs, or {src:string;dest:string} objects that will be copied into the hosted component library.
     * This will override the defaults, so if specified, you must provide ALL files. See https://npmjs.com/roku-deploy for examples. You must specify a componentLibrariesOutDir to use this.
     */
    componentLibraries: [];
    /**
     * The folder where the output files are places during the packaging process
     */
    outDir?: string;
    /**
     * If true, stop at the first executable line of the program
     */
    stopOnEntry: boolean;
    /**
     * Determines which console output event to listen for.
     * 'full' is every console message (including the ones from the adapter).
     * 'normal' excludes output initiated by the adapter and rendezvous logs if enabled on the device.
     */
    consoleOutput: 'full' | 'normal';
    /**
     * If specified, the debug session will start the roku app using the deep link
     */
    deepLinkUrl?: string;
    /*
     * Enables automatic population of the debug variable panel on a breakpoint or runtime errors.
     */
    enableVariablesPanel: boolean;
    /**
     * If true, will attempt to skip false breakpoints created by the micro debugger, which are particularly prevalent for SG apps with multiple run loops.
     */
    enableDebuggerAutoRecovery: boolean;

    /**
     * If true, will terminate the debug session if app exit is detected. This currently relies on 9.1+ launch beacon notifications, so will not work on a pre 9.1 device.
     */
    stopDebuggerOnAppExit: boolean;

    /**
     * Will inject the Roku Advanced Layout Editor(RALE) TrackerTask into your channel if one is defined in your user settings.
     */
    injectRaleTrackerTask: boolean;
    /**
     * This is an absolute path to the TrackerTask.xml file to be injected into your Roku channel during a debug session.
     */
    trackerTaskFileLocation: string;

    /**
     * The list of files that should be bundled during a debug session
     */
    files?: FilesType[];
}

interface AugmentedVariable extends DebugProtocol.Variable {
    childVariables?: AugmentedVariable[];
}

enum StoppedEventReason {
    step = 'step',
    breakpoint = 'breakpoint',
    exception = 'exception',
    pause = 'pause',
    entry = 'entry'
}

export function defer<T>() {
    let resolve: (value?: T | PromiseLike<T>) => void;
    let reject: (reason?: any) => void;
    let promise = new Promise<T>((resolveValue, rejectValue) => {
        resolve = resolveValue;
        reject = rejectValue;
    });
    return {
        promise: promise,
        resolve: function(value?: T | PromiseLike<T>) {
            if (!this.isResolved) {
                this.isResolved = true;
                resolve(value);
                resolve = undefined;
            } else {
                throw new Error('Already completed');
            }
        },
        reject: function(reason?: any) {
            if (!this.isCompleted) {
                this.isRejected = true;
                reject(reason);
                reject = undefined;
            } else {
                throw new Error('Already completed');
            }
        },
        isResolved: false,
        isRejected: false,
        get isCompleted() {
            return this.isResolved || this.isRejected;
        }
    };
}

/**
 * Determines if the `subject` path includes `search` path, with case sensitive comparison
 * @param subject
 * @param search
 */
export function pathIncludesCaseInsensitive(subject: string, search: string) {
    if (!subject || !search) {
        return false;
    }
    return path.normalize(subject.toLowerCase()).indexOf(path.normalize(search.toLowerCase())) > -1;
}

export function replaceCaseInsensitive(subject: string, search: string, replacement: string) {
    let idx = subject.toLowerCase().indexOf(search.toLowerCase());
    if (idx > -1) {
        let result = subject.substring(0, idx) + replacement + subject.substring(idx + search.length);
        return result;
    } else {
        return subject;
    }
}
