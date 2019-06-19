
export class RendezvousTracker {
    constructor() {
        this.rendezvousHistory = {};
    }

    private rendezvousHistory: object;

    public processLogLine(logLine: string): boolean {
        let match;
        if (match = /(\[sg\.node\.(BLOCK|UNBLOCK)\] Rendezvous\[(\d+)\])[\s\w]+(?:(pkg:\/[\w\/]+\.brs)\((\d+)\)|(\d+\.\d+))/g.exec(logLine)) {
            let newMatch = match;
            return true;
        }
        return false;
    }
}
