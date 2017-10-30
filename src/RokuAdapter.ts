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

    /**
     * Subscribe to various events
     * @param eventName 
     * @param handler 
     */
    public on(eventName: 'break', handler: (payload: BreakPayload) => void)
    public on(eventName: string, handler: (payload: any) => void) {
        this.emitter.on(eventName, handler);
        return () => {
            this.emitter.removeListener(eventName, handler);
        };
    }

    private emit(eventName: EventName, data?) {
        this.emitter.emit(eventName, data);
    }

    public connect() {
        return new Promise((resolve, reject) => {
            var net = require('net');
            var client = new net.Socket();

            //once the client connection succeeds, resolve the promise
            client.connect(8085, this.host, () => {
                this.emit(EventName.connect)
                resolve();
            });

            var firstData = true;
            client.on('data', (data) => {
                //"eat" the first data request which contains all of the old messages from previous sessions
                if (firstData === false) {
                    this.parse(data.toString());
                }
                firstData = false;
            });

            client.on('close', () => {
                this.emit(EventName.close);
            });

            //if the connection fails, reject the connect promise
            client.on('error', function (err) {
                reject(err);
            })
        });
    }

    private regexps = {
        compile: /\-+\s+compiling\s+dev\s*'(.*)'\s+\-+/gi,
        run: /\-+\s+running\s+dev\s*'(.*)'\s+runuserinterface\s+\-+/gi,
        break: /brightscript\s+micro debugger\./gi
    }
    private parse(data: string) {
        let match: RegExpExecArray;
        //loop no more than 20 times (alternative to while loop)
        for (let i = 0; i < 100; i++) {
            let loopProcessedSomething = false;
            if (match = this.regexps.compile.exec(data)) {
                let programName = match[1];
                //remove the processed part from the string
                data = data.substring(0, match.index) + data.substring(match.index + match[0].length);
                this.emit(EventName.compile, programName);
                loopProcessedSomething = true;
            } else if (match = this.regexps.run.exec(data)) {
                let programName = match[1];
                this.emit(EventName.run, programName);

                loopProcessedSomething = true;
            } else if (match = this.regexps.break.exec(data)) {
                this.processBreakData(data);
                loopProcessedSomething = true;
            }
            if (match) {
                //remove the processed part from the string
                data = data.substring(0, match.index) + data.substring(match.index + match[0].length);
            } else {
                //nothing was processed, quit the loop because we don't care about this data
                return;
            }
        }
    }

    private processBreakData(data: string) {
        let payload = <BreakPayload>{};

        let match;

        //find the current file path and line number
        if (match = /^\s+file\/line:\s+(.*)\((\d+)\)/im.exec(data)) {
            payload.filePath = match[1];
            payload.lineNumber = parseInt(match[2]);
        }
        //TODO - implement the rest of the parsing


        //remove the processed lines from the data

        //emit the message
        this.emit(EventName.break, payload);
    }
}

export class BreakPayload {
    lineNumber: number;
    filePath: string;
    trace: string[];
    localVariables: { [name: string]: any };
    threads: any[];
    threadId: number;
}
export enum EventName {
    connect = 'connect',
    compile = 'compile',
    close = 'close',
    run = 'run',
    break = 'break'
}