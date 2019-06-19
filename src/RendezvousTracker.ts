
export class RendezvousTracker {
    constructor() {
        this.rendezvousHistory = {};
    }

    private rendezvousHistory: object;

    public processLogLine(logLine: string): string {
        let lines = logLine.split('\n');

        let normalOutput = '';

        lines.map((line) => {
            let match;
            if (match = /\[sg\.node\.(BLOCK|UNBLOCK)\] Rendezvous\[(\d+)\](?:\s\w+\n|\s\w{2}\s(.*brs)\((\d+)\)|[\s\w]+(\d+\.\d+)+|\s\w+)/g.exec(line)) {
                let newMatch = match;
            } else if (line) {
                normalOutput += line + '\n';
            }
        });

        return normalOutput;
    }
}
