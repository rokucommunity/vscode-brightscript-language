import type * as vscode from 'vscode';
import { BaseRdbViewProvider } from './BaseRdbViewProvider';

export class SceneGraphInspectorViewProvider extends BaseRdbViewProvider {
    public readonly id = 'sceneGraphInspectorView';

    constructor(context: vscode.ExtensionContext) {
        super(context);

        this.registerCommandWithWebViewNotifier(context, 'extension.brightscript.sceneGraphInspectorView.refreshNodeTree');
    }
}
