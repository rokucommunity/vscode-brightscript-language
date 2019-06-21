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
                    let blockInfo = this.rendezvousBlocks[id];

                    if (this.rendezvousHistory[blockInfo.fileName]) {
                        if (this.rendezvousHistory[blockInfo.fileName][blockInfo.lineNumber]) {
                            this.rendezvousHistory[blockInfo.fileName][blockInfo.lineNumber].totalTime += this.getTime(duration);
                            this.rendezvousHistory[blockInfo.fileName][blockInfo.lineNumber].hitCount ++;
                        } else {
                            this.rendezvousHistory[blockInfo.fileName][blockInfo.lineNumber] = {
                                totalTime: this.getTime(duration),
                                hitCount: 1
                            };
                        }
                    } else {
                        this.rendezvousHistory[blockInfo.fileName] = {
                            [blockInfo.lineNumber]: {
                                totalTime: this.getTime(duration),
                                hitCount: 1
                            }
                        };
                    }

                    delete this.rendezvousBlocks[id];
                    this.emit('rendezvous-event', this.rendezvousHistory);
                }
            } else if (line) {
                normalOutput += line + '\n';
            }
        });

        return normalOutput;
    }

    private getTime(duration?: string): number {
        return duration ? parseFloat(duration) : 0.000;
    }
}

export interface RendezvousHistory {
    [key: string]: {
        [key: string]: {
            totalTime: number;
            hitCount: number;
        }
    };
}

interface RendezvousBlocks {
    [key: string]: {
        fileName: string;
        lineNumber: string;
    };
}

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
