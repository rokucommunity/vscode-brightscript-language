import type * as vscode from 'vscode';
import { BaseRdbViewProvider } from './BaseRdbViewProvider';
import { ViewProviderId } from './ViewProviderId';
import { ViewProviderCommand } from './ViewProviderCommand';

export class SceneGraphInspectorViewProvider extends BaseRdbViewProvider {
    public readonly id = ViewProviderId.sceneGraphInspectorView;

    constructor(context: vscode.ExtensionContext, dependencies) {
        super(context, dependencies);

        this.registerCommandWithWebViewNotifier(context, 'extension.brightscript.sceneGraphInspectorView.refreshNodeTree');

        this.addMessageCommandCallback(ViewProviderCommand.getStoredNodeReferences, (message) => {
            const response = this.dependencies.rtaManager.getStoredNodeReferences();
            this.postOrQueueMessage({
                ...message,
                response: response
            });
            return Promise.resolve(true);
        });
    }
}
