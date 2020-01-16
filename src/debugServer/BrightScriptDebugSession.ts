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
import { ComponentLibraryServer } from '../ComponentLibraryServer';
import { ComponentLibraryConfig } from '../DebugConfigurationProvider';
import { RendezvousHistory } from '../RendezvousTracker';
import {
    EvaluateContainer,
    RokuAdapter
} from '../RokuAdapter';
import { util } from '../util';
import { BreakpointManager } from './BreakpointManager';
import { fileUtils } from './FileUtils';
import { SourceLocation, SourceLocator } from './SourceLocator';
import { ProjectManager, Project, ComponentLibraryProject, componentLibraryPostfix } from './ProjectManager';
import { standardizePath as s } from './FileUtils';

export class BrightScriptDebugSession extends DebugSession {
    public constructor() {
        super();
        this.setDebuggerLinesStartAt1(true);
        this.setDebuggerColumnsStartAt1(true);
    }

    //set imports as class properties so they can be spied upon during testing
    public rokuDeploy = require('roku-deploy') as RokuDeploy;

    /**
     * A class that keeps track of all the breakpoints for a debug session.
     * It needs to be notified of any changes in breakpoints
     */
    private breakpointManager = new BreakpointManager();

    private componentLibraryServer = new ComponentLibraryServer();

    private rokuAdapterDeferred = defer<RokuAdapter>();
    /**
     * A promise that is resolved whenever the app has started running for the first time
     */
    private firstRunDeferred = defer<void>();

    /**
     * A map of breakpoints, keyed by the path to the source file that contains the breakpoints
     */
    private breakpointsBySourcePath: { [clientPath: string]: DebugProtocol.SourceBreakpoint[] } = {};
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
    public stagingFolderPath: string;

    public launchRequestWasCalled = false;

    public projectManager = new ProjectManager();

    public async launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments) {
        this.launchArgs = args;

        this.launchRequestWasCalled = true;
        let disconnect = () => {
        };
        this.sendEvent(new LaunchStartEvent(args));

        let error: Error;
        this.log('Packaging and deploying to roku');
        try {
            //add the main project
            this.projectManager.mainProject = (
                new Project({
                    rootDir: this.launchArgs.rootDir,
                    files: this.launchArgs.files,
                    outDir: this.launchArgs.outDir,
                    sourceDirs: this.launchArgs.sourceDirs,
                    bsConst: this.launchArgs.bsConst,
                    injectRaleTrackerTask: this.launchArgs.injectRaleTrackerTask,
                    trackerTaskFileLocation: this.launchArgs.trackerTaskFileLocation
                })
            );

            this.sendDebugLogLine('Moving selected files to staging area');
            await this.projectManager.mainProject.stage();

            //add the entry breakpoint if stopOnEntry is true
            if (this.launchArgs.stopOnEntry) {
                await this.breakpointManager.registerEntryBreakpoint(this.stagingFolderPath);
            }

            //add breakpoint lines to source files and then publish
            this.sendDebugLogLine('Adding stop statements for active breakpoints');

            //write all `stop` statements to the files in the staging folder
            await this.breakpointManager.writeBreakpointsForProject(this.projectManager.mainProject);

            //create zip package from staging folder
            this.sendDebugLogLine('Creating zip archive from project sources');
            await this.projectManager.mainProject.zipPackage({ retainStagingFolder: true });

            await this.prepareAndHostComponentLibraries(this.launchArgs.componentLibraries, this.launchArgs.componentLibrariesPort);

            this.sendDebugLogLine(`Connecting to Roku via telnet at ${args.host}`);

            //connect to the roku debug via telnet
            await this.connectRokuAdapter(args.host);

            await this.rokuAdapter.exitActiveBrightscriptDebugger();

            //pass the debug functions used to locate the client files and lines thought the adapter to the RendezvousTracker
            this.rokuAdapter.registerSourceLocator(async (debuggerPath: string, lineNumber: number) => {
                return await this.getSourceLocation(debuggerPath, lineNumber);
            });

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
            this.rokuAdapter.on('compile-errors', async (compileErrors) => {
                for (let compileError of compileErrors) {
                    let sourceLocation = await this.getSourceLocation(compileError.path, compileError.lineNumber);
                    compileError.path = sourceLocation.filePath;
                    compileError.lineNumber = sourceLocation.lineNumber;
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
     * Called when the debugger is terminated
     */
    public shutdown() {
        //if configured, delete the staging directory
        if (!this.launchArgs.retainStagingFolder) {
            try {
                fsExtra.removeSync(this.stagingFolderPath);
            } catch (e) {
                console.log('Error removing staging directory', e);
            }
        }
        super.shutdown();
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
     * Stores the path to the staging folder for each component library
     */
    protected async prepareAndHostComponentLibraries(componentLibraries: ComponentLibraryConfig[], port: number) {
        var componentLibrariesOutDir = s`${this.launchArgs.outDir}/component-libraries`;
        //make sure this folder exists (and is empty)
        await fsExtra.ensureDir(componentLibrariesOutDir);
        await fsExtra.emptyDir(componentLibrariesOutDir);

        if (componentLibraries) {
            //create a ComponentLibraryProject for each component library
            for (let libraryIndex = 0; libraryIndex < componentLibraries.length; libraryIndex++) {
                let componentLibrary = componentLibraries[libraryIndex];

                this.projectManager.componentLibraryProjects.push(
                    new ComponentLibraryProject({
                        rootDir: componentLibrary.rootDir,
                        files: componentLibrary.files,
                        outDir: componentLibrariesOutDir,
                        outFile: componentLibrary.outFile,
                        sourceDirs: componentLibrary.sourceDirs,
                        bsConst: componentLibrary.bsConst,
                        injectRaleTrackerTask: componentLibrary.injectRaleTrackerTask,
                        trackerTaskFileLocation: componentLibrary.trackerTaskFileLocation,
                        libraryIndex: libraryIndex
                    })
                );
            }

            //prepare all of the libraries in parallel
            var compLibPromises = this.projectManager.componentLibraryProjects.map(async (compLibProject) => {

                await compLibProject.stage();

                // Add breakpoint lines to the staging files and before publishing
                this.sendDebugLogLine('Adding stop statements for active breakpoints in Component Libraries');

                //write the `stop` statements to every file that has breakpoints
                await this.breakpointManager.writeBreakpointsForProject(compLibProject);

                compLibProject.postfixFiles();

                await compLibProject.zipPackage({ retainStagingFolder: true });
            });
        }

        // prepare static file hosting
        var hostingPromise = this.componentLibraryServer.startStaticFileHosting(componentLibrariesOutDir, port, (message) => {
            this.sendDebugLogLine(message);
        });

        //wait for all component libaries to finish building, and the file hosting to start up
        await Promise.all([
            ...compLibPromises,
            hostingPromise
        ]);
    }

    protected sourceRequest(response: DebugProtocol.SourceResponse, args: DebugProtocol.SourceArguments) {
        this.log('sourceRequest');
        let old = this.sendResponse;
        this.sendResponse = function(...args) {
            old.apply(this, args);
            this.sendResponse = old;
        };
        super.sourceRequest(response, args);
    }

    protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments) {
        console.log('configurationDoneRequest');
    }

    /**
     * Called every time a breakpoint is created, modified, or deleted, for each file. This receives the entire list of breakpoints every time.
     */
    public setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments) {
        let sanitizedBreakpoints = this.breakpointManager.setBreakpointsForFile(args.source.path, args.breakpoints);

        response.body = {
            breakpoints: sanitizedBreakpoints
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

    /**
     * The stacktrace sent by Roku forces all BrightScript function names to lower case.
     * This function will scan the source file, and attempt to find the exact casing from the function definition.
     * Also, this function caches results, so it should be faster than the previous implementation
     * which read the source file from the file system on each call
     */
    private async getCorrectFunctionNameCase(sourceFilePath: string, functionName: string) {
        let lowerSourceFilePath = sourceFilePath.toLowerCase();
        let lowerFunctionName = functionName.toLowerCase();
        //create the lookup if it doesn't exist
        if (!this.functionNameCaseLookup[lowerSourceFilePath]) {
            this.functionNameCaseLookup[lowerSourceFilePath] = {};

            let fileContents = (await fsExtra.readFile(sourceFilePath)).toString();
            //read the file contents
            let regexp = /^\s*(?:sub|function)\s+([a-z0-9_]+)/gim;
            let match: RegExpMatchArray;

            //create a cache of all function names in this file
            while (match = regexp.exec(fileContents)) {
                let correctFunctionName = match[1];
                this.functionNameCaseLookup[lowerSourceFilePath][correctFunctionName.toLowerCase()] = correctFunctionName;
            }
        }
        return this.functionNameCaseLookup[lowerSourceFilePath][lowerFunctionName];
    }
    private functionNameCaseLookup = {} as {
        [lowerSourceFilePath: string]: {
            [lowerFunctionName: string]: string
        }
    };

    protected async stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments) {
        this.log('stackTraceRequest');
        let frames = [];

        if (this.rokuAdapter.isAtDebuggerPrompt) {
            let stackTrace = await this.rokuAdapter.getStackTrace();

            for (let debugFrame of stackTrace) {
                let sourceLocation = await this.getSourceLocation(debugFrame.filePath, debugFrame.lineNumber);

                //the stacktrace returns function identifiers in all lower case. Try to get the actual case
                //load the contents of the file and get the correct casing for the function identifier
                try {
                    let functionName = await this.getCorrectFunctionNameCase(sourceLocation.filePath, debugFrame.functionIdentifier);
                    if (functionName) {
                        debugFrame.functionIdentifier = functionName;
                    }
                } catch (e) {
                    console.error(e);
                }

                let frame = new StackFrame(
                    debugFrame.frameId,
                    `${debugFrame.functionIdentifier}`,
                    new Source(path.basename(sourceLocation.filePath), sourceLocation.filePath),
                    sourceLocation.lineNumber,
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
            let rokuAdapter = await this.getRokuAdapter();
            let threads = await rokuAdapter.getThreads();
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
     * File paths can be different casing sometimes,
     * so delete from `breakpointsByClientPath` case-insensitive
     */
    public deleteBreakpointsForClientPath(clientPath: string) {
        for (let key in this.breakpointsBySourcePath) {
            if (clientPath.toLowerCase() === key.toLowerCase()) {
                delete this.breakpointsBySourcePath[key];
            }
        }
    }

    /**
     * Convert a debugger location into a source location.
     * If a source map with the same name is found, those will be used.
     * Otherwise, use the `sourceDirs` and the `componentLibraries` root dirs to
     * walk through the file system to find a source file that matches
     * @param debuggerPath - the path that was returned by the debugger
     * @param debuggerLineNumber - the line number that was sent by the debugger
     */
    public async getSourceLocation(debuggerPath: string, debuggerLineNumber: number): Promise<SourceLocation | undefined> {
        return this.projectManager.getSourceLocation(debuggerPath, debuggerLineNumber);
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
    componentLibraries: ComponentLibraryConfig[];
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

    /**
     * If true, then the staging folder is NOT deleted after a debug session has been closed
     */
    retainStagingFolder: boolean;
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
