import * as eol from 'eol';
import * as EventEmitter from 'events';
import { orderBy } from 'natural-orderby';
import { Socket } from 'net';
import * as net from 'net';
import * as rokuDeploy from 'roku-deploy';

import { defer } from './BrightScriptDebugSession';
import { PrintedObjectParser } from './PrintedObjectParser';
import { RendezvousHistory, RendezvousTracker } from './RendezvousTracker';
import { SourceLocation } from './SourceLocator';
import { util } from './util';

/**
 * A class that connects to a Roku device over telnet debugger port and provides a standardized way of interacting with it.
 */
export class RokuTelnetAdapter {
    constructor(
        private host: string,
        private enableDebuggerAutoRecovery: boolean = false
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
    /**
     * Every time we get a message that ends with the debugger prompt,
     * this will be set to true. Otherwise, it will be set to false
     */
    public isAtDebuggerPrompt = false;

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

    /**
     * Connect to the telnet session. This should be called before the channel is launched.
     */
    public async connect() {
        let deferred = defer();
        this.isInMicroDebugger = false;
        this.isNextBreakpointSkipped = false;
        try {
            //force roku to return to home screen. This gives the roku adapter some security in knowing new messages won't be appearing during initialization
            await rokuDeploy.pressHomeButton(this.host);
            let client: Socket = new net.Socket();

            client.connect(8085, this.host, (err, data) => {
                console.log(`+++++++++++ CONNECTED TO DEVICE ${this.host} +++++++++++`);
                this.connected = true;
                this.emit('connected', this.connected);
            });

            //listen for the close event
            client.addListener('close', (err, data) => {
                this.emit('close');
            });

            //if the connection fails, reject the connect promise
            client.addListener('error', (err) => {
                deferred.reject(new Error(`Error with connection to: ${this.host} \n\n ${err.message}`));
            });

            await this.settle(client, 'data');

            //hook up the pipeline to the socket
            this.requestPipeline = new RequestPipeline(client);

            //forward all raw console output
            this.requestPipeline.on('console-output', (output) => {
                this.processBreakpoints(output);
                if (output) {
                    this.emit('console-output', output);
                }
            });

            //listen for any console output that was not handled by other methods in the adapter
            this.requestPipeline.on('unhandled-console-output', async (responseText: string) => {
                //if there was a runtime error, handle it
                let hasRuntimeError = this.checkForRuntimeError(responseText);

                responseText = await this.rendezvousTracker.processLogLine(responseText);
                //forward all unhandled console output
                this.processBreakpoints(responseText);
                if (responseText) {
                    this.emit('unhandled-console-output', responseText);
                }

                // short circuit after the output has been sent as console output
                if (hasRuntimeError) {
                    console.debug('hasRuntimeError!!');
                    this.isAtDebuggerPrompt = true;
                    return;
                }

                this.processUnhandledLines(responseText);
                let match;

                if (this.isAtCannotContinue(responseText)) {
                    this.isAtDebuggerPrompt = true;
                    return;
                }

                if (this.isActivated) {
                    //watch for the start of the program
                    if (match = /\[scrpt.ctx.run.enter\]/i.exec(responseText.trim())) {
                        this.isAppRunning = true;
                        this.handleStartupIfReady();
                    }

                    //watch for the end of the program
                    if (match = /\[beacon.report\] \|AppExitComplete/i.exec(responseText.trim())) {
                        this.beginAppExit();
                    }

                    //watch for debugger prompt output
                    if (match = /Brightscript\s*Debugger>\s*$/i.exec(responseText.trim())) {
                        //if we are activated AND this is the first time seeing the debugger prompt since a continue/step action
                        if (this.isNextBreakpointSkipped) {
                            console.log('this breakpoint is flagged to be skipped');
                            this.isInMicroDebugger = false;
                            this.isNextBreakpointSkipped = false;
                            this.requestPipeline.executeCommand('c', false, false, false);
                        } else {
                            if (this.isActivated && this.isAtDebuggerPrompt === false) {
                                this.isAtDebuggerPrompt = true;
                                this.emit('suspend');
                            } else {
                                this.isAtDebuggerPrompt = true;
                            }
                        }
                    } else {
                        this.isAtDebuggerPrompt = false;
                    }
                }
            });

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
    public stepOver() {
        this.clearCache();
        return this.requestPipeline.executeCommand('over', false);
    }

    public stepInto() {
        this.clearCache();
        return this.requestPipeline.executeCommand('step', false);
    }

    public stepOut() {
        this.clearCache();
        return this.requestPipeline.executeCommand('out', false);

    }

    /**
     * Tell the brightscript program to continue (i.e. resume program)
     */
    public continue() {
        this.clearCache();
        return this.requestPipeline.executeCommand('c', false);
    }

    /**
     * Tell the brightscript program to pause (fall into debug mode)
     */
    public pause() {
        this.clearCache();
        //send the kill signal, which breaks into debugger mode
        return this.requestPipeline.executeCommand('\x03;', false, true);
    }

    /**
     * Clears the state, which means that everything will be retrieved fresh next time it is requested
     */
    public clearCache() {
        this.cache = {};
        this.isAtDebuggerPrompt = false;
    }

    /**
     * Execute a command directly on the roku. Returns the output of the command
     * @param command
     */
    public async evaluate(command: string) {
        if (!this.isAtDebuggerPrompt) {
            throw new Error('Cannot run evaluate: debugger is not paused');
        }
        //clear the cache (we don't know what command the user entered)
        this.clearCache();
        //don't wait for the output...we don't know what command the user entered
        let responseText = await this.requestPipeline.executeCommand(command, true);
        //we know that if we got a response, we are back at a debugger prompt
        this.isAtDebuggerPrompt = true;
        return responseText;
    }

    public async getStackTrace() {
        if (!this.isAtDebuggerPrompt) {
            throw new Error('Cannot get stack trace: debugger is not paused');
        }
        return await this.resolve('stackTrace', async () => {
            //perform a request to load the stack trace
            let responseText = await this.requestPipeline.executeCommand('bt', true);
            let regexp = /#(\d+)\s+(?:function|sub)\s+([\$\w\d]+).*\s+file\/line:\s+(.*)\((\d+)\)/ig;
            let matches;
            let frames: StackFrame[] = [];
            while (matches = regexp.exec(responseText)) {
                //the first index is the whole string
                //then the matches should be in pairs
                for (let i = 1; i < matches.length; i = i + 4) {
                    let j = 1;
                    let frameId = parseInt(matches[i]);
                    let functionIdentifier = matches[i + j++];
                    let filePath = matches[i + j++];
                    let lineNumber = parseInt(matches[i + j++]);
                    let frame: StackFrame = {
                        frameId: frameId,
                        filePath: filePath,
                        lineNumber: lineNumber,
                        functionIdentifier: functionIdentifier
                    };
                    frames.push(frame);
                }
            }
            //if we didn't find frames yet, then there's not much more we can do...
            return frames;
        });
    }

    /**
     * Runs a regex to get the content between telnet commands
     * @param value
     */
    public getExpressionDetails(value: string) {
        const match = /(.*?)\r?\nBrightscript Debugger>\s*/is.exec(value);
        if (match) {
            return match[1];
        }
    }

    /**
     * Runs a regex to check if the target is an object and get the type if it is
     * @param value
     */
    public getObjectType(value: string) {
        const match = /<.*?:\s*(\w+\s*\:*\s*[\w\.]*)>/gi.exec(value);
        if (match) {
            return match[1];
        } else {
            return null;
        }
    }

    /**
     * Runs a regex to get the first work of a line
     * @param value
     */
    private getFirstWord(value: string) {
        return /^([\w.\-=]*)\s/.exec(value);
    }

    /**
     * Gets a string array of all the local variables using the var command
     * @param scope
     */
    public async getScopeVariables(scope?: string) {
        if (!this.isAtDebuggerPrompt) {
            throw new Error('Cannot resolve variable: debugger is not paused');
        }
        return await this.resolve(`Scope Variables`, async () => {
            let data: string;
            let vars = [];

            data = await this.requestPipeline.executeCommand(`var`, true);
            let splitData = data.split('\n');

            splitData.forEach((line) => {
                let match;
                if (!line.includes('Brightscript Debugger') && (match = this.getFirstWord(line))) {
                    // There seems to be a local ifGlobal interface variable under the name of 'global' but it
                    // is not accessible by the channel. Stript it our.
                    if ((match[1] !== 'global') && match[1].length > 0) {
                        vars.push(match[1]);
                    }
                }
            });
            return vars;
        });
    }

    /**
     * Given an expression, evaluate that statement ON the roku
     * @param expression
     */
    public async getVariable(expression: string) {
        if (!this.isAtDebuggerPrompt) {
            throw new Error('Cannot resolve variable: debugger is not paused');
        }
        return await this.resolve(`variable: ${expression}`, async () => {
            let expressionType = await this.getVariableType(expression);

            let lowerExpressionType = expressionType ? expressionType.toLowerCase() : null;

            let data: string;
            //if the expression type is a string, we need to wrap the expression in quotes BEFORE we run the print so we can accurately capture the full string value
            if (lowerExpressionType === 'string' || lowerExpressionType === 'rostring') {
                data = await this.requestPipeline.executeCommand(`print "--string-wrap--" + ${expression} + "--string-wrap--"`, true);

                //write a for loop to print every value from the array. This gets around the `...` after the 100th item issue in the roku print call
            } else if (['roarray', 'rolist', 'robytearray'].indexOf(lowerExpressionType) > -1) {
                data = await this.requestPipeline.executeCommand(
                    `for each vscodeLoopItem in ${expression} : print "vscode_is_string:"; (invalid <> GetInterface(vscodeLoopItem, "ifString")); vscodeLoopItem : end for`
                    , true);
            } else if (['roassociativearray', 'rosgnode'].indexOf(lowerExpressionType) > -1) {
                data = await this.requestPipeline.executeCommand(
                    `for each vscodeLoopKey in ${expression}.keys() : print "vscode_key_start:" + vscodeLoopKey + ":vscode_key_stop " + "vscode_is_string:"; (invalid <> GetInterface(${expression}[vscodeLoopKey], "ifString")); ${expression}[vscodeLoopKey] : end for`,
                    true);
            } else {
                data = await this.requestPipeline.executeCommand(`print ${expression}`, true);
            }

            let match = this.getExpressionDetails(data);
            if (match !== undefined) {
                let value = match;
                if (lowerExpressionType === 'string' || lowerExpressionType === 'rostring') {
                    value = value.trim().replace(/--string-wrap--/g, '');
                    //add an escape character in front of any existing quotes
                    value = value.replace(/"/g, '\\"');
                    //wrap the string value with literal quote marks
                    value = '"' + value + '"';
                }
                let highLevelType = this.getHighLevelType(expressionType);

                let children: EvaluateContainer[];
                if (highLevelType === HighLevelType.array || ['roassociativearray', 'rosgnode', 'robytearray'].indexOf(lowerExpressionType) > -1) {
                    //the print statment will always have 1 trailing newline, so remove that.
                    value = util.removeTrailingNewline(value);
                    //the array/associative array print is a loop of every value, so handle that
                    children = this.getForLoopPrintedChildren(expression, value);
                } else if (highLevelType === HighLevelType.object) {
                    children = this.getObjectChildren(expression, value.trim());
                }

                //add a computed `[[children]]` property to allow expansion of node children
                if (lowerExpressionType === 'rosgnode') {
                    let nodeChildren = <EvaluateContainer>{
                        name: '[[children]]',
                        type: 'roArray',
                        highLevelType: 'array',
                        evaluateName: `${expression}.getChildren(-1,0)`,
                        children: []
                    };
                    children.push(nodeChildren);
                }

                //if this item is an array or a list, add the item count to the end of the type
                if (highLevelType === HighLevelType.array) {
                    //TODO re-enable once we find how to refresh watch/variables panel, since lazy loaded arrays can't show a length
                    //expressionType += `(${children.length})`;
                }

                let container = <EvaluateContainer>{
                    name: expression,
                    evaluateName: expression,
                    type: expressionType,
                    value: value.trim(),
                    highLevelType: highLevelType,
                    children: children
                };
                return container;
            }
        });
    }

    /**
     * In order to get around the `...` issue in printed arrays, `getVariable` now prints every value from an array or associative array in a for loop.
     * As such, we need to iterate over every printed result to produce the children array
     */
    public getForLoopPrintedChildren(expression: string, data: string) {
        let children = [] as EvaluateContainer[];
        let lines = eol.split(data);
        //if there are no lines, this is an empty object/array
        if (lines.length === 1 && lines[0].trim() === '') {
            return children;
        }
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            let line = lines[lineIndex];

            let keyStartWrapper = 'vscode_key_start:';
            let keyStopWrapper = ':vscode_key_stop ';

            let child = <EvaluateContainer>{
                children: []
            };

            const keyStartIdx = line.indexOf(keyStartWrapper);
            //if the key is present, extract it
            if (keyStartIdx > -1) {
                child.name = line.substring(keyStartIdx + keyStartWrapper.length, line.indexOf(keyStopWrapper));
                child.evaluateName = `${expression}["${child.name}"]`;

                //throw out the key chunk
                line = line.substring(line.indexOf(keyStopWrapper) + keyStopWrapper.length);

            } else {
                child.name = children.length.toString();
                child.evaluateName = `${expression}[${children.length}]`;
            }

            if (line.indexOf('vscode_is_string:true') > -1) {
                line = line.replace('vscode_is_string:true', '');
                //support multi-line strings
                let stringLines = [line];

                //go one past the final line so that we can more easily detect the end of the input
                stringInner: for (lineIndex = lineIndex; lineIndex < lines.length; lineIndex++) {
                    //go one past (since we already have current line. Also, because we want to run off the end of the list
                    //so we can know there are no more lines
                    let nextLine = lines[lineIndex + 1];
                    if (nextLine === undefined || nextLine && nextLine.trimLeft().indexOf('vscode_') === 0) {
                        break stringInner;
                    } else {
                        stringLines.push(nextLine);
                    }
                }
                line = '"' + stringLines.join('\n') + '"';
            } else {
                line = line.replace('vscode_is_string:false', '');
            }

            //skip empty lines
            if (line.trim() === '') {
                continue;
            }

            const objectType = this.getObjectType(line);
            const isRoSGNode = objectType && objectType.indexOf('roSGNode') === 0;
            //handle collections
            if (['roList', 'roArray', 'roAssociativeArray', 'roByteArray'].indexOf(objectType) > -1 || isRoSGNode) {
                let collectionEnd: ')' | ']' | '}';
                if (line.indexOf('<Component: roList>') > -1) {
                    collectionEnd = ')';
                    child.highLevelType = HighLevelType.array;
                    child.type = objectType;
                } else if (line.indexOf('<Component: roArray>') > -1) {
                    collectionEnd = ']';
                    child.highLevelType = HighLevelType.array;
                    child.type = this.getObjectType(line);
                } else if (line.indexOf('<Component: roByteArray>') > -1) {
                    collectionEnd = ']';
                    child.highLevelType = HighLevelType.array;
                    child.type = this.getObjectType(line);
                } else if (line.indexOf('<Component: roAssociativeArray>') > -1 || isRoSGNode) {
                    collectionEnd = '}';
                    child.highLevelType = HighLevelType.object;
                    child.type = this.getObjectType(line);
                }

                let collectionLineList = [line];
                inner: for (lineIndex = lineIndex + 1; lineIndex < lines.length; lineIndex++) {
                    let innerLine = lines[lineIndex];

                    collectionLineList.push(lines[lineIndex]);

                    //stop collecting lines
                    if (innerLine.trim() === collectionEnd) {
                        break inner;
                    }
                }
                //if the next-to-last line of collection is `...`, then scrap the values
                //because we will need to run a full evaluation (later) to get around the `...` issue
                if (collectionLineList.length > 3 && collectionLineList[collectionLineList.length - 2].trim() === '...') {
                    child.children = [];

                    //get the object children
                } else if (child.highLevelType === HighLevelType.object) {
                    child.children = this.getObjectChildren(child.evaluateName, collectionLineList.join('\n'));

                    //get all of the array children right now since we have them
                } else {
                    child.children = this.getArrayOrListChildren(child.evaluateName, collectionLineList.join('\n'));
                    child.type += `(${child.children.length})`;
                }
                if (isRoSGNode) {
                    let nodeChildrenProperty = <EvaluateContainer>{
                        name: '[[children]]',
                        type: 'roArray',
                        highLevelType: 'array',
                        evaluateName: `${child.evaluateName}.getChildren(-1,0)`,
                        children: []
                    };
                    child.children.push(nodeChildrenProperty);
                }

                //this if block must preseec the `line.indexOf('<Component') > -1` line because roInvalid is a component too.
            } else if (objectType === 'roInvalid') {
                child.highLevelType = HighLevelType.uninitialized;
                child.type = 'roInvalid';
                child.value = 'roInvalid';
                child.children = undefined;

            } else if (line.indexOf('<Component:') > -1) {
                //handle things like nodes
                child.highLevelType = HighLevelType.object;
                child.type = objectType;

            } else {
                //is some primative type
                child.type = this.getPrimativeTypeFromValue(line);
                child.value = line.trim();
                child.highLevelType = HighLevelType.primative;
                child.children = undefined;
            }
            children.push(child);
        }
        let sortedChildren = orderBy(children, ['name']);
        return sortedChildren;
    }

    /**
     * Get all of the children of an array or list
     */
    private getArrayOrListChildren(expression: string, data: string): EvaluateContainer[] {
        let collectionEnd: string;

        //this function can handle roArray and roList objects, but we need to know which it is
        if (data.indexOf('<Component: roList>') === 0) {
            collectionEnd = ')';

            //array
        } else {
            collectionEnd = ']';
        }
        let children = [] as EvaluateContainer[];
        //split by newline. the array contents start at index 2
        let lines = eol.split(data);
        let arrayIndex = 0;
        for (let i = 2; i < lines.length; i++) {
            let line = lines[i].trim();
            if (line === collectionEnd) {
                return children;
            }
            let child = <EvaluateContainer>{
                name: arrayIndex.toString(),
                evaluateName: `${expression}[${arrayIndex}]`,
                children: []
            };

            //if the line is an object, array or function
            let match;
            if (match = this.getObjectType(line)) {
                let type = match;
                child.type = type;
                child.highLevelType = this.getHighLevelType(type);
                child.value = type;
            } else {
                child.type = this.getPrimativeTypeFromValue(line);
                child.value = line;
                child.highLevelType = HighLevelType.primative;
            }
            children.push(child);
            arrayIndex++;
        }
        throw new Error('Unable to parse BrightScript array');
    }

    private getPrimativeTypeFromValue(value: string): PrimativeType {
        value = value ? value.toLowerCase() : value;
        if (!value || value === 'invalid') {
            return PrimativeType.invalid;
        }
        if (value === 'true' || value === 'false') {
            return PrimativeType.boolean;
        }
        if (value.indexOf('"') > -1) {
            return PrimativeType.string;
        }
        if (value.split('.').length > 1) {
            return PrimativeType.integer;
        } else {
            return PrimativeType.float;
        }

    }

    private getObjectChildren(expression: string, data: string): EvaluateContainer[] {
        try {
            let children: EvaluateContainer[] = [];
            //split by newline. the object contents start at index 2
            let lines = eol.split(data);
            for (let i = 2; i < lines.length; i++) {
                let line = lines[i];
                let trimmedLine = line.trim();

                //if this is the end of the object, we are finished collecting children. exit
                if (trimmedLine === '}') {
                    return children;
                }
                let child: EvaluateContainer;
                //parse the line (try and determine the key and value)
                let lineParseResult = new PrintedObjectParser(line).result;
                if (!lineParseResult) {
                    //skip this line because something strange happened, or we encountered the `...`
                    child = {
                        name: line,
                        type: '<ERROR>',
                        highLevelType: HighLevelType.uninitialized,
                        evaluateName: undefined,
                        variablePath: [],
                        elementCount: -1,
                        value: '<ERROR>',
                        keyType: KeyType.legacy,
                        children: []
                    };
                } else {
                    child = <EvaluateContainer>{
                        name: lineParseResult.key,
                        evaluateName: `${expression}.${lineParseResult.key}`,
                        children: []
                    };

                    const type = this.getObjectType(trimmedLine);
                    //if the line is an object, array or function
                    if (type) {
                        child.type = type;
                        child.highLevelType = this.getHighLevelType(type);
                        child.value = type;
                    } else {
                        child.type = this.getPrimativeTypeFromValue(trimmedLine);
                        child.value = lineParseResult.value;
                        child.highLevelType = HighLevelType.primative;
                    }
                }

                children.push(child);
            }
            return children;
        } catch (e) {
            throw new Error(`Unable to parse BrightScript object: ${e.message}. Data: ${data}`);
        }
    }

    /**
     * Determine if this value is a primative type
     * @param expressionType
     */
    private getHighLevelType(expressionType: string) {
        if (!expressionType) {
            throw new Error(`Unknown expression type: ${expressionType}`);
        }

        expressionType = expressionType.toLowerCase();
        let primativeTypes = ['boolean', 'integer', 'longinteger', 'float', 'double', 'string', 'rostring', 'invalid'];
        if (primativeTypes.indexOf(expressionType) > -1) {
            return HighLevelType.primative;
        } else if (expressionType === 'roarray' || expressionType === 'rolist') {
            return HighLevelType.array;
        } else if (expressionType === 'function') {
            return HighLevelType.function;
        } else if (expressionType === '<uninitialized>') {
            return HighLevelType.uninitialized;
        } else {
            return HighLevelType.object;
        }
    }

    /**
     * Get the type of the provided expression
     * @param expression
     */
    public async getVariableType(expression) {
        if (!this.isAtDebuggerPrompt) {
            throw new Error('Cannot get variable type: debugger is not paused');
        }
        expression = `Type(${expression})`;
        return await this.resolve(`${expression}`, async () => {
            let data = await this.requestPipeline.executeCommand(`print ${expression}`, true);

            let match;
            if (match = this.getExpressionDetails(data)) {
                let typeValue: string = match;
                //remove whitespace
                typeValue = typeValue.trim();
                return typeValue;
            } else {
                return null;
            }
        });
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
            let data = await this.requestPipeline.executeCommand('threads', true);

            let dataString = data.toString();
            let matches;
            let threads: Thread[] = [];
            if (matches = /^\s+(\d+\*)\s+(.*)\((\d+)\)\s+(.*)/gm.exec(dataString)) {
                //skip index 0 because it's the whole string
                for (let i = 1; i < matches.length; i = i + 4) {
                    let threadId: string = matches[i];
                    let thread = <Thread>{
                        isSelected: false,
                        filePath: matches[i + 1],
                        lineNumber: parseInt(matches[i + 2]),
                        lineContents: matches[i + 3]
                    };
                    if (threadId.indexOf('*') > -1) {
                        thread.isSelected = true;
                        threadId = threadId.replace('*', '');
                    }
                    thread.threadId = parseInt(threadId);
                    threads.push(thread);
                }
                //make sure the selected thread is at the top
                threads.sort((a, b) => {
                    return a.isSelected ? -1 : 1;
                });
            }
            return threads;
        });
    }

    /**
     * Disconnect from the telnet session and unset all objects
     */
    public async destroy() {
        if (this.requestPipeline) {
            await this.exitActiveBrightscriptDebugger();
            this.requestPipeline.destroy();
        }

        this.requestPipeline = undefined;
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
        if (this.requestPipeline) {
            let commandsExecuted = 0;
            do {
                let data = await this.requestPipeline.executeCommand(`exit`, false);
                // This seems to work without the delay but I wonder about slower devices
                // await setTimeout[Object.getOwnPropertySymbols(setTimeout)[0]](100);
                commandsExecuted++;
            } while (commandsExecuted < 10);
        }
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
