import { JsonMessengerServer } from 'roku-debug';
import { EventEmitter } from 'stream';

export class DebugSessionMediator {
    /**
 * The server
 */
    private server: JsonMessengerServer;

    public port: number;
    private stateByKey = { };

    public async start() {
        this.server = new JsonMessengerServer();
        await this.server.connect('0.0.0.0', 9001);

        this.server.on('request', (client, event) => {
            if (event.name === 'set-state') {
                if (!(event.data.key in this.stateByKey)) {
                    this.stateByKey[event.data.key] = {};
                }
                //State is empty, remove client id data
                if (Object.keys(event.data.state).length === 0) {
                    delete this.stateByKey[event.data.key][event.clientId];
                } else {
                    this.stateByKey[event.data.key][event.clientId] = event.data.state;
                }
                client.sendResponse(event, this.stateByKey[event.data.key]);
            } else if (event.name === 'get-state') {
                let data = event.data;
                data.data = this.stateByKey[event.data.key] ?? {};
                client.sendResponse(event, data.data);

            } else if (event.name === 'clear-all') {
                this.stateByKey[event.data.key] = {};
                client.sendResponse(event, {});
            }
        });
    }

    public async stop() {
        await this.server.close();
    }

    public async destroy() {
        //TODO make sure this is destroyed
        await this.stop();
    }
}
