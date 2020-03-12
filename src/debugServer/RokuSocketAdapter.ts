import { BrightScriptDebugger } from 'brightscript-debugger';
import * as eol from 'eol';
import * as EventEmitter from 'events';
import { Socket } from 'net';

import { defer } from './BrightScriptDebugSession';
import { RendezvousHistory, RendezvousTracker } from './RendezvousTracker';
import { SourceLocation } from './SourceLocator';

/**
 * A class that connects to a Roku device over telnet debugger port and provides a standardized way of interacting with it.
 */
export class RokuSocketAdapter {
    constructor(
        private host: string,
        private enableDebuggerAutoRecovery: boolean = false,
        private stopOnEntry: boolean = false
    ) {
        this.emitter = new EventEmitter();
        this.status = RokuAdapterStatus.none;
        this.startCompilingLine = -1;
        this.endCompilingLine = -1;
        this.compilingLines = [];
        this.debugStartRegex = new RegExp('BrightScript Micro Debugger\.', 'ig');
        this.debugEndRegex = new RegExp('Brightscript Debugger>', 'ig');
        this.rendezvousTracker = new RendezvousTracker();

        // watch for rendezvous events
        this.rendezvousTracker.on('rendezvous-event', (output) => {
            this.emit('rendezvous-event', output);
        });
    }

    public connected: boolean;

    private status: RokuAdapterStatus;
    private requestPipeline: RequestPipeline;
    private emitter: EventEmitter;
    private startCompilingLine: number;
    private endCompilingLine: number;
    private compilingLines: string[];
    private compileErrorTimer: any;
    private isNextBreakpointSkipped: boolean = false;
    private isInMicroDebugger: boolean;
    private debugStartRegex: RegExp;
    private debugEndRegex: RegExp;
    private rendezvousTracker: RendezvousTracker;
    private socketDebugger: BrightScriptDebugger;
    private nextFrameId: number = 1;

    private stackFramesCache: { [keys: number]: StackFrame } = {};
    private cache = {};

    /**
     * Subscribe to various events
     * @param eventName
     * @param handler
     */
    public on(eventName: 'cannot-continue', handler: () => void);
    public on(eventName: 'close', handler: () => void);
    public on(eventName: 'app-exit', handler: () => void);
    public on(eventName: 'compile-errors', handler: (params: { path: string; lineNumber: number; }[]) => void);
    public on(eventName: 'connected', handler: (params: boolean) => void);
    public on(eventname: 'console-output', handler: (output: string) => void);
    public on(eventname: 'rendezvous-event', handler: (output: RendezvousHistory) => void);
    public on(eventName: 'runtime-error', handler: (error: BrightScriptRuntimeError) => void);
    public on(eventName: 'suspend', handler: () => void);
    public on(eventName: 'start', handler: () => void);
    public on(eventname: 'unhandled-console-output', handler: (output: string) => void);
    public on(eventName: string, handler: (payload: any) => void) {
        this.emitter.on(eventName, handler);
        return () => {
            if (this.emitter !== undefined) {
                this.emitter.removeListener(eventName, handler);
            }
        };
    }

    private emit(
        eventName:
            'app-exit' |
            'cannot-continue' |
            'close' |
            'compile-errors' |
            'connected' |
            'console-output' |
            'rendezvous-event' |
            'runtime-error' |
            'start' |
            'suspend' |
            'unhandled-console-output',
        data?
    ) {
        //emit these events on next tick, otherwise they will be processed immediately which could cause issues
        setTimeout(() => {
            //in rare cases, this event is fired after the debugger has closed, so make sure the event emitter still exists
            if (this.emitter) {
                this.emitter.emit(eventName, data);
            }
        }, 0);
    }

    /**
     * The debugger needs to tell us when to be active (i.e. when the package was deployed)
     */
    public isActivated = false;

    /**
     * This will be set to true When the roku emits the [scrpt.ctx.run.enter] text,
     * which indicates that the app is running on the Roku
     */
    public isAppRunning = false;

    public async activate() {
        this.isActivated = true;
        this.handleStartupIfReady();
    }

    private async handleStartupIfReady() {
        if (this.isActivated && this.isAppRunning) {
            this.emit('start');

            //if we are already sitting at a debugger prompt, we need to emit the first suspend event.
            //If not, then there are probably still messages being received, so let the normal handler
            //emit the suspend event when it's ready
            if (this.isAtDebuggerPrompt === true) {
                let threads = await this.getThreads();
                this.emit('suspend', threads[0].threadId);
            }
        }
    }

    /**
     * Wait until the client has stopped sending messages. This is used mainly during .connect so we can ignore all old messages from the server
     * @param client
     * @param name
     * @param maxWaitMilliseconds
     */
    private settle(client: Socket, name: string, maxWaitMilliseconds = 400) {
        return new Promise((resolve) => {
            let callCount = -1;

            function handler() {
                callCount++;
                let myCallCount = callCount;
                setTimeout(() => {
                    //if no other calls have been made since the timeout started, then the listener has settled
                    if (myCallCount === callCount) {
                        client.removeListener(name, handler);
                        resolve(callCount);
                    }
                }, maxWaitMilliseconds);
            }

            client.addListener(name, handler);
            //call the handler immediately so we have a timeout
            handler();
        });
    }

    public processBreakpoints(text): string | null {
        // console.log(lines);
        let newLines = eol.split(text);
        newLines.forEach((line) => {
            console.log('Running processing line; ', line);
            if (line.match(this.debugStartRegex)) {
                console.log('start MicroDebugger block');
                this.isInMicroDebugger = true;
                this.isNextBreakpointSkipped = false;
            } else if (this.isInMicroDebugger && line.match(this.debugEndRegex)) {
                console.log('ended MicroDebugger block');
                this.isInMicroDebugger = false;
            } else if (this.isInMicroDebugger) {
                if (this.enableDebuggerAutoRecovery && line.startsWith('Break in ')) {
                    console.log('this block is a break: skipping it');
                    this.isNextBreakpointSkipped = true;
                }
            }
        });
        return text;
    }

    public get isAtDebuggerPrompt() {
        return this.socketDebugger ? this.socketDebugger.isStopped : false;
    }

    /**
     * Connect to the telnet session. This should be called before the channel is launched.
     */
    public async connect() {
        let deferred = defer();
        this.isInMicroDebugger = false;
        this.isNextBreakpointSkipped = false;
        this.socketDebugger = new BrightScriptDebugger(this.host, this.stopOnEntry);
        try {
            // Emit IO output from the debugger.
            this.socketDebugger.on('io-output', async (responseText) => {
                if (responseText) {
                    responseText = await this.rendezvousTracker.processLogLine(responseText);
                    this.emit('unhandled-console-output', responseText);
                }
            });

            // this.socketDebugger.connect();
            this.connected = await this.socketDebugger.connect();
            console.log(`+++++++++++ CONNECTED TO DEVICE ${this.host}, Success ${this.connected} +++++++++++`);
            this.emit('connected', this.connected);

            // Listen for the close event
            this.socketDebugger.on('close', () => {
                this.emit('close');
            });

            this.socketDebugger.on('suspend', (data) => {
                this.emit('suspend', data);
            });

            this.socketDebugger.on('runtime-error', (data) => {
                this.emit('runtime-error', <BrightScriptRuntimeError>{
                    message: data.data.stopReasonDetail,
                    errorCode: data.data.stopReason
                });
            });

            // //if the connection fails, reject the connect promise
            // client.addListener('error', (err) => {
            //     deferred.reject(new Error(`Error with connection to: ${this.host} \n\n ${err.message}`));
            // });

            // await this.settle(client, 'data');

            // //hook up the pipeline to the socket
            // this.requestPipeline = new RequestPipeline(client);

            // //forward all raw console output
            // this.requestPipeline.on('console-output', (output) => {
            //     this.processBreakpoints(output);
            //     if (output) {
            //         this.emit('console-output', output);
            //     }
            // });

            // //listen for any console output that was not handled by other methods in the adapter
            // this.requestPipeline.on('unhandled-console-output', async (responseText: string) => {
            //     //if there was a runtime error, handle it
            //     let hasRuntimeError = this.checkForRuntimeError(responseText);

            //     responseText = await this.rendezvousTracker.processLogLine(responseText);
            //     //forward all unhandled console output
            //     this.processBreakpoints(responseText);
            //     if (responseText) {
            //         this.emit('unhandled-console-output', responseText);
            //     }

            //     // short circuit after the output has been sent as console output
            //     if (hasRuntimeError) {
            //         console.debug('hasRuntimeError!!');
            //         this.isAtDebuggerPrompt = true;
            //         return;
            //     }

            //     this.processUnhandledLines(responseText);
            //     let match;

            //     if (this.isAtCannotContinue(responseText)) {
            //         this.isAtDebuggerPrompt = true;
            //         return;
            //     }

            //     if (this.isActivated) {
            //         //watch for the start of the program
            //         if (match = /\[scrpt.ctx.run.enter\]/i.exec(responseText.trim())) {
            //             this.isAppRunning = true;
            //             this.handleStartupIfReady();
            //         }

            //         //watch for the end of the program
            //         if (match = /\[beacon.report\] \|AppExitComplete/i.exec(responseText.trim())) {
            //             this.beginAppExit();
            //         }

            //         //watch for debugger prompt output
            //         if (match = /Brightscript\s*Debugger>\s*$/i.exec(responseText.trim())) {
            //             //if we are activated AND this is the first time seeing the debugger prompt since a continue/step action
            //             if (this.isNextBreakpointSkipped) {
            //                 console.log('this breakpoint is flagged to be skipped');
            //                 this.isInMicroDebugger = false;
            //                 this.isNextBreakpointSkipped = false;
            //                 this.requestPipeline.executeCommand('c', false, false, false);
            //             } else {
            //                 if (this.isActivated && this.isAtDebuggerPrompt === false) {
            //                     this.isAtDebuggerPrompt = true;
            //                     this.emit('suspend');
            //                 } else {
            //                     this.isAtDebuggerPrompt = true;
            //                 }
            //             }
            //         } else {
            //             this.isAtDebuggerPrompt = false;
            //         }
            //     }
            // });

            //the adapter is connected and running smoothly. resolve the promise
            deferred.resolve();
        } catch (e) {
            deferred.reject(e);
        }
        return await deferred.promise;
    }

    private beginAppExit() {
        let that = this;
        this.compileErrorTimer = setTimeout(() => {
            that.isAppRunning = false;
            that.emit('app-exit');
        }, 200);
    }

    /**
     * Look through response text for the "Can't continue" text
     * @param responseText
     */
    private isAtCannotContinue(responseText: string) {
        if (/can't continue/gi.exec(responseText.trim())) {
            this.emit('cannot-continue');
            return true;
        } else {
            return false;
        }
    }

    /**
     * Look through the given response text for a runtime error
     * @param responseText
     */
    private checkForRuntimeError(responseText: string) {
        let match = /(.*)\s\(runtime\s+error\s+(.*)\)\s+in/.exec(responseText);
        if (match) {
            let message = match[1].trim();
            let errorCode = match[2].trim().toLowerCase();
            //if the codes encountered are the STOP or scriptBreak() calls, skip them
            if (errorCode === '&hf7' || errorCode === '&hf8') {
                return false;
            }
            this.emit('runtime-error', <BrightScriptRuntimeError>{
                message: message,
                errorCode: errorCode
            });
            return true;
        } else {
            return false;
        }
    }

    private processUnhandledLines(responseText: string) {
        if (this.status === RokuAdapterStatus.running) {
            return;
        }

        let newLines = eol.split(responseText);
        console.debug('processUnhandledLines: this.status ' + this.status);
        switch (this.status) {
            case RokuAdapterStatus.compiling:
            case RokuAdapterStatus.compileError:
                this.endCompilingLine = this.getEndCompilingLine(newLines);
                if (this.endCompilingLine !== -1) {
                    console.debug('processUnhandledLines: entering state RokuAdapterStatus.running');
                    this.status = RokuAdapterStatus.running;
                    this.resetCompileErrorTimer(false);
                } else {
                    this.compilingLines = this.compilingLines.concat(newLines);
                    if (this.status === RokuAdapterStatus.compiling) {
                        //check to see if we've entered an error scenario
                        let errors = this.getErrors();
                        if (errors.length > 0) {
                            this.status = RokuAdapterStatus.compileError;
                        }
                    }
                    if (this.status === RokuAdapterStatus.compileError) {
                        //every input line while in error status will reset the stale timer, so we can wait for more errors to roll in.
                        this.resetCompileErrorTimer(true);
                    }
                }
                break;
            case RokuAdapterStatus.none:
                this.startCompilingLine = this.getStartingCompilingLine(newLines);
                this.compilingLines = this.compilingLines.concat(newLines);
                if (this.startCompilingLine !== -1) {
                    console.debug('processUnhandledLines: entering state RokuAdapterStatus.compiling');
                    newLines.splice(0, this.startCompilingLine);
                    this.status = RokuAdapterStatus.compiling;
                    this.resetCompileErrorTimer(true);
                }
                break;
        }
    }

    public resetCompileErrorTimer(isRunning): any {
        console.debug('resetCompileErrorTimer isRunning' + isRunning);

        if (this.compileErrorTimer) {
            clearInterval(this.compileErrorTimer);
            this.compileErrorTimer = undefined;
        }

        if (isRunning) {
            if (this.status === RokuAdapterStatus.compileError) {
                let that = this;
                console.debug('resetting resetCompileErrorTimer');
                this.compileErrorTimer = setTimeout(() => that.onCompileErrorTimer(), 1000);
            }
        }
    }

    public onCompileErrorTimer() {
        console.debug('onCompileErrorTimer: timer complete. should\'ve caught all errors ');

        this.status = RokuAdapterStatus.compileError;
        this.resetCompileErrorTimer(false);
        this.reportErrors();
    }

    private getStartingCompilingLine(lines: string[]): number {
        let lastIndex: number = -1;
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            //if this line looks like the compiling line
            if (/------\s+compiling.*------/i.exec(line)) {
                lastIndex = i;
            }
        }
        return lastIndex;
    }

    private getEndCompilingLine(lines: string[]): number {
        let lastIndex: number = -1;
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            // if this line looks like the compiling line
            if (/------\s+Running.*------/i.exec(line)) {
                lastIndex = i;
            }
        }
        return lastIndex;

    }

    private getErrors() {
        let syntaxErrors = this.getSyntaxErrors(this.compilingLines);
        let compileErrors = this.getCompileErrors(this.compilingLines);
        let xmlCompileErrors = this.getSingleFileXmlError(this.compilingLines);
        let multipleXmlCompileErrors = this.getMultipleFileXmlError(this.compilingLines);
        return syntaxErrors.concat(compileErrors).concat(multipleXmlCompileErrors).concat(xmlCompileErrors);
    }

    /**
     * Look through the given responseText for a compiler error
     * @param responseText
     */
    private reportErrors() {
        console.debug('reportErrors');
        //throw out any lines before the last found compiling line

        let errors = this.getErrors();

        errors = errors.filter((e) => e.path.toLowerCase().endsWith('.brs') || e.path.toLowerCase().endsWith('.xml'));

        console.debug('errors.length ' + errors.length);
        if (errors.length > 0) {
            this.emit('compile-errors', errors);
        }
    }

    public getSyntaxErrors(lines: string[]): BrightScriptDebugCompileError[] {
        let match;
        let errors = [];
        let syntaxRegEx = /(syntax|compile) error.* in (.*)\((\d+)\)/gim;
        lines.forEach((line) => {
            match = syntaxRegEx.exec(line);
            if (match) {
                let path = match[2];
                let lineNumber = parseInt(match[3]) - 1;

                //FIXME
                //if this match is a livecompile error, throw out all prior errors because that means we are re-running
                if (path.toLowerCase().indexOf('$livecompile') === -1) {

                    errors.push({
                        path: path,
                        lineNumber: lineNumber,
                        line: line,
                        message: match[0],
                        charStart: 0,
                        charEnd: 999 //TODO
                    });
                }
            }
        });
        return errors;
    }

    public getCompileErrors(lines: string[]): BrightScriptDebugCompileError[] {
        let errors = [];
        let match;
        let responseText = lines.join('\n');
        const filesWithErrors = responseText.split('=================================================================');
        if (filesWithErrors.length < 2) {
            return [];
        }
        for (let index = 1; index < filesWithErrors.length - 1; index++) {
            const fileErrorText = filesWithErrors[index];
            //TODO - for now just a simple parse - later on someone can improve with proper line checks + all parse/compile types
            //don't have time to do this now; just doing what keeps me productive.
            let getFileInfoRexEx = /found(?:.*)file (.*)$/gim;
            match = getFileInfoRexEx.exec(fileErrorText);
            if (!match) {
                continue;
            }

            let path = match[1];
            let lineNumber = 0; //TODO this should iterate over all line numbers found in a file
            let errorText = 'ERR_COMPILE:';
            let message = fileErrorText;

            errors.push({
                path: path,
                lineNumber: lineNumber,
                errorText: errorText,
                message: message,
                charStart: 0,
                charEnd: 999 //TODO
            });

            //now iterate over the lines, to see if there's any errors we can extract
            let lineErrors = this.getLineErrors(path, fileErrorText);
            if (lineErrors.length > 0) {
                errors = lineErrors;
            }
        }
        return errors;
    }

    public getLineErrors(path: string, fileErrorText: string): any[] {
        let errors = [];
        let getFileInfoRexEx = /^--- Line (\d*): (.*)$/gim;
        let match;
        while (match = getFileInfoRexEx.exec(fileErrorText)) {
            let lineNumber = parseInt(match[1]) - 1;
            let errorText = 'ERR_COMPILE:';
            let message = match[2];

            errors.push({
                path: path,
                lineNumber: lineNumber,
                errorText: errorText,
                message: message,
                charStart: 0,
                charEnd: 999 //TODO
            });
        }

        return errors;
    }

    public getSingleFileXmlError(lines): any[] {
        let errors = [];
        let getFileInfoRexEx = /^-------> Error parsing XML component (.*).*$/gim;
        let match;
        lines.forEach((line) => {
            while (match = getFileInfoRexEx.exec(line)) {
                let errorText = 'ERR_COMPILE:';
                let path = match[1];

                errors.push({
                    path: path,
                    lineNumber: 0,
                    errorText: errorText,
                    message: 'general compile error in xml file',
                    charStart: 0,
                    charEnd: 999 //TODO
                });
            }
        });

        return errors;
    }

    public getMultipleFileXmlError(lines): any[] {
        let errors = [];
        let getFileInfoRexEx = /^-------> Error parsing multiple XML components \((.*)\)/gim;
        let match;
        lines.forEach((line) => {
            while (match = getFileInfoRexEx.exec(line)) {
                let errorText = 'ERR_COMPILE:';
                let files = match[1].split(',');
                files.forEach((path) => {
                    errors.push({
                        path: path.trim(),
                        lineNumber: 0,
                        errorText: errorText,
                        message: 'general compile error in xml file',
                        charStart: 0,
                        charEnd: 999 //TODO
                    });
                });
            }
        });

        return errors;
    }

    /**
     * Send command to step over
     */
    public async stepOver(threadId: number) {
        this.clearCache();
        return await this.socketDebugger.stepOver(threadId);
    }

    public async stepInto(threadId: number) {
        this.clearCache();
        return await this.socketDebugger.stepIn(threadId);
    }

    public async stepOut(threadId: number) {
        this.clearCache();
        return await this.socketDebugger.stepOut(threadId);
    }

    /**
     * Tell the brightscript program to continue (i.e. resume program)
     */
    public async continue() {
        this.clearCache();
        return await this.socketDebugger.continue();
    }

    /**
     * Tell the brightscript program to pause (fall into debug mode)
     */
    public async pause() {
        this.clearCache();
        //send the kill signal, which breaks into debugger mode
        return await this.socketDebugger.pause();
    }

    /**
     * Clears the state, which means that everything will be retrieved fresh next time it is requested
     */
    public clearCache() {
        this.cache = {};
        this.stackFramesCache = {};
    }

    /**
     * Execute a command directly on the roku. Returns the output of the command
     * @param command
     */
    public async evaluate(command: string, frameId: number = this.socketDebugger.primaryThread) {
        if (!this.isAtDebuggerPrompt) {
            throw new Error('Cannot run evaluate: debugger is not paused');
        }

        // Pipe all evaluate requests though as a variable request as evaluate is not available at the moment.
        return await this.getVariable(command, frameId);
    }

    public async getStackTrace(threadId: number = this.socketDebugger.primaryThread) {
        if (!this.isAtDebuggerPrompt) {
            throw new Error('Cannot get stack trace: debugger is not paused');
        }
        return await this.resolve(`stack trace for thread ${threadId}`, async () => {
            let thread = await this.getThreadByThreadId(threadId);
            let frames: StackFrame[] = [];
            let stackTraceData: any = await this.socketDebugger.stackTrace(threadId);
            for (let i = 0; i < stackTraceData.stackSize; i++) {
                let frameData = stackTraceData.entries[i];
                let frame: StackFrame = {
                    frameId: this.nextFrameId ++,
                    frameIndex: stackTraceData.stackSize - i - 1, // frame index is the reverse of the returned order.
                    threadIndex: threadId,
                    filePath: i === 0 ? (frameData.fileName) ? frameData.fileName : thread.filePath : frameData.fileName,
                    lineNumber: i === 0 ? thread.lineNumber : frameData.lineNumber,
                    functionIdentifier: this.cleanUpFunctionName(i === 0 ? (frameData.functionName) ? frameData.functionName : thread.functionName : frameData.functionName)
                };
                this.stackFramesCache[frame.frameId] = frame;
                frames.push(frame);
            }

            return frames;
        });
    }

    private getStackTraceById(frameId: number): StackFrame {
        return this.stackFramesCache[frameId];
    }

    private cleanUpFunctionName(functionName): string {
        return functionName.substring(functionName.lastIndexOf('@') + 1);
    }

    /**
     * Given an expression, evaluate that statement ON the roku
     * @param expression
     */
    public async getVariable(expression: string, frameId: number, withChildren: boolean = true) {
        if (!this.isAtDebuggerPrompt) {
            throw new Error('Cannot resolve variable: debugger is not paused');
        }

        let frame = this.getStackTraceById(frameId);
        if (!frame) {
            throw new Error('Cannot request variable without a corresponding frame');
        }

        return await this.resolve(`variable: ${expression} ${frame.frameIndex} ${frame.threadIndex}`, async () => {
            let variablePath = this.getVariablePath(expression);
            let variableInfo: any = await this.socketDebugger.getVariables(variablePath, withChildren, frame.frameIndex, frame.threadIndex);

            if (variableInfo.errorCode === 'OK') {
                let mainContainer: EvaluateContainer;
                let children: EvaluateContainer[] = [];
                let firstHandled = false;
                for (let variable of variableInfo.variables) {
                    let value;
                    let variableType = variable.variableType;
                    if (variable.value === null) {
                        value = 'roInvalid';
                    } else if (variableType === 'String') {
                        value = `\"${variable.value}\"`;
                    } else {
                        value = variable.value;
                    }

                    if (variableType === 'Subtyped_Object') {
                        let parts = variable.value.split('; ');
                        variableType = `${parts[0]} (${parts[1]})`;
                    } else if (variableType === 'AA') {
                        variableType = 'AssociativeArray';
                    }

                    let container = <EvaluateContainer>{
                        name: expression,
                        evaluateName: expression,
                        variablePath: variablePath,
                        type: variableType,
                        value: value,
                        keyType: variable.keyType,
                        elementCount: variable.elementCount
                    };

                    if (!firstHandled && variablePath.length > 0) {
                        firstHandled = true;
                        mainContainer = container;
                    } else {
                        if (!firstHandled && variablePath.length === 0) {
                            // If this is a scope request there will be no entry's in the variable path
                            // We will need to create a fake mainContainer
                            firstHandled = true;
                            mainContainer = <EvaluateContainer>{
                                name: expression,
                                evaluateName: expression,
                                variablePath: variablePath,
                                type: '',
                                value: null,
                                keyType: 'String',
                                elementCount: variableInfo.numVariables
                            };
                        }

                        let pathAddition = mainContainer.keyType === 'Integer' ? children.length : variable.name;
                        container.name = pathAddition.toString();
                        container.evaluateName = `${mainContainer.evaluateName}.${pathAddition}`;
                        container.variablePath = [].concat(container.variablePath, [pathAddition.toString()]);
                        if (container.keyType) {
                            container.children = [];
                        }
                        children.push(container);
                    }
                }
                mainContainer.children = children;
                return mainContainer;
            }
        });
    }

    private getVariablePath(expression: string): string[] {
        // Regex 101 link for match examples: https://regex101.com/r/KNKfHP/7
        let regexp = /(?:\"(.*?)\"|([a-z_][a-z0-9_\$%!#]*)|\[([0-9]*)\])/gi;
        let match: RegExpMatchArray;
        let variablePath = [];

        while (match = regexp.exec(expression)) {
            variablePath.push(match[1] ? match[1] : match[2] ? match[2] : match[3]);
        }
        return variablePath;
    }

    /**
     * Cache items by a unique key
     * @param expression
     * @param factory
     */
    private resolve<T>(key: string, factory: () => T | Thenable<T>): Promise<T> {
        if (this.cache[key]) {
            return this.cache[key];
        }
        return this.cache[key] = Promise.resolve<T>(factory());
    }

    /**
     * Get a list of threads. The first thread in the list is the active thread
     */
    public async getThreads() {
        if (!this.isAtDebuggerPrompt) {
            throw new Error('Cannot get threads: debugger is not paused');
        }
        return await this.resolve('threads', async () => {
            let threads: Thread[] = [];
            let threadsData: any = await this.socketDebugger.threads();

            for (let i = 0; i < threadsData.threadsCount; i ++) {
                let threadInfo = threadsData.threads[i];
                let thread = <Thread> {
                    // NOTE: On THREAD_ATTACHED events the threads request is marking the wrong thread as primary.
                    // NOTE: Rely on the thead index from the threads update event.
                    isSelected: this.socketDebugger.primaryThread === i,
                    // isSelected: threadInfo.isPrimary,
                    filePath: threadInfo.fileName,
                    functionName: threadInfo.functionName,
                    lineNumber: threadInfo.lineNumber,
                    lineContents: threadInfo.codeSnippet,
                    threadId: i
                };
                threads.push(thread);
            }
            //make sure the selected thread is at the top
            threads.sort((a, b) => {
                return a.isSelected ? -1 : 1;
            });

            return threads;
        });
    }

    private async getThreadByThreadId(threadId: number) {
        let threads = await this.getThreads();
        for (let thread of threads) {
            if (thread.threadId === threadId) {
                return thread;
            }
        }
    }

    /**
     * Disconnect from the telnet session and unset all objects
     */
    public async destroy() {
        await this.socketDebugger.exitChannel();
        this.cache = undefined;
        if (this.emitter) {
            this.emitter.removeAllListeners();
        }
        this.emitter = undefined;
    }

    /**
     * Make sure any active Brightscript Debugger threads are exited
     */
    public async exitActiveBrightscriptDebugger() {
      // Legacy function called by the debug section
    }

    // #region Rendezvous Tracker pass though functions
    /**
     * Passes the debug functions used to locate the client files and lines to the RendezvousTracker
     */
    public registerSourceLocator(sourceLocator: (debuggerPath: string, lineNumber: number) => Promise<SourceLocation>) {
        this.rendezvousTracker.registerSourceLocator(sourceLocator);
    }

    /**
     * Passes the log level down to the RendezvousTracker
     * @param outputLevel the consoleOutput from the launch config
     */
    public setConsoleOutput(outputLevel: string) {
        this.rendezvousTracker.setConsoleOutput(outputLevel);
    }

    /**
     * Sends a call you the RendezvousTracker to clear the current rendezvous history
     */
    public clearRendezvousHistory() {
        this.rendezvousTracker.clearRendezvousHistory();
    }
    // #endregion
}

export interface StackFrame {
    frameId: number;
    frameIndex: number;
    threadIndex: number;
    filePath: string;
    lineNumber: number;
    functionIdentifier: string;
}

export enum EventName {
    suspend = 'suspend'
}

export enum HighLevelType {
    primative = 'primative',
    array = 'array',
    function = 'function',
    object = 'object',
    uninitialized = 'uninitialized'
}

export interface EvaluateContainer {
    name: string;
    evaluateName: string;
    variablePath: string[];
    type: string;
    value: string;
    keyType: KeyType;
    elementCount: number;
    highLevelType: HighLevelType;
    children: EvaluateContainer[];
}

export enum KeyType {
    string = 'String',
    integer = 'Integer',
    legacy = 'Legacy'
}

export interface Thread {
    isSelected: boolean;
    lineNumber: number;
    filePath: string;
    functionName: string;
    lineContents: string;
    threadId: number;
}

export enum PrimativeType {
    invalid = 'Invalid',
    boolean = 'Boolean',
    string = 'String',
    integer = 'Integer',
    float = 'Float'
}

export class RequestPipeline {
    constructor(
        private client: Socket
    ) {
        this.debuggerLineRegex = /Brightscript\s+Debugger>\s*$/i;
        this.connect();
    }

    private requests: RequestPipelineRequest[] = [];
    private debuggerLineRegex: RegExp;
    private isAtDebuggerPrompt: boolean = false;

    private get isProcessing() {
        return this.currentRequest !== undefined;
    }

    private get hasRequests() {
        return this.requests.length > 0;
    }

    private currentRequest: RequestPipelineRequest = undefined;

    private emitter = new EventEmitter();

    public on(eventName: 'unhandled-console-output' | 'console-output', handler: (data: string) => void);
    public on(eventName: string, handler: (data: string) => void) {
        this.emitter.on(eventName, handler);
        return () => {
            this.emitter.removeListener(eventName, handler);
        };
    }

    private emit(eventName: 'unhandled-console-output' | 'console-output', data: string) {
        this.emitter.emit(eventName, data);
    }

    private connect() {
        let allResponseText = '';
        let lastPartialLine = '';

        this.client.addListener('data', (data) => {
            let responseText = data.toString();
            if (!responseText.endsWith('\n') && !this.checkForDebuggerPrompt(responseText)) {
                // buffer was split and was not the result of a prompt, save the partial line
                lastPartialLine += responseText;
            } else {
                if (lastPartialLine) {
                    // there was leftover lines, join the partial lines back together
                    responseText = lastPartialLine + responseText;
                    lastPartialLine = '';
                }

                //forward all raw console output
                this.emit('console-output', responseText);
                allResponseText += responseText;

                let foundDebuggerPrompt = this.checkForDebuggerPrompt(allResponseText);

                //if we are not processing, immediately broadcast the latest data
                if (!this.isProcessing) {
                    this.emit('unhandled-console-output', allResponseText);
                    allResponseText = '';

                    if (foundDebuggerPrompt) {
                        this.isAtDebuggerPrompt = true;
                        if (this.hasRequests) {
                            // There are requests waiting to be processed
                            this.process();
                        }
                    }
                } else {
                    //if responseText produced a prompt, return the responseText
                    if (foundDebuggerPrompt) {
                        //resolve the command's promise (if it cares)
                        this.isAtDebuggerPrompt = true;
                        this.currentRequest.onComplete(allResponseText);
                        allResponseText = '';
                        this.currentRequest = undefined;
                        //try to run the next request
                        this.process();
                    }
                }
            }
        });
    }

    /**
     * Checks the supplied string for the debugger input prompt
     * @param responseText
     */
    private checkForDebuggerPrompt(responseText: string) {
        let match = this.debuggerLineRegex.exec(responseText.trim());
        return (match);
    }

    /**
     * Schedule a command to be run. Resolves with the result once the command finishes
     * @param commandFunction
     * @param waitForPrompt - if true, the promise will wait until we find a prompt, and return all output in between. If false, the promise will immediately resolve
     * @param forceExecute - if true, it is assumed the command can be run at any time and will be executed immediately
     * @param silent - if true, the command will be hidden from the output
     */
    public executeCommand(command: string, waitForPrompt: boolean, forceExecute: boolean = false, silent: boolean = false) {
        console.debug(`Execute command (and ${waitForPrompt ? 'do' : 'do not'} wait for prompt):`, command);
        return new Promise<string>((resolve, reject) => {
            let executeCommand = () => {
                let commandText = `${command}\r\n`;
                if (!silent) {
                    this.emit('console-output', command);
                }
                this.client.write(commandText);
                if (waitForPrompt) {
                    // The act of executing this command means we are no longer at the debug prompt
                    this.isAtDebuggerPrompt = false;
                }
            };

            let request = {
                executeCommand: executeCommand,
                onComplete: (data) => {
                    console.debug(`Command finished (${waitForPrompt ? 'after waiting for prompt' : 'did not wait for prompt'}`, command);
                    console.debug('Data:', data);
                    resolve(data);
                },
                waitForPrompt: waitForPrompt,
            };

            if (!waitForPrompt) {
                if (!this.isProcessing || forceExecute) {
                    //fire and forget the command
                    request.executeCommand();
                    //the command doesn't care about the output, resolve it immediately
                    request.onComplete(undefined);
                } else {
                    // Skip this request as the device is not ready to accept the command or it can not be run at any time
                }
            } else {
                this.requests.push(request);
                if (this.isAtDebuggerPrompt) {
                    //start processing since we are already at a debug prompt (safe to call multiple times)
                    this.process();
                } else {
                    // do not run the command until the device is at a debug prompt.
                    // this will be detected in the data listener in the connect function
                }
            }
        });
    }

    /**
     * Internal request processing function
     */
    private async process() {
        if (this.isProcessing || !this.hasRequests) {
            return;
        }

        //get the oldest command
        let nextRequest = this.requests.shift();
        this.currentRequest = nextRequest;

        //run the request. the data listener will handle launching the next request once this one has finished processing
        nextRequest.executeCommand();
    }

    public destroy() {
        this.client.removeAllListeners();
        this.client.destroy();
        this.client = undefined;
    }
}

interface RequestPipelineRequest {
    executeCommand: () => void;
    onComplete: (data: string) => void;
    waitForPrompt: boolean;
}

interface BrightScriptRuntimeError {
    message: string;
    errorCode: string;
}

export interface BrightScriptDebugCompileError {
    path: string;
    lineNumber: number;
    message: string;
    errorText: string;
    charStart: number;
    charEnd: number;
}

export enum RokuAdapterStatus {
    none = 'none',
    compiling = 'compiling',
    compileError = 'compileError',
    running = 'running'
}
