/** Acts as a middle man that takes request from our views and sends them through vscode message protocol and waits for replies to simplify usage in code */
import type * as rta from 'roku-test-automation';

class ExtensionIntermediary {
    private inflightRequests = {};
    private observedEvents = new Map<string, ObserverCallback[]>();
    private observed = false;

    private setupExtensionMessageObserver() {
        if (this.observed) {
            return;
        }
        this.observed = true;

        window.addEventListener('message', (event) => {
            const message = event.data;
            const request = this.inflightRequests[message.id];
            if (request) {
                delete this.inflightRequests[message.id];
                request.callback(message);
            } else {
                if (message.name) {
                    const listeners = this.observedEvents.get(message.name);
                    if (listeners) {
                        for (const listener of listeners) {
                            listener(message);
                        }
                    }
                }
            }
        });
    }

    public async sendMessage<T>(command: string, context = {}) {
        this.setupExtensionMessageObserver();

        const requestId = this.generateRandomString();

        return new Promise<T>((resolve, reject) => {
            const callback = (message) => {
                if (message.error) {
                    reject(message.error);
                } else {
                    resolve(message.response);
                }
            };
            const message = {
                id: requestId,
                command: command,
                context: context
            };

            this.inflightRequests[requestId] = {
                message: message,
                callback: callback
            };
            window.vscode.postMessage(message);
        });
    }

    public sendViewReady() {
        this.setupExtensionMessageObserver();

        window.vscode.postMessage({
            command: 'viewReady',
            context: {}
        });
    }

    public observeEvent(name: string, callback: ObserverCallback) {
        let observedEvent = this.observedEvents.get(name);
        if (!observedEvent) {
            observedEvent = [];
        }

        observedEvent.push(callback);
        this.observedEvents.set(name, observedEvent);
    }

    private generateRandomString(length = 7) {
        const p = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        // eslint-disable-next-line no-bitwise
        return [...Array(length)].reduce((a) => a + p[~~(Math.random() * p.length)], '');
    }
}

const intermediary = new ExtensionIntermediary();

class ODCIntermediary {
    public sendOdcMessage<T>(command: string, args?, options?: rta.ODC.RequestOptions) {
        return intermediary.sendMessage<T>(command, {
            args: args,
            options: options
        });
    }

    public async readRegistry(args?: rta.ODC.ReadRegistryArgs, options?: rta.ODC.RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.readRegistry>>('readRegistry', args, options);
    }

    public async writeRegistry(args: rta.ODC.WriteRegistryArgs, options?: rta.ODC.RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.writeRegistry>>('writeRegistry', args, options);
    }

    public async getFocusedNode(args?: rta.ODC.GetFocusedNodeArgs, options?: rta.ODC.RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.getFocusedNode>>('getFocusedNode', args, options);
    }

    public async getValueAtKeyPath(args: rta.ODC.GetValueAtKeyPathArgs, options?: rta.ODC.RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.getValueAtKeyPath>>('getValueAtKeyPath', args, options);
    }

    public async getValuesAtKeyPaths(args: rta.ODC.GetValueAtKeyPathArgs, options?: rta.ODC.RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.getValuesAtKeyPaths>>('getValuesAtKeyPaths', args, options);
    }

    public async getNodesInfoAtKeyPaths(args: rta.ODC.GetNodesInfoAtKeyPathsArgs, options?: rta.ODC.RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.getNodesInfoAtKeyPaths>>('getNodesInfoAtKeyPaths', args, options);
    }

    public async hasFocus(args: rta.ODC.HasFocusArgs, options?: rta.ODC.RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.hasFocus>>('hasFocus', args, options);
    }

    public async isInFocusChain(args: rta.ODC.IsInFocusChainArgs, options?: rta.ODC.RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.isInFocusChain>>('isInFocusChain', args, options);
    }

    public async observeField(args: rta.ODC.ObserveFieldArgs, options?: rta.ODC.RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.observeField>>('observeField', args, options);
    }

    public async setValueAtKeyPath(args: rta.ODC.SetValueAtKeyPathArgs, options?: rta.ODC.RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.setValueAtKeyPath>>('setValueAtKeyPath', args, options);
    }

    public async deleteRegistrySections(args: rta.ODC.DeleteRegistrySectionsArgs, options?: rta.ODC.RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.deleteRegistrySections>>('deleteRegistrySections', args, options);
    }

    public async deleteEntireRegistry(args?: rta.ODC.DeleteEntireRegistrySectionsArgs, options?: rta.ODC.RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.deleteEntireRegistry>>('deleteEntireRegistry', args, options);
    }

    public async storeNodeReferences(args: rta.ODC.StoreNodeReferencesArgs, options?: rta.ODC.RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.storeNodeReferences>>('storeNodeReferences', args, options);
    }

    public async deleteNodeReferences(args: rta.ODC.DeleteNodeReferencesArgs, options?: rta.ODC.RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.deleteNodeReferences>>('deleteNodeReferences', args, options);
    }
}

type ObserverCallback = (message) => void;

const odc = new ODCIntermediary();
export {
    odc,
    intermediary
};
