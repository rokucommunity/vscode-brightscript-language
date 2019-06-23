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
            if (match = /\[sg\.node\.(BLOCK|UNBLOCK)\] Rendezvous\[(\d+)\](?:\s\w+\n|\s\w{2}\s(.*brs)\((\d+)\)|[\s\w]+(\d+\.\d+)+|\s\w+)/g.exec(line)) {
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
                            this.rendezvousHistory[blockInfo.fileName][blockInfo.lineNumber].totalTime += this.getTime(duration);
                            this.rendezvousHistory[blockInfo.fileName][blockInfo.lineNumber].hitCount ++;
                        } else {
                            this.rendezvousHistory[blockInfo.fileName][blockInfo.lineNumber] = this.createLineObject(duration);
                        }
                    } else {
                        this.rendezvousHistory[blockInfo.fileName] = {
                            type: 'fileInfo',
                            [blockInfo.lineNumber]: this.createLineObject(duration)
                        };
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

export interface RendezvousHistory {
    [key: string]: RendezvousFileInfo | ElementType;
}

interface RendezvousFileInfo {
    [key: string]: RendezvousLineInfo | ElementType;
    type: ElementType;
}

interface RendezvousLineInfo {
    totalTime: number;
    hitCount: number;
    type: ElementType;
}

interface RendezvousBlocks {
    [key: string]: {
        fileName: string;
        lineNumber: string;
    };
}

type ElementType = 'fileInfo' | 'lineInfo';

// {
//     "VHLVideoTrackingTask.brs": {
//       "(126)": {
//         "totalTime": 0.0011,
//         "hitCount": 1
//       }
//     },
//     "UriFetcher.brs": {
//       "(57)": {
//         "totalTime": 0.0009,
//         "hitCount": 1
//       },
//       "(168)": {
//         "totalTime": 0.0008,
//         "hitCount": 1
//       }
//     },
//     "AnalyticsUtils.brs": {
//       "(414)": {
//         "totalTime": 0.0000,
//         "hitCount": 1
//       },
//       "(278)": {
//         "totalTime": 0.0000,
//         "hitCount": 1
//       },
//       "(221)": {
//         "totalTime": 0.0000,
//         "hitCount": 2
//       },
//       "(184)": {
//         "totalTime": 0.0000,
//         "hitCount": 1
//       }
//     }
//   }
