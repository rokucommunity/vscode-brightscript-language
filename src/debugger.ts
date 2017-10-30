import {
	Logger, logger,
	DebugSession, LoggingDebugSession,
	InitializedEvent, TerminatedEvent, StoppedEvent, BreakpointEvent, OutputEvent,
	Thread, StackFrame, Scope, Source, Handles, Breakpoint, ErrorDestination
} from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';
import { basename } from 'path';
import * as path from 'path';
import * as glob from 'glob';
import * as rokuDeploy from 'roku-deploy';
import * as Q from 'q';
import * as fsExtra from 'fs-extra';
import * as eol from 'eol';
import { EventName, RokuAdapter } from './RokuAdapter';

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
}

class BrightScriptDebugSession extends DebugSession {
	public constructor() {
		super();
		// this debugger uses zero-based lines and columns
		this.setDebuggerLinesStartAt1(false);
		this.setDebuggerColumnsStartAt1(false);
	}

	private breakpoints: { path: string, breakpoints: DebugProtocol.Breakpoint[] }[] = [];
	private breakpointIdCounter = 0;
	private rokuAdapter: RokuAdapter;

	// we don't support multiple threads, so we can use a hardcoded ID for the default thread
	private static THREAD_ID = 1;

	private _variableHandles = new Handles<string>();


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
		response.body.supportsStepBack = true;

		this.sendResponse(response);
	}

	private launchRequestWasCalled = false;
	protected async launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments) {
		this.launchRequestWasCalled = true;
		console.log('Packaging and deploying to roku');
		try {
			//copy all project files to the staging folder
			let stagingFolder = await rokuDeploy.prepublishToStaging(args);

			//TODO add breakpoint lines to source files and then publish
			await this.addBreakpointStatements(stagingFolder, this.breakpoints);

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

			console.log('deployed');
			this.sendResponse(response);
		} catch (e) {
			this.sendErrorResponse(response, -1, e.message);
			this.shutdown();
			return;
		}
	}

	private async connectRokuAdapter(host: string) {
		this.rokuAdapter = new RokuAdapter(host);
		//register events
		this.rokuAdapter.on(EventName.break, (payload) => {
			let text = 'some text';
			const e: DebugProtocol.OutputEvent = new OutputEvent(`${text}\n`);
			e.body.source = this.createSource(payload.filePath);
			e.body.line = this.convertDebuggerLineToClient(payload.lineNumber);
			let column = 0;
			e.body.column = this.convertDebuggerColumnToClient(column);
			this.sendEvent(e);
		});
		//make the connection
		await this.rokuAdapter.connect();
	}

	private createSource(filePath: string): Source {
		return new Source(basename(filePath), this.convertDebuggerPathToClient(filePath), undefined, undefined, 'mock-adapter-data');
	}

	/**
	 * Write "stop" lines into source code of each file for each breakpoint
	 * @param stagingPath
	 */
	public async addBreakpointStatements(stagingPath: string, breakpointContainers: { path: string, breakpoints: DebugProtocol.Breakpoint[] }[]) {
		let promises = breakpointContainers.map((container) => {
			let stagingFilePath: string;
			//find the manifest file for the file
			return this.getBaseProjectPath(container.path).then((baseProjectPath) => {
				let filePath = path.normalize(container.path);
				let relativePath = container.path.toString().replace(baseProjectPath, '');
				stagingFilePath = path.join(stagingPath, relativePath);
				//load the file as a string
				return fsExtra.readFile(stagingFilePath);
			}).then((fileBuffer) => {
				let fileContents = fileBuffer.toString();
				//split the file by newline
				let lines = eol.split(fileContents);
				for (let breakpoint of container.breakpoints) {
					let line = lines[breakpoint.line];
					//add a STOP statement right before this line
					lines[breakpoint.line] = `STOP\n${line}`;
				}
				fileContents = lines.join('\n');
				return fsExtra.writeFile(stagingFilePath, fileContents);
			});
		});
		await Promise.all(promises);
	}

	/**
	 * Given a full path to a file, walk up the tree until we have found the base project path (full path to the folder containing the manifest file)
	 * @param filePath
	 */
	private async getBaseProjectPath(filePath: string) {
		//try walking up 10 levels. If we haven't found it by then, there is nothing we can do.
		let folderPath = filePath;
		for (let i = 0; i < 10; i++) {
			folderPath = path.dirname(folderPath);
			let files = await Q.nfcall(glob, path.join(folderPath, 'manifest'));
			if (files.length === 1) {
				let dir = path.dirname(files[0]);
				return path.normalize(dir);
			}
		}
		throw new Error('Unable to find base project path');
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

		const path = <string>args.source.path;
		const clientLines = args.lines || [];
		let container = {
			path,
			breakpoints: []
		}

		this.breakpoints.push(container);

		// set and verify breakpoint locations
		const actualBreakpoints = clientLines.map((lineNumber) => {
			const breakpoint = <DebugProtocol.Breakpoint>new Breakpoint(true, lineNumber);
			breakpoint.id = this.breakpointIdCounter++;
			container.breakpoints.push(breakpoint);
			return breakpoint;
		});

		// send back the actual breakpoint positions
		response.body = {
			breakpoints: actualBreakpoints
		};
		this.sendResponse(response);
	}

	protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
		console.log('threadsRequest');
		this.sendResponse(response);
	}

	protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments) {
		console.log('stackTraceRequest');
		this.sendResponse(response);
	}

	protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments) {
		console.log('scopesRequest');
		this.sendResponse(response);
	}

	protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments) {
		console.log('variablesRequest');
		this.sendResponse(response);
	}

	protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments) {
		console.log('continueRequest');
		this.sendResponse(response);
	}

	protected reverseContinueRequest(response: DebugProtocol.ReverseContinueResponse, args: DebugProtocol.ReverseContinueArguments) {
		console.log('reverseContinueRequest');
		this.sendResponse(response);
	}

	protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments) {
		console.log('nextRequest');
		this.sendResponse(response);
	}

	protected stepBackRequest(response: DebugProtocol.StepBackResponse, args: DebugProtocol.StepBackArguments) {
		console.log('stepBackRequest');
		this.sendResponse(response);
	}

	protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments) {
		console.log('evaluateRequest');
		this.sendResponse(response);
	}
}

DebugSession.run(BrightScriptDebugSession);
