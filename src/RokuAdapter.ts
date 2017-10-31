import { Socket } from "net";
import * as EventEmitter from 'events';

/**
 * A class that connects to a Roku device over telnet debugger port and provides a standardized way of interacting with it.
 */
export class RokuAdapter {
    constructor(private host: string) {
        this.emitter = new EventEmitter();
    }
    private client: Socket;
    private emitter: EventEmitter;

    private state: DebugState = <any>{};

    /**
     * Subscribe to various events
     * @param eventName 
     * @param handler 
     */
    public on(eventName: 'suspend', handler: (threadId: number) => void)
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

    private emit(eventName: 'suspend', data?) {
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

            this.client.connect(8085, this.host, () => { });
            let resolved = false;
            this.clientDisconnectors.push(
                this.addListener('data', async (data) => {
                    //resolve the connection once the data events have settled
                    if (!resolved) {
                        resolved = true;
                        resolve();
                        return;
                    }
                    if (this.isActivated) {
                        let dataString = data.toString();
                        //console.log(dataString);

                        //we are guaranteed that there will be a breakpoint on the first line of the entry sub, so
                        //wait until we see the brightscript debugger prompt
                        let match;
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
                this.addListener('close', () => {
                    //this.emit(EventName.close);
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
        this.state = <any>{};
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
    localVariables: { [name: string]: any };
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

export interface Thread {
    isSelected: boolean;
    lineNumber: number;
    filePath: string;
    lineContents: string;
    threadId: number;
}