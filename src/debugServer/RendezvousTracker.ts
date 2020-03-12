import { EventEmitter } from 'events';
import * as path from 'path';
import * as replaceLast from 'replace-last';

import { SourceLocation } from './SourceLocator';

export class RendezvousTracker {
    constructor() {
        this.clientPathsMap = {};
        this.emitter = new EventEmitter();
        this.filterOutLogs = true;
        this.rendezvousBlocks = {};
        this.rendezvousHistory = this.createNewRendezvousHistory();
    }

    private clientPathsMap: RendezvousClientPathMap;
    private emitter: EventEmitter;
    private filterOutLogs: boolean;
    private rendezvousBlocks: RendezvousBlocks;
    private rendezvousHistory: RendezvousHistory;

    public on(eventname: 'rendezvous-event', handler: (output: RendezvousHistory) => void);
    public on(eventName: string, handler: (payload: any) => void) {
        this.emitter.on(eventName, handler);
        return () => {
            if (this.emitter !== undefined) {
                this.emitter.removeListener(eventName, handler);
            }
        };
    }

    private emit(eventName: 'rendezvous-event', data?) {
        this.emitter.emit(eventName, data);
    }

    public get getRendezvousHistory(): RendezvousHistory {
        return this.rendezvousHistory;
    }

    /**
     * A function that looks up the source location based on debugger information
     */
    private getSourceLocation: (debuggerPath: string, lineNumber: number) => Promise<SourceLocation>;

    /**
     * Registers a function that can be used to map a debug location to a source location
     */
    public registerSourceLocator(sourceLocator: (debuggerPath: string, lineNumber: number) => Promise<SourceLocation>) {
        this.getSourceLocation = sourceLocator;
    }

    /**
     * Used to set wether the rendezvous should be filtered from the console output
     * @param outputLevel the consoleOutput from the launch config
     */
    public setConsoleOutput(outputLevel: string) {
        this.filterOutLogs = !(outputLevel === 'full');
    }

    /**
     * Clears the current rendezvous history
     */
    public clearRendezvousHistory() {
        this.rendezvousHistory = this.createNewRendezvousHistory();
        this.emit('rendezvous-event', this.rendezvousHistory);
    }

    /**
     * Takes the debug output from the device and parses it for any rendezvous information.
     * Also if consoleOutput was not set to 'full' then any rendezvous output will be filtered from the output.
     * @param logLine
     * @returns The debug output after parsing
     */
    public async processLogLine(logLine: string): Promise<string> {
        let dataChanged = false;
        let lines = logLine.split('\n');
        let normalOutput = '';

        for (let line of lines) {
            let match;
            // see the following for an explanation for this regex: https://regex101.com/r/In0t7d/6
            if (match = /\[sg\.node\.(BLOCK|UNBLOCK)\s{0,}\] Rendezvous\[(\d+)\](?:\s\w+\n|\s\w{2}\s(.*)\((\d+)\)|[\s\w]+(\d+\.\d+)+|\s\w+)/g.exec(line)) {
                let [fullMatch, type, id, fileName, lineNumber, duration] = match;
                if (type === 'BLOCK') {
                    // detected the start of a rendezvous event
                    this.rendezvousBlocks[id] = {
                        fileName: await this.updateClientPathMap(fileName, parseInt(lineNumber)),
                        lineNumber: lineNumber
                    };
                } else if (type === 'UNBLOCK' && this.rendezvousBlocks[id]) {
                    // detected the completion of a rendezvous event
                    dataChanged = true;
                    let blockInfo = this.rendezvousBlocks[id];
                    let clientLineNumber: string = this.clientPathsMap[blockInfo.fileName].clientLines[blockInfo.lineNumber].toString();

                    if (this.rendezvousHistory.occurrences[blockInfo.fileName]) {
                        // file is in history
                        if (this.rendezvousHistory.occurrences[blockInfo.fileName].occurrences[clientLineNumber]) {
                            // line is in history, just update it
                            this.rendezvousHistory.occurrences[blockInfo.fileName].occurrences[clientLineNumber].totalTime += this.getTime(duration);
                            this.rendezvousHistory.occurrences[blockInfo.fileName].occurrences[clientLineNumber].hitCount++;
                        } else {
                            // new line to be added to a file in history
                            this.rendezvousHistory.occurrences[blockInfo.fileName].occurrences[clientLineNumber] = this.createLineObject(blockInfo.fileName, parseInt(clientLineNumber), duration);
                        }
                    } else {
                        // new file to be added to the history
                        this.rendezvousHistory.occurrences[blockInfo.fileName] = {
                            occurrences: {
                                [clientLineNumber]: this.createLineObject(blockInfo.fileName, parseInt(clientLineNumber), duration)
                            },
                            hitCount: 0,
                            totalTime: 0,
                            type: 'fileInfo',
                            zeroCostHitCount: 0
                        };
                    }

                    // how much time to add to the files total time
                    let timeToAdd = this.getTime(duration);

                    // increment hit count and add to the total time for this file
                    this.rendezvousHistory.occurrences[blockInfo.fileName].hitCount++;
                    this.rendezvousHistory.hitCount++;

                    // increment hit count and add to the total time for the history as a whole
                    this.rendezvousHistory.occurrences[blockInfo.fileName].totalTime += timeToAdd;
                    this.rendezvousHistory.totalTime += timeToAdd;

                    if (0 === timeToAdd) {
                        this.rendezvousHistory.occurrences[blockInfo.fileName].zeroCostHitCount++;
                        this.rendezvousHistory.zeroCostHitCount++;
                    }

                    // remove this event from pre history tracking
                    delete this.rendezvousBlocks[id];
                }

                if (!this.filterOutLogs) {
                    normalOutput += line + '\n';
                }
            } else if (line) {
                normalOutput += line + '\n';
            }
        }

        if (dataChanged) {
            this.emit('rendezvous-event', this.rendezvousHistory);
        }

        return normalOutput;
    }

    /**
     * Checks the client path map for existing path data and adds new data to the map if not found
     * @param fileName The filename or path parsed from the rendezvous output
     * @param lineNumber The line number parsed from the rendezvous output
     * @returns The file name that best matches the source files if we where able to map it to the source
     */
    private async updateClientPathMap(fileName: string, lineNumber: number): Promise<string> {
        let parsedPath = path.parse(fileName);
        let fileNameAsBrs: string;
        let fileNameAsXml: string;

        // Does the file end in a valid extension or a function name?
        if (parsedPath.ext.toLowerCase() !== '.brs' && parsedPath.ext.toLowerCase() !== '.xml') {
            // file name contained a function name rather then a valid extension
            fileNameAsBrs = replaceLast(fileName, parsedPath.ext, '.brs');
            fileNameAsXml = replaceLast(fileName, parsedPath.ext, '.xml');

            // Check the clint path map for the corrected file name
            if (this.clientPathsMap[fileNameAsBrs]) {
                fileName = fileNameAsBrs;
            } else if (this.clientPathsMap[fileNameAsXml]) {
                fileName = fileNameAsXml;
            }
        }

        if (!this.clientPathsMap[fileName]) {
            // Add new file to client path map
            if (fileNameAsBrs || fileNameAsXml) {
                // File name did not have a valid extension
                // Check for both the .brs and .xml versions of the file starting with .brs
                fileNameAsBrs = (await this.getSourceLocation(fileNameAsBrs, lineNumber)).filePath;
                if (fileNameAsBrs) {
                    fileName = fileNameAsBrs;
                } else {
                    fileNameAsXml = (await this.getSourceLocation(fileNameAsXml, lineNumber)).filePath;
                    if (fileNameAsXml) {
                        fileName = fileNameAsXml;
                    }
                }
            }
            let sourceLocation = await this.getSourceLocation(fileName, lineNumber);
            this.clientPathsMap[fileName] = {
                clientPath: sourceLocation.filePath,
                clientLines: {
                    //TODO - should the line be 1 or 0 based?
                    [lineNumber]: sourceLocation.lineNumber
                }
            };
        } else if (!this.clientPathsMap[fileName].clientLines[lineNumber]) {
            // Add new client line to clint path map
            this.clientPathsMap[fileName].clientLines[lineNumber] = (await this.getSourceLocation(fileName, lineNumber)).lineNumber;
        }

        return fileName;
    }

    /**
     * Helper function used to create a new RendezvousHistory object with default values
     */
    private createNewRendezvousHistory(): RendezvousHistory {
        return {
            hitCount: 0,
            occurrences: {},
            totalTime: 0.00,
            type: 'historyInfo',
            zeroCostHitCount: 0
        };
    }

    /**
     * Helper function to assist in the creation of a RendezvousLineInfo
     * @param fileName processed file name
     * @param lineNumber occurrence line number
     * @param duration how long the rendezvous took to complete, if not supplied it is assumed to be zero
     */
    private createLineObject(fileName: string, lineNumber: number, duration?: string): RendezvousLineInfo {
        return {
            clientLineNumber: lineNumber,
            clientPath: this.clientPathsMap[fileName].clientPath,
            hitCount: 1,
            totalTime: this.getTime(duration),
            type: 'lineInfo'
        };
    }

    /**
     * Helper function to convert the duration to a float or return 0.00
     * @param duration how long the rendezvous took to complete, if not supplied it is assumed to be zero
     */
    private getTime(duration?: string): number {
        return duration ? parseFloat(duration) : 0.000;
    }
}

export interface RendezvousHistory {
    hitCount: number;
    occurrences: { [key: string]: RendezvousFileInfo };
    totalTime: number;
    type: ElementType;
    zeroCostHitCount: number;
}

interface RendezvousFileInfo {
    hitCount: number;
    occurrences: { [key: string]: RendezvousLineInfo };
    totalTime: number;
    type: ElementType;
    zeroCostHitCount: number;
}

interface RendezvousLineInfo {
    clientLineNumber: number;
    clientPath: string;
    hitCount: number;
    totalTime: number;
    type: ElementType;
}

interface RendezvousBlocks {
    [key: string]: {
        fileName: string;
        lineNumber: string;
    };
}

type ElementType = 'historyInfo' | 'fileInfo' | 'lineInfo';

interface RendezvousClientPathMap {
    [key: string]: {
        clientLines: {
            [key: string]: number
        };
        clientPath: string;
    };
}
