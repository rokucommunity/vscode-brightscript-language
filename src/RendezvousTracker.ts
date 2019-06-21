
export class RendezvousTracker {
    constructor() {
        this.rendezvousHistory = {};
        this.rendezvousBlocks = {};
    }

    private rendezvousHistory: RendezvousHistory;
    private rendezvousBlocks: RendezvousBlocks;

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
