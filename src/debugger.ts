import {
	Logger, logger,
	DebugSession, LoggingDebugSession,
	InitializedEvent, TerminatedEvent, StoppedEvent, BreakpointEvent, OutputEvent,
	Thread, StackFrame, Scope, Source, Handles, Breakpoint, ErrorDestination, Variable
} from 'vscode-debugadapter';
import { DebugProtocol, } from 'vscode-debugprotocol';
import { basename } from 'path';
import * as path from 'path';
import * as glob from 'glob';
import * as rokuDeploy from 'roku-deploy';
import * as Q from 'q';
import * as fsExtra from 'fs-extra';
import * as eol from 'eol';
import { EventName, RokuAdapter } from './RokuAdapter';
import * as findInFiles from 'find-in-files';

class BrightScriptDebugSession extends DebugSession {
	public constructor() {
		super();
		// this debugger uses zero-based lines and columns
		this.setDebuggerLinesStartAt1(true);
		this.setDebuggerColumnsStartAt1(true);
	}

	private rokuAdapterDeferred = defer<RokuAdapter>();

	private breakpointsByClientPath: { [clientPath: string]: DebugProtocol.Breakpoint[] } = {};
	private breakpointIdCounter = 0;
	private stackFrameIdCounter = 1;

	private rokuAdapter: RokuAdapter;

	private getRokuAdapter() {
		return this.rokuAdapterDeferred.promise;
	}

	private _variableHandles = new Handles<string>();

	private launchArgs: LaunchRequestArguments;

	private get baseProjectPath() {
		return path.normalize(this.launchArgs.rootDir);
	}


	/**
	 * The 'initialize' request is the first request called by the frontend
	 * to interrogate the features the debug adapter provides.
	 */
	protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {

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

		this.sendResponse(response);
	}


	private launchRequestWasCalled = false;
	protected async launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments) {
		this.launchArgs = args;
		this.launchRequestWasCalled = true;
		console.log('Packaging and deploying to roku');
		try {

			//copy all project files to the staging folder
			let stagingFolder = await rokuDeploy.prepublishToStaging(args);

			//TODO add breakpoint lines to source files and then publish
			await this.addBreakpointStatements(stagingFolder);

			//TODO - Remove this once this project is completed.
			(args as any).retainStagingFolder = true;

			//create zip package from staging folder
			await rokuDeploy.zipPackage(args);

			//force roku to return to home screen. This gives the roku adapter some security in knowing new messages won't be appearing
			await rokuDeploy.pressHomeButton(args.host);

			//connect to the roku debug via telnet
			await this.connectRokuAdapter(args.host);

			//publish the package to the target Roku
			await rokuDeploy.publish(args);

			//tell the adapter adapter that the channel has been launched. 
			await this.rokuAdapter.activate();

			console.log(`deployed to Roku@${args.host}`);
			this.sendResponse(response);
		} catch (e) {
			console.log(e);
			this.sendErrorResponse(response, -1, e.message);
			this.shutdown();
			return;
		}
	}

	protected sourceRequest(response: DebugProtocol.SourceResponse, args: DebugProtocol.SourceArguments) {
		let old = this.sendResponse;
		this.sendResponse = function (...args) {
			old.apply(this, args);
			this.sendResponse = old;
		}
		super.sourceRequest(response, args);
	}


	protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments) {
		console.log('configurationDoneRequest')
	}

	protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments) {
		//roku currently only supports in-code breakpoints, so we can't add new breakpoints after the project is running.
		if (this.launchRequestWasCalled) {
			this.sendEvent(new OutputEvent('\nBreakpoints cannot be set during a debugging session', 'stdout'));
			return;
		}

		const clientPath = path.normalize(args.source.path);
		const clientLines = args.lines || [];

		// set and verify breakpoint locations
		const actualBreakpoints = clientLines.map((lineNumber) => {
			const breakpoint = <DebugProtocol.Breakpoint>new Breakpoint(true, lineNumber);
			breakpoint.id = this.breakpointIdCounter++;
			return breakpoint;
		});

		//store the breakpoints indexed by clientPath
		this.breakpointsByClientPath[clientPath] = actualBreakpoints;

		// send back the actual breakpoint positions
		response.body = {
			breakpoints: actualBreakpoints
		};
		this.sendResponse(response);
	}

	protected async threadsRequest(response: DebugProtocol.ThreadsResponse) {
		// console.log('threadsRequest');
		if (this.rokuAdapter) {
			let rokuThreads = await this.rokuAdapter.getThreads();

			let threads = [];
			for (let thread of rokuThreads) {
				threads.push(
					new Thread(thread.threadId, `Thread ${thread.threadId}`)
				);
			}
			response.body = {
				threads: threads
			};
		}

		this.sendResponse(response);
	}

	protected async stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments) {
		// console.log('stackTraceRequest');
		let stackTrace = await this.rokuAdapter.getStackTrace();
		let frames = [];

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
			} catch (e) { }

			let frame = new StackFrame(
				debugFrame.frameId,
				`${debugFrame.functionIdentifier}`,
				new Source(path.basename(clientPath), clientPath),
				clientLineNumber,
				1
			);
			frames.push(frame);
		}

		response.body = {
			stackFrames: frames,
			totalFrames: frames.length
		};
		this.sendResponse(response);
	}

	protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments) {
		console.log('scopesRequest');

		this.sendResponse(response);
	}

	protected async continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments) {
		await this.rokuAdapter.continue();
		this.sendResponse(response);
	}

	protected async pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments) {
		await this.rokuAdapter.pause();
		this.sendResponse(response);
	}

	protected reverseContinueRequest(response: DebugProtocol.ReverseContinueResponse, args: DebugProtocol.ReverseContinueArguments) {
		console.log('reverseContinueRequest');
		this.sendResponse(response);
	}

	/**
	 * Clicked the "Step Over" button
	 * @param response 
	 * @param args 
	 */
	protected async nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments) {
		await this.rokuAdapter.stepOver();
		this.sendResponse(response);
	}

	protected async stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments) {
		await this.rokuAdapter.stepInto();
		this.sendResponse(response);
	}

	protected async stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments) {
		await this.rokuAdapter.stepOut();
		this.sendResponse(response);
	}

	protected stepBackRequest(response: DebugProtocol.StepBackResponse, args: DebugProtocol.StepBackArguments) {
		console.log('stepBackRequest');
		this.sendResponse(response);
	}

	protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments) {
		console.log(`variablesRequest: ${JSON.stringify(args)}`);
		if(args.filter === 'named'){
			let variables = [
				new Variable('name','bob'),
				new Variable('firstChild', `{name: "Kid1", age: 12}`, 2)
			];
			response.body = {
				variables: variables
			}
		}
		this.sendResponse(response);
	}

	private variablesReferenceCounter = 0;
	protected async evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments) {
		console.log(`evaluateRequest: ${args.expression}`);
		let result = <string>(await this.rokuAdapter.evaluate(args.expression));
		let obj = `{name: 'Bob', firstChild: firstChild }`;
		const v: DebugProtocol.Variable = new Variable('m.', , 1, 1, 1);
		if (args.expression) {
			v.evaluateName = args.expression;
		}

		response.body = {
			result: v.value,
			variablesReference: 1,//v.variablesReference,
			namedVariables: 1,//v.namedVariables,
			indexedVariables: 0,//v.indexedVariables
		};
		this.sendResponse(response);
	}

	/**
	 * Given a path from the debugger, convert it to a client path
	 * @param debuggerPath
	 */
	protected convertDebuggerPathToClient(debuggerPath: string) {
		//remove preceeding pkg: 
		if (debuggerPath.toLowerCase().indexOf('pkg:') === 0) {
			debuggerPath = debuggerPath.substring(4);
		}
		let clientPath = path.normalize(path.join(this.launchArgs.rootDir, debuggerPath));
		return clientPath;
	}

	/**
	 * Called when the host stops debugging
	 * @param response 
	 * @param args 
	 */
	protected async disconnectRequest(response: any, args: any) {
		this.rokuAdapter.destroy();
		//return to the home screen
		await rokuDeploy.pressHomeButton(this.launchArgs.host);
		this.sendResponse(response);
	}


	private async connectRokuAdapter(host: string) {
		this.rokuAdapter = new RokuAdapter(host);
		//register events
		let firstSuspend = true;
		//when the debugger suspends (pauses for debugger input)
		this.rokuAdapter.on('suspend', (threadId) => {
			//determine if this is the "stop on entry" breakpoint
			let isStoppedOnEntry = firstSuspend && this.entryBreakpoint;

			//skip the breakpoint if this is the entry breakpoint and stopOnEntry is false
			if (isStoppedOnEntry && !this.launchArgs.stopOnEntry) {
				//skip the breakpoint 
				this.rokuAdapter.continue();
			} else {
				let exceptionText = '';
				const event: StoppedEvent = new StoppedEvent(StoppedEventReason.breakpoint, threadId, exceptionText);
				(event.body as any).allThreadsStopped = false;
				this.sendEvent(event);
			}
			firstSuspend = false;
		});
		//make the connection
		await this.rokuAdapter.connect();
		this.rokuAdapterDeferred.resolve(this.rokuAdapter);
	}

	private createSource(filePath: string): Source {
		return new Source(basename(filePath), this.convertDebuggerPathToClient(filePath), undefined, undefined, 'mock-adapter-data');
	}


	/**
	 * Write "stop" lines into source code of each file for each breakpoint
	 * @param stagingPath
	 */
	public async addBreakpointStatements(stagingPath: string) {
		let promises = [];
		let addBreakpointsToFile = async (clientPath) => {
			let breakpoints = this.breakpointsByClientPath[clientPath];
			let stagingFilePath: string;
			//find the manifest file for the file
			clientPath = path.normalize(clientPath);
			let relativeClientPath = clientPath.toString().replace(this.baseProjectPath, '');
			stagingFilePath = path.join(stagingPath, relativeClientPath);
			//load the file as a string
			let fileContents = (await fsExtra.readFile(stagingFilePath)).toString();
			//split the file by newline
			let lines = eol.split(fileContents);
			for (let breakpoint of breakpoints) {
				//since arrays are indexed by zero, but the breakpoint lines are indexed by 1, we need to subtract 1 from the breakpoint line number
				let lineIndex = breakpoint.line - 1;
				let line = lines[lineIndex];
				//add a STOP statement right before this line
				lines[lineIndex] = `STOP\n${line}`;
			}
			fileContents = lines.join('\n');
			await fsExtra.writeFile(stagingFilePath, fileContents);
		};

		//add a breakpoint to the first line of the entry point method for consistency when debugging
		await this.addEntryBreakpoint();

		//add breakpoints to each client file
		for (let clientPath in this.breakpointsByClientPath) {
			promises.push(addBreakpointsToFile(clientPath));
		}
		await Promise.all(promises);
	}
	private entryBreakpoint: DebugProtocol.Breakpoint;
	private async addEntryBreakpoint() {
		let results = Object.assign(
			{},
			await findInFiles.find({ term: 'sub RunUserInterface\\(', flags: 'ig' }, this.baseProjectPath, /.*\.brs/),
			await findInFiles.find({ term: 'sub main\\(', flags: 'ig' }, this.baseProjectPath, /.*\.brs/)
		);
		let entryPath = Object.keys(results)[0];
		if (!entryPath) {
			throw new Error('Unable to find an entry point. Please make sure that you have a RunUserInterface or Main sub declared in your BrightScript project');
		}
		let entryLine = results[entryPath].line[0];
		let lineNumber: number;
		//load the file contents
		let contents = await fsExtra.readFile(entryPath);
		let lines = eol.split(contents.toString());
		//loop through the lines until we find the entry line
		for (let i = 0; i < lines.length; i++) {
			let line = lines[i];
			if (line.indexOf(entryLine) > -1) {
				lineNumber = i + 1;
				break;
			}
		}
		//create a breakpoint on the line BELOW this location, which is the first line of the program
		this.entryBreakpoint = <DebugProtocol.Breakpoint>new Breakpoint(true, lineNumber + 1);
		this.entryBreakpoint.id = this.breakpointIdCounter++;
		(this.entryBreakpoint as any).isEntryBreakpoint = true;
		//put this breakpoint into the list of breakpoints, in order
		let breakpoints = this.breakpointsByClientPath[entryPath] || [];
		breakpoints.push(this.entryBreakpoint);
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
		this.breakpointsByClientPath[entryPath] = breakpoints;
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
		let breakpoints = this.breakpointsByClientPath[clientPath] || [];

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
	 * If true, stop at the first executable line of the program
	 */
	stopOnEntry: boolean;
}


enum StoppedEventReason {
	step = 'step',
	breakpoint = 'breakpoint',
	exception = 'exception',
	pause = 'pause',
	entry = 'entry'
}

function defer<T>() {
	let resolve: (value?: T | PromiseLike<T>) => void
	let reject: (reason?: any) => void
	let promise = new Promise<T>((_resolve, _reject) => {
		resolve = _resolve;
		reject = _reject;
	});
	return {
		promise,
		resolve,
		reject
	}
}

DebugSession.run(BrightScriptDebugSession);
