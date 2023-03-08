/** Acts as a middle man that takes request from our views and sends them through vscode message protocol and waits for replies to simplify usage in code */
import type * as rta from 'roku-test-automation';
import type { VscodeCommand } from '../../src/commands/VscodeCommand';
import type { ViewProviderEvent } from '../../src/viewProviders/ViewProviderEvent';
import { ViewProviderCommand } from '../../src/viewProviders/ViewProviderCommand';
import { RequestType } from 'roku-test-automation/client/dist/types/OnDeviceComponent';
import type { DeleteEntireRegistrySectionsArgs, DeleteNodeReferencesArgs, DeleteRegistrySectionsArgs, FindNodesAtLocationArgs, GetFocusedNodeArgs, GetNodesInfoArgs, GetNodesWithPropertiesArgs, GetValueArgs, GetValuesArgs, HasFocusArgs, IsInFocusChainArgs, OnFieldChangeOnceArgs, ReadRegistryArgs, RequestOptions, SetValueArgs, StoreNodeReferencesArgs, WriteRegistryArgs } from 'roku-test-automation';

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
            } else if (message.event) {
                const listeners = this.observedEvents.get(message.event);
                if (listeners) {
                    for (const listener of listeners) {
                        listener(message);
                    }
                }
            }
        });
    }

    public async sendObservableMessage<T>(message: Record<string, unknown>) {
        this.setupExtensionMessageObserver();

        const requestId = this.generateRandomString();
        message.id = requestId;

        return new Promise<T>((resolve, reject) => {
            const callback = (message) => {
                if (message.error) {
                    reject(message.error);
                } else {
                    resolve(message.response);
                }
            };

            this.inflightRequests[requestId] = {
                message: message,
                callback: callback
            };
            this.postMessage(message);
        });
    }

    public createCommandMessage(command: VscodeCommand | ViewProviderCommand, context = {}) {
        const message = {
            command: command,
            context: context
        };
        return message;
    }

    public sendCommand<T>(command: VscodeCommand | ViewProviderCommand, context = {}) {
        return this.sendObservableMessage<T>(this.createCommandMessage(command, context));
    }

    public createEventMessage(event: ViewProviderEvent, context = {}) {
        const message = {
            event: event,
            context: context
        };
        return message;
    }

    public sendEvent(event: ViewProviderEvent, context = {}) {
        this.postMessage(this.createEventMessage(event, context));
    }

    public sendViewReady() {
        this.setupExtensionMessageObserver();

        this.postMessage({
            command: ViewProviderCommand.viewReady,
            context: {}
        });
    }

    public setVscodeContext(key: string, value: boolean | number | string) {
        this.postMessage({
            command: 'setVscodeContext',
            key: key,
            value: value
        });
    }

    public async getStoredNodeReferences() {
        return this.sendCommand<ReturnType<typeof rta.odc.storeNodeReferences>>(ViewProviderCommand.getStoredNodeReferences);
    }

    public observeEvent(eventName: string, callback: ObserverCallback) {
        let observedEvent = this.observedEvents.get(eventName);
        if (!observedEvent) {
            observedEvent = [];
        }

        observedEvent.push(callback);
        this.observedEvents.set(eventName, observedEvent);
    }

    public sendMessageToWebviews(viewIds: string | string[], message) {
        this.postMessage({
            command: ViewProviderCommand.sendMessageToWebviews,
            viewIds: viewIds,
            message: message
        });
    }

    private postMessage(message) {
        window.vscode.postMessage(message);
    }

    private generateRandomString(length = 7) {
        const p = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        // eslint-disable-next-line no-bitwise
        return [...Array(length)].reduce((a) => a + p[~~(Math.random() * p.length)], '');
    }
}

const intermediary = new ExtensionIntermediary();

class ODCIntermediary {
    public sendOdcMessage<T>(command: RequestType, args?, options?: RequestOptions) {
        return intermediary.sendCommand<T>(command as any, {
            args: args,
            options: options
        });
    }

    public async readRegistry(args?: ReadRegistryArgs, options?: RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.readRegistry>>(RequestType.readRegistry, args, options);
    }

    public async writeRegistry(args: WriteRegistryArgs, options?: RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.writeRegistry>>(RequestType.writeRegistry, args, options);
    }

    public async getFocusedNode(args?: GetFocusedNodeArgs, options?: RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.getFocusedNode>>(RequestType.getFocusedNode, args, options);
    }

    public async getValue(args: GetValueArgs, options?: RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.getValue>>(RequestType.getValue, args, options);
    }

    public async getValues(args: GetValuesArgs, options?: RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.getValues>>(RequestType.getValues, args, options);
    }

    public async getNodesInfo(args: GetNodesInfoArgs, options?: RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.getNodesInfo>>(RequestType.getNodesInfo, args, options);
    }

    public async hasFocus(args: HasFocusArgs, options?: RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.hasFocus>>(RequestType.hasFocus, args, options);
    }

    public async isInFocusChain(args: IsInFocusChainArgs, options?: RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.isInFocusChain>>(RequestType.isInFocusChain, args, options);
    }

    public async onFieldChangeOnce(args: OnFieldChangeOnceArgs, options?: RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.onFieldChangeOnce>>(RequestType.onFieldChangeOnce, args, options);
    }

    public async setValue(args: SetValueArgs, options?: RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.setValue>>(RequestType.setValue, args, options);
    }

    public async deleteRegistrySections(args: DeleteRegistrySectionsArgs, options?: RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.deleteRegistrySections>>(RequestType.deleteRegistrySections, args, options);
    }

    public async deleteEntireRegistry(args?: DeleteEntireRegistrySectionsArgs, options?: RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.deleteEntireRegistry>>(RequestType.deleteEntireRegistry, args, options);
    }

    public async storeNodeReferences(args?: StoreNodeReferencesArgs, options?: RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.storeNodeReferences>>(RequestType.storeNodeReferences, args, options);
    }

    public async deleteNodeReferences(args: DeleteNodeReferencesArgs, options?: RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.deleteNodeReferences>>(RequestType.deleteNodeReferences, args, options);
    }

    public async getNodesWithProperties(args: GetNodesWithPropertiesArgs, options?: RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.getNodesWithProperties>>(RequestType.getNodesWithProperties, args, options);
    }

    public async findNodesAtLocation(args: FindNodesAtLocationArgs, options?: RequestOptions) {
        return this.sendOdcMessage<ReturnType<typeof rta.odc.findNodesAtLocation>>(RequestType.findNodesAtLocation, args, options);
    }
}

type ObserverCallback = (message) => void;

const odc = new ODCIntermediary();
export {
    odc,
    intermediary
};
