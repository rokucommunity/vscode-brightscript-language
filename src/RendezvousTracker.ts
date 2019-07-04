import { EventEmitter } from 'events';

export class RendezvousTracker {
    constructor() {
        this.rendezvousHistory = {};
        this.rendezvousBlocks = {};
        this.emitter = new EventEmitter();
    }

    private rendezvousHistory: RendezvousHistory;
    private rendezvousBlocks: RendezvousBlocks;
    private emitter: EventEmitter;

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

    public processLogLine(logLine: string): string {
        let lines = logLine.split('\n');

        let normalOutput = '';
        let dataChanged = false;

        lines.map((line) => {
            let match;
            // see the following for an explanation for this regex: https://regex101.com/r/In0t7d/4
            if (match = /\[sg\.node\.(BLOCK|UNBLOCK)\] Rendezvous\[(\d+)\](?:\s\w+\n|\s\w{2}\s(.*brs|.*xml)\((\d+)\)|[\s\w]+(\d+\.\d+)+|\s\w+)/g.exec(line)) {
                let [fullMatch, type, id, fileName, lineNumber, duration] = match;
                if (type === 'BLOCK') {
                    this.rendezvousBlocks[id] = {
                        fileName: fileName,
                        lineNumber: lineNumber
                    };
                } else if (type === 'UNBLOCK' && this.rendezvousBlocks[id]) {
                    dataChanged = true;
                    let blockInfo = this.rendezvousBlocks[id];

                    if (this.rendezvousHistory[blockInfo.fileName]) {
                        if (this.rendezvousHistory[blockInfo.fileName][blockInfo.lineNumber]) {
                            (this.rendezvousHistory[blockInfo.fileName][blockInfo.lineNumber] as RendezvousLineInfo).totalTime += this.getTime(duration);
                            (this.rendezvousHistory[blockInfo.fileName][blockInfo.lineNumber] as RendezvousLineInfo).hitCount ++;
                        } else {
                            this.rendezvousHistory[blockInfo.fileName][blockInfo.lineNumber] = this.createLineObject(duration);
                        }
                    } else {
                        this.rendezvousHistory[blockInfo.fileName] = {
                            type: 'fileInfo',
                            [blockInfo.lineNumber]: this.createLineObject(duration),
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

    private createLineObject(duration?: string): RendezvousLineInfo {
        return {
            totalTime: this.getTime(duration),
            hitCount: 1,
            type: 'lineInfo'
        };
    }

    private getTime(duration?: string): number {
        return duration ? parseFloat(duration) : 0.000;
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
    clientPath?: string;
    clientLineNumber?: number;
    type: ElementType;
}

interface RendezvousBlocks {
    [key: string]: {
        fileName: string;
        lineNumber: string;
    };
}

type ElementType = 'fileInfo' | 'lineInfo';
