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
     * Connect to the telnet session. This should be called before the channel is launched, and there should be a breakpoint set at the first
     * line of the entry function of the source code
     */
    public connect() {
        return new Promise((resolve, reject) => {
            var net = require('net');
            this.client = new net.Socket();

            //once the client connection succeeds, resolve the promise
            this.client.connect(8085, this.host, () => {
                resolve();
            });

            var firstData = true;
            this.clientDisconnectors.push(
                this.addListener('data', (data) => {
                    let dataString = data.toString();
                    console.log(dataString);

                    //eat any first response we get from the server
                    if (firstData) {
                        firstData = false;
                        return;
                    }

                    //we are guaranteed that there will be a breakpoint on the first line of the entry sub, so
                    //wait until we see the brightscript debugger prompt
                    let match;
                    if (match = /Brightscript\s+Debugger>\s+$/i.exec(dataString)) {
                        this.emit('suspend');
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

    public getStackTrace(): Promise<StackFrame[]> {
        return new Promise((resolve, reject) => {
            if (this.state.stackTrace) {
                return Promise.resolve(this.state.stackTrace);
            } else {
                //perform a request to load the stack trace
                let disconnect = this.addListener('data', (data) => {
                    let matches = /^\s+file\/line:\s+(.*)\((\d+)\)/img.exec(data.toString())
                    if (matches) {
                        let frames: StackFrame[] = [];
                        //the first index is the whole string
                        //then the matches should be in pairs
                        for (let i = 1; i < matches.length; i = i + 2) {
                            let filePath = matches[i];
                            let lineNumber = parseInt(matches[i + 1]);
                            let frame: StackFrame = {
                                filePath,
                                lineNumber
                            }
                            frames.push(frame);
                        }
                        disconnect();
                        this.state.stackTrace = frames;
                        resolve(frames);
                    }
                });
                this.client.write(new Buffer('bt\r\n', 'utf8'));
            }
        });
        // let promise = new Promise((resolve, reject) => {
        //     let unsubscribe = this.on(EventName.trace, (payload) => {
        //         unsubscribe();
        //         resolve(payload);
        //     });
        // });
        // this.client.write(new Buffer('bt', 'utf8'));
        // return promise;
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
    lineNumber: number;
    filePath: string;
    stackTrace: StackFrame[];
    localVariables: { [name: string]: any };
    threads: any[];
    threadId: number;
}

export interface StackFrame {
    filePath: string;
    lineNumber: number;
}

export enum EventName {
    suspend = 'suspend'
}