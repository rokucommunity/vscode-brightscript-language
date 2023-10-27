import { defer, util as rokuDebugUtil } from 'roku-debug';
import * as Socket from 'roku-debug/dist/JsonSocketClient';

export class DebugSessionMediator {
    /**
 * The server
 */
    private server: Socket.JsonMessengerServer;

    public port: number;
    public activeIoPorts = {};

    public async start() {
        this.server = new Socket.JsonMessengerServer();
        await this.server.connect('0.0.0.0', 9001);

        this.server.on('request', (client, event) => {
            if (event.name === 'set-state') {
                if ('io-socket-status' in event.data) {
                    this.activeIoPorts[event.data.host] = event.data['io-socket-status'];
                    client.sendResponse(event, this.activeIoPorts[event.data.host]);
                }
            } else if (event.name === 'get-state') {
                if ('io-socket-status' in event.data) {
                    let data = event.data;
                    data.host = event.data.host;
                    data['io-socket-status'] = this.activeIoPorts[event.data.host] ?? false;
                    client.sendResponse(event, data['io-socket-status']);
                }
            }
        });
    }

    public async stop() {
        await this.server.close();
    }

    public async destroy() {
        await this.stop();
    }
}
