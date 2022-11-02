import type * as rta from 'roku-test-automation';

import { BaseWebviewViewProvider } from './BaseWebviewViewProvider';

export abstract class BaseRdbViewProvider extends BaseWebviewViewProvider {
    protected onDeviceComponent?: rta.OnDeviceComponent;

    protected odcCommands: Array<keyof rta.OnDeviceComponent> = [
        'callFunc',
        'deleteEntireRegistry',
        'deleteRegistrySections',
        'getFocusedNode',
        'getValueAtKeyPath',
        'getValuesAtKeyPaths',
        'getNodesInfoAtKeyPaths',
        'hasFocus',
        'isInFocusChain',
        'observeField',
        'readRegistry',
        'setValueAtKeyPath',
        'writeRegistry',
        'storeNodeReferences',
        'deleteNodeReferences'
    ];

    // @param odc - The OnDeviceComponent class instance. If undefined existing instance will be removed. Used to notify webview of change in ODC status
    public setOnDeviceComponent(onDeviceComponent?: rta.OnDeviceComponent) {
        this.onDeviceComponent = onDeviceComponent;

        this.postOrQueueMessage({
            name: 'onDeviceComponentStatus',
            available: onDeviceComponent ? true : false
        });
    }

    protected onViewReady() {
        // Always post back the ODC status so we make sure the client doesn't miss it if it got refreshed
        this.setOnDeviceComponent(this.onDeviceComponent);
    }

    protected async handleViewMessage(message) {
        const { command, context } = message;
        if (this.odcCommands.includes(command)) {
            const response = await this.onDeviceComponent[command](context.args, context.options);
            this.postMessage({
                ...message,
                response: response
            });
            return true;
        }

        return false;
    }
}


