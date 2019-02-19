import {
    CancellationToken,
    CompletionItem,
    CompletionItemKind,
    CompletionItemProvider,
    Position, TextDocument
} from 'vscode';

import * as vscode from 'vscode';

import { ifAppInfoCompletionItems } from './BrightScriptCompletionItems/ifAppInfoCompletionItems';
import { ifAppManagerCompletionItems } from './BrightScriptCompletionItems/ifAppManagerCompletionItems';
import { ifArrayCompletionItems } from './BrightScriptCompletionItems/ifArrayCompletionItems';
import { ifArrayJoinCompletionItems } from './BrightScriptCompletionItems/ifArrayJoinCompletionItems';
import { ifArraySortCompletionItems } from './BrightScriptCompletionItems/ifArraySortCompletionItems';
import { ifAssociativeArrayCompletionItems } from './BrightScriptCompletionItems/ifAssociativeArrayCompletionItems';
import { ifAudioGuideCompletionItems } from './BrightScriptCompletionItems/ifAudioGuideCompletionItems';
import { ifAudioMetadataCompletionItems } from './BrightScriptCompletionItems/ifAudioMetadataCompletionItems';
import { ifAudioPlayerCompletionItems } from './BrightScriptCompletionItems/ifAudioPlayerCompletionItems';
import { ifAudioResourceCompletionItems } from './BrightScriptCompletionItems/ifAudioResourceCompletionItems';

export default class BrightScriptCompletionItemProvider implements CompletionItemProvider {
    private interfaceDictionary: { [key: string]: CompletionItem[] } = {
        ifAppInfo: ifAppInfoCompletionItems,
        ifAppManager: ifAppManagerCompletionItems,
        ifArray: ifArrayCompletionItems,
        ifArrayJoin: ifArrayJoinCompletionItems,
        ifArraySort: ifArraySortCompletionItems,
        ifAssociativeArray: ifAssociativeArrayCompletionItems,
        ifAudioGuide: ifAudioGuideCompletionItems,
        ifAudioMetadata: ifAudioMetadataCompletionItems,
        ifAudioPlayer: ifAudioPlayerCompletionItems,
        ifAudioResource: ifAudioResourceCompletionItems
    };

    public provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken, context: vscode.CompletionContext): CompletionItem[] {
        let linePrefix = document.lineAt(position).text.substr(0, position.character).toLowerCase();

        for (let key in this.interfaceDictionary) {
            if (linePrefix.endsWith('.' + key.toLowerCase() + '.')) {
                return this.interfaceDictionary[key];
            }
        }

        return undefined;
    }
}
