import { Socket } from "net";
import * as EventEmitter from 'events';
import * as eol from 'eol';


/**
 * A class that connects to a Roku device over telnet debugger port and provides a standardized way of interacting with it.
 */
export class RokuAdapter {
    constructor(private host: string) {
        this.emitter = new EventEmitter();
    }
    private client: Socket;
    private emitter: EventEmitter;

    private state: DebugState = <any>{
        expressions: {}
    };

    /**
     * Subscribe to various events
     * @param eventName 
     * @param handler 
     */
    public on(eventName: 'suspend', handler: (threadId: number) => void)
    public on(eventName: 'compile-error', handler: (params: { path: string; lineNumber: number; }) => void)
    public on(eventName: 'close', handler: () => void)
    public on(eventName: string, handler: (payload: any) => void) {
        this.emitter.on(eventName, handler);
        return () => {
            this.emitter.removeListener(eventName, handler);
        };
    }

    /**
     * Add a listener to the client, and provide an easy disconnect 
     * @param name 
     * @param listener 
     */
    private addListener(name: string, listener: any) {
        this.client.on(name, listener);
        return () => {
            this.client.removeListener(name, listener);
        };
    }

    private emit(eventName: 'suspend' | 'compile-error' | 'close', data?) {
        this.emitter.emit(eventName, data);
    }

    private clientDisconnectors: any[] = [];

    /**
     * The debugger needs to tell us when to be active (i.e. when the package was deployed)
     */
    public isActivated = false;
    /**
     * Every time we get a message that ends with the debugger prompt, 
     * this will be set to true. Otherwise, it will be set to false
     */
    public isAtDebuggerPrompt = false;
    public async activate() {
        this.isActivated = true;
        //if we are already sitting at a debugger prompt, we need to emit the first suspend event.
        //If not, then there are probably still messages being received, so let the normal handler
        //emit the suspend event when it's ready
        if (this.isAtDebuggerPrompt === true) {
            let threads = await this.getThreads();
            this.emit('suspend', threads[0].threadId);

        }
    }

    /**
     * Connect to the telnet session. This should be called before the channel is launched, and there should be a breakpoint set at the first
     * line of the entry function of the source code
     */
    public connect() {
        return new Promise((resolve, reject) => {
            var net = require('net');
            this.client = new net.Socket();

            this.client.connect(8085, this.host, (err, data) => {
                let k = 2;
            });
            let resolved = false;
            this.clientDisconnectors.push(
                this.addListener('data', async (data) => {
                    //resolve the connection once the data events have settled
                    if (!resolved) {
                        resolved = true;
                        resolve();
                        return;
                    }
                    let dataString = data.toString();
                    let match;

                    //watch for compile errors
                    if (match = /compile error.* in (.*)\((\d+)\)/i.exec(dataString)) {
                        let path = match[1];
                        let lineNumber = match[2];
                        this.emit('compile-error', { path, lineNumber });
                    }

                    if (this.isActivated) {
                        //console.log(dataString);

                        //we are guaranteed that there will be a breakpoint on the first line of the entry sub, so
                        //wait until we see the brightscript debugger prompt
                        if (match = /Brightscript\s+Debugger>\s+$/i.exec(dataString)) {
                            this.isAtDebuggerPrompt = true;
                            if (this.isActivated) {
                                let threads = await this.getThreads();
                                this.emit('suspend', threads[0].threadId);
                            }
                        } else {
                            this.isAtDebuggerPrompt = false;
                        }
                    }
                })
            );

            this.clientDisconnectors.push(
                this.addListener('close', (err, data) => {
                    this.emit('close');
                })
            );

            //if the connection fails, reject the connect promise
            this.clientDisconnectors.push(
                this.addListener('error', function (err) {
                    //this.emit(EventName.error, err);
                    reject(err);
                })
            );
        });
    }

    /**
     * Send command to step over
     */
    public stepOver() {
        return new Promise((resolve, reject) => {
            this.clearState();
            this.client.write('over\r\n', 'utf8', (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });
    }

    public stepInto() {
        return new Promise((resolve, reject) => {
            this.clearState();
            this.client.write('step\r\n', 'utf8', (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });
    }

    public stepOut() {
        return new Promise((resolve, reject) => {
            this.clearState();
            this.client.write('out\r\n', 'utf8', (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });
    }

    /**
     * Tell the brightscript program to continue (i.e. resume program)
     */
    public continue() {
        return new Promise((resolve, reject) => {
            this.clearState();
            this.client.write('c\r\n', 'utf8', (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });
    }

    /**
     * Tell the brightscript program to pause (fall into debug mode)
     */
    public pause() {
        return new Promise((resolve, reject) => {
            this.clearState();
            //send the kill signal, which breaks into debugger mode
            this.client.write('\x03;\r\n', 'utf8', (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });
    }

    /**
     * Clears the state, which means that everything will be retrieved fresh next time it is requested
     */
    public clearState() {
        this.state = <any>{
            expressions: {}
        };
    }

    public getStackTrace() {
        if (this.state.stackTrace) {
            return this.state.stackTrace;
        }
        return this.state.stackTrace = new Promise((resolve, reject) => {
            let allData = '';
            //perform a request to load the stack trace
            let disconnect = this.addListener('data', (data) => {
                //collect incoming data until it looks like what we were expecting
                allData = allData + data.toString();
                let regexp = /#(\d+)\s+(?:function|sub)\s+([\w\d]+).*\s+file\/line:\s+(.*)\((\d+)\)/ig;
                let matches;
                let frames: StackFrame[] = [];
                while (matches = regexp.exec(allData)) {
                    //the first index is the whole string
                    //then the matches should be in pairs
                    for (let i = 1; i < matches.length; i = i + 4) {
                        let j = 1;
                        let frameId = parseInt(matches[i]);
                        let functionIdentifier = matches[i + j++]
                        let filePath = matches[i + j++];
                        let lineNumber = parseInt(matches[i + j++]);
                        let frame: StackFrame = {
                            frameId,
                            filePath,
                            lineNumber,
                            functionIdentifier
                        }
                        frames.push(frame);
                    }
                }
                //if we didn't find frames yet, hope that the next data call will bring some
                if (frames.length === 0) {
                    return;
                }
                disconnect();
                resolve(frames);
            });
            this.client.write(new Buffer('bt\r\n', 'utf8'));
        });
    }

    /**
     * Get data from the server. Let the callbacks settle before resolving
     */
    private getData() {
        return new Promise<string>((resolve) => {
            let allData = '';
            let disconnect = this.addListener('data', (data) => {
                allData += data.toString();
                var match;
                //if data is stopped at the prompt, return the data
                if (match = /Brightscript\s+Debugger>\s+$/i.exec(allData)) {
                    disconnect();
                    resolve(allData);
                }
            });
        });
    }

    private execute(command: string) {
        return new Promise<string>((resolve, reject) => {
            let dataPromise = this.getData();
            this.client.write(`${command}\r\n`, 'utf8', (err, data) => {
                if (err) {
                    reject(err);
                }
            });
            resolve(dataPromise);
        });
    }

    private expressionRegex = /([\s|\S]+?)(?:\r|\r\n)+brightscript debugger>/i;
    /**
     * Given an expression, evaluate that statement ON the roku
     * @param expression
     */
    public async evaluate(expression: string) {
        //return this.expressionResolve(`${expression}`, async () => {
        let expressionType = await this.getType(expression);

        let lowerExpressionType = expressionType ? expressionType.toLowerCase() : null;

        let data: string;
        //if the expression type is a string, we need to wrap the expression in quotes BEFORE we run the print so we can accurately capture the full string value
        if (lowerExpressionType === 'string') {
            data = await this.execute(`print "--string-wrap--" + ${expression} + "--string-wrap--"`);
        }
        else {
            data = await this.execute(`print ${expression}`);
        }

        let match;
        if (match = this.expressionRegex.exec(data)) {
            let value = match[1];
            if (lowerExpressionType === 'string') {
                value = value.trim().replace(/--string-wrap--/g, '');
                //add an escape character in front of any existing quotes
                value = value.replace(/"/g, '\\"');
                //wrap the string value with literal quote marks
                value = '"' + value + '"';
            } else {
                value = value.trim();
            }

            let highLevelType = this.getHighLevelType(expressionType);

            let children: EvaluateContainer[];
            if (highLevelType === 'object') {
                children = this.getObjectChildren(expression, value);
            } else if (highLevelType === 'array') {
                children = this.getArrayChildren(expression, value);
            }

            let container = <EvaluateContainer>{
                name: expression,
                evaluateName: expression,
                type: expressionType,
                value: value,
                highLevelType,
                children
            };
            return container;
        }
        //});
    }

    getArrayChildren(expression: string, data: string): EvaluateContainer[] {
        let children: EvaluateContainer[] = [];
        //split by newline. the array contents start at index 2
        let lines = eol.split(data);
        let arrayIndex = 0;
        for (let i = 2; i < lines.length; i++) {
            let line = lines[i].trim();
            if (line === ']') {
                return children;
            }
            let child = <EvaluateContainer>{
                name: arrayIndex.toString(),
                evaluateName: `${expression}[${arrayIndex}]`,
                children: []
            };

            //if the line is an object, array or function
            let match;
            if (match = /<.*:\s+(\w*)>/gi.exec(line)) {
                let type = match[1];
                child.type = type;
                child.highLevelType = this.getHighLevelType(type);
                child.value = type;
            } else {
                child.type = this.getPrimativeTypeFromValue(line);
                child.value = line;
                child.highLevelType = 'primative';
            }
            children.push(child);
            arrayIndex++;
        }
        throw new Error('Unable to parse BrightScript array');
    }

    private getPrimativeTypeFromValue(value: string) {
        value = value ? value.toLowerCase() : value;
        if (!value || value === 'invalid') {
            return 'Invalid';
        }
        if (value === 'true' || value === 'false') {
            return 'Boolean';
        }
        if (value.indexOf('"') > -1) {
            return 'String';
        }
        if (value.split('.').length > 1) {
            return 'Integer';
        } else {
            return 'Float';
        }

    }

    getObjectChildren(expression: string, data: string): EvaluateContainer[] {
        let children: EvaluateContainer[] = [];
        //split by newline. the array contents start at index 2
        let lines = eol.split(data);
        for (let i = 2; i < lines.length; i++) {
            let line = lines[i].trim();
            if (line === '}') {
                return children;
            }
            let match;
            match = /(.*):(.*)/i.exec(line);
            let name = match[1].trim();
            let value = match[2].trim();

            let child = <EvaluateContainer>{
                name: name,
                evaluateName: `${expression}.${name}`,
                children: []
            };

            //if the line is an object, array or function
            if (match = /<.*:\s+(\w*)>/gi.exec(line)) {
                let type = match[1];
                child.type = type;
                child.highLevelType = this.getHighLevelType(type);
                child.value = type;
            } else {
                child.type = this.getPrimativeTypeFromValue(line);
                child.value = line;
                child.highLevelType = 'primative';
            }
            children.push(child);
        }
        throw new Error('Unable to parse BrightScript array');
    }

    /**
     * Determine if this value is a primative type
     * @param expressionType 
     */
    private getHighLevelType(expressionType: string) {
        if (!expressionType) {
            return 'unknown';
        }
        expressionType = expressionType.toLowerCase();
        let primativeTypes = ['boolean', 'integer', 'longinteger', 'float', 'double', 'string', 'invalid'];
        if (primativeTypes.indexOf(expressionType) > -1) {
            return 'primative';
        } else if (expressionType === 'roarray') {
            return 'array';
        } else if (expressionType === 'function') {
            return 'function'
        } else {
            return 'object';
        }
    }

    /**
     * Get the type of the provided expression
     * @param expression 
     */
    public async getType(expression) {
        expression = `Type(${expression})`;
        return this.expressionResolve(`${expression}`, async () => {
            let data = await this.execute(`print ${expression}`);

            let match;
            if (match = this.expressionRegex.exec(data)) {
                let typeValue: string = match[1];
                //remove whitespace
                typeValue = typeValue.trim();
                return typeValue;
            } else {
                return null;
            }
        });
    }

    /**
     * Caches the results of expressions in state
     * @param expression 
     * @param factory 
     */
    private expressionResolve<T>(expression: string, factory: () => T | Thenable<T>): Promise<T> {
        if (this.state.expressions[expression]) {
            return this.state.expressions[expression];
        }
        return this.state.expressions[expression] = Promise.resolve<T>(factory());
    }

    /**
     * Get a list of threads. The first thread in the list is the active thread
     */
    public getThreads(): Promise<Thread[]> {
        if (this.state.threads) {
            return this.state.threads;
        }
        return this.state.threads = new Promise((resolve, reject) => {
            let disconnect = this.addListener('data', (data) => {
                let dataString = data.toString();
                let matches;
                if (matches = /^\s+(\d+\*)\s+(.*)\((\d+)\)\s+(.*)/gm.exec(dataString)) {
                    let threads: Thread[] = [];
                    //skip index 0 because it's the whole string
                    for (let i = 1; i < matches.length; i = i + 4) {
                        let threadId: string = matches[i];
                        let thread = <Thread>{
                            isSelected: false,
                            filePath: matches[i + 1],
                            lineNumber: parseInt(matches[i + 2]),
                            lineContents: matches[i + 3]
                        }
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
                    disconnect();
                    resolve(threads);
                }
            });
            this.client.write('threads\r\n', 'utf8', (err) => {
                if (err) {
                    reject(err);
                }
            });
        });
    }

    /**
     * Disconnect from the telnet session and unset all objects
     */
    public destroy() {
        //disconnect all client listeners
        for (let disconnect of this.clientDisconnectors) {
            disconnect();
        }
        this.client.destroy();
        this.state = undefined;
        this.client = undefined;
        this.emitter.removeAllListeners();
        this.emitter = undefined;
    }
}

export interface DebugState {
    stackTrace: Promise<StackFrame[]>;
    expressions: { [expression: string]: Promise<any> };
    threads: Promise<Thread[]>;
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

export interface EvaluateContainer {
    name: string;
    evaluateName: string;
    type: string;
    value: string;
    highLevelType: 'primative' | 'object' | 'array' | 'function' | 'unknown';
    children: EvaluateContainer[];
}

export interface Thread {
    isSelected: boolean;
    lineNumber: number;
    filePath: string;
    lineContents: string;
    threadId: number;
}