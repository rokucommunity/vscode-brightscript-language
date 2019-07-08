import * as path from 'path';

import { EventEmitter } from 'events';

export class RendezvousTracker {
    constructor() {
        this.clientPathsMap = {};
        this.rendezvousHistory = {};
        this.rendezvousBlocks = {};
        this.emitter = new EventEmitter();
    }

    private clientPathsMap: RendezvousClientPathMap;
    private rendezvousHistory: RendezvousHistory;
    private rendezvousBlocks: RendezvousBlocks;
    private emitter: EventEmitter;

    private convertDebuggerPathToClient: any;
    private convertDebuggerLineToClientLine: any;

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

    public setDebuggerFileConversionFunctions(convertDebuggerPathToClient, convertDebuggerLineToClientLine) {
        this.convertDebuggerPathToClient = convertDebuggerPathToClient;
        this.convertDebuggerLineToClientLine = convertDebuggerLineToClientLine;
    }

    public processLogLine(logLine: string): string {
        let lines = logLine.split('\n');

        let normalOutput = '';
        let dataChanged = false;

        lines.map((line) => {
            let match;
            // see the following for an explanation for this regex: https://regex101.com/r/In0t7d/5
            if (match = /\[sg\.node\.(BLOCK|UNBLOCK)\s{0,}\] Rendezvous\[(\d+)\](?:\s\w+\n|\s\w{2}\s(.*)\((\d+)\)|[\s\w]+(\d+\.\d+)+|\s\w+)/g.exec(line)) {
                let [fullMatch, type, id, fileName, lineNumber, duration] = match;
                if (type === 'BLOCK') {
                    this.rendezvousBlocks[id] = {
                        fileName: this.updateClientPathMap(fileName, lineNumber),
                        lineNumber: lineNumber
                    };
                } else if (type === 'UNBLOCK' && this.rendezvousBlocks[id]) {
                    dataChanged = true;
                    let blockInfo = this.rendezvousBlocks[id];
                    let clientLineNumber: string = this.clientPathsMap[blockInfo.fileName].clientLines[blockInfo.lineNumber].toString();

                    if (this.rendezvousHistory[blockInfo.fileName]) {
                        if (this.rendezvousHistory[blockInfo.fileName][clientLineNumber]) {
                            (this.rendezvousHistory[blockInfo.fileName][clientLineNumber] as RendezvousLineInfo).totalTime += this.getTime(duration);
                            (this.rendezvousHistory[blockInfo.fileName][clientLineNumber] as RendezvousLineInfo).hitCount ++;
                        } else {
                            this.rendezvousHistory[blockInfo.fileName][clientLineNumber] = this.createLineObject(blockInfo.fileName, parseInt(clientLineNumber), duration);
                        }
                    } else {
                        this.rendezvousHistory[blockInfo.fileName] = {
                            type: 'fileInfo',
                            [clientLineNumber]: this.createLineObject(blockInfo.fileName, parseInt(clientLineNumber), duration),
                            hitCount: 0,
                            totalTime: 0,
                            zeroCostHitCount: 0
                        };
                    }

                    let timeToAdd = this.getTime(duration);

                    this.rendezvousHistory[blockInfo.fileName].hitCount ++;
                    this.rendezvousHistory[blockInfo.fileName].totalTime += timeToAdd;

                    if (0 === timeToAdd) {
                        this.rendezvousHistory[blockInfo.fileName].zeroCostHitCount ++;
                    }

                    delete this.rendezvousBlocks[id];
                }
            } else if (line) {
                normalOutput += line + '\n';
            }
        });

        if (dataChanged) {
            this.emit('rendezvous-event', this.rendezvousHistory);
        }

        return normalOutput;
    }

    private updateClientPathMap(fileName: string, lineNumber: string): string {
        let parsedPath = path.parse(fileName);
        let fileNameAsBrs: string;
        let fileNameAsXml: string;

        // Does the file end in a valid extension or a function name?
        if (parsedPath.ext.toLowerCase() !== '.brs' && parsedPath.ext.toLowerCase() !== '.xml') {
            // file name contained a function name rather then a valid extension
            fileNameAsBrs = this.replaceLastStringInstance(fileName, parsedPath.ext, '.brs');
            fileNameAsXml = this.replaceLastStringInstance(fileName, parsedPath.ext, '.xml');

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
                fileNameAsBrs = this.convertDebuggerPathToClient(fileNameAsBrs);
                if (fileNameAsBrs) {
                    fileName = fileNameAsBrs;
                } else {
                    fileNameAsXml = this.convertDebuggerPathToClient(fileNameAsXml);
                    if (fileNameAsXml) {
                        fileName = fileNameAsXml;
                    }
                }
            }

            this.clientPathsMap[fileName] = {
                clientPath: this.convertDebuggerPathToClient(fileName),
                clientLines: {
                    [lineNumber]: this.convertDebuggerLineToClientLine(fileName, parseInt(lineNumber))
                }
            };
        } else if (!this.clientPathsMap[fileName].clientLines[lineNumber]) {
            // Add new client line to clint path map
            this.clientPathsMap[fileName].clientLines[lineNumber] = this.convertDebuggerLineToClientLine(fileName, parseInt(lineNumber));
        }

        return fileName;
    }

    private createLineObject(fileName: string, lineNumber: number, duration?: string): RendezvousLineInfo {
        return {
            clientPath: this.clientPathsMap[fileName].clientPath,
            clientLineNumber: lineNumber,
            totalTime: this.getTime(duration),
            hitCount: 1,
            type: 'lineInfo'
        };
    }

    private getTime(duration?: string): number {
        return duration ? parseFloat(duration) : 0.000;
    }

    private replaceLastStringInstance(sourceString: string, targetString: string, replacementString: string): string {
        return sourceString.substr(0, sourceString.lastIndexOf(targetString)) + replacementString;
    }
}

export function isRendezvousDetailsField(fieldName: string): boolean {
    return (fieldName === 'type' || fieldName === 'hitCount' || fieldName === 'totalTime' || fieldName === 'zeroCostHitCount');
}

export interface RendezvousHistory {
    [key: string]: RendezvousFileInfo;
}

interface RendezvousFileInfo {
    [key: string]: RendezvousLineInfo | ElementType | number;
    hitCount: number;
    zeroCostHitCount: number;
    totalTime: number;
    type: ElementType;
}

export interface RendezvousLineInfo {
    totalTime: number;
    hitCount: number;
    clientPath: string;
    clientLineNumber: number;
    type: ElementType;
}

interface RendezvousBlocks {
    [key: string]: {
        fileName: string;
        lineNumber: string;
    };
}

type ElementType = 'fileInfo' | 'lineInfo';

interface RendezvousClientPathMap {
    [key: string]: RendezvousClientFile;
}

interface RendezvousClientFile {
    [key: string]: string | RendezvousClientLineMap;
    clientPath: string;
}
interface RendezvousClientLineMap {
    [key: string]: number;
}
