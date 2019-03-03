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
import { ifByteArrayCompletionItems } from './BrightScriptCompletionItems/ifByteArrayCompletionItems';
import { ifChannelStoreCompletionItems } from './BrightScriptCompletionItems/ifChannelStoreCompletionItems';
import { ifCompositorCompletionItems } from './BrightScriptCompletionItems/ifCompositorCompletionItems';
import { ifDateTimeCompletionItems } from './BrightScriptCompletionItems/ifDateTimeCompletionItems';
import { ifDeviceInfoCompletionItems } from './BrightScriptCompletionItems/ifDeviceInfoCompletionItems';
import { ifDraw2DCompletionItems } from './BrightScriptCompletionItems/ifDraw2DCompletionItems';
import { ifEnumCompletionItems } from './BrightScriptCompletionItems/ifEnumCompletionItems';
import { ifEVPCipherCompletionItems } from './BrightScriptCompletionItems/ifEVPCipherCompletionItems';
import { ifEVPDigestCompletionItems } from './BrightScriptCompletionItems/ifEVPDigestCompletionItems';
import { ifFileSystemCompletionItems } from './BrightScriptCompletionItems/ifFileSystemCompletionItems';
import { ifFontCompletionItems } from './BrightScriptCompletionItems/ifFontCompletionItems';
import { ifFontRegistryCompletionItems } from './BrightScriptCompletionItems/ifFontRegistryCompletionItems';
import { ifHdmiStatusCompletionItems } from './BrightScriptCompletionItems/ifHdmiStatusCompletionItems';
import { ifHMACCompletionItems } from './BrightScriptCompletionItems/ifHMACCompletionItems';
import { ifHttpAgentCompletionItems } from './BrightScriptCompletionItems/ifHttpAgentCompletionItems';
import { ifImageMetadataCompletionItems } from './BrightScriptCompletionItems/ifImageMetadataCompletionItems';
import { ifListCompletionItems } from './BrightScriptCompletionItems/ifListCompletionItems';
import { ifLocalizationCompletionItems } from './BrightScriptCompletionItems/ifLocalizationCompletionItems';

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
        ifAudioResource: ifAudioResourceCompletionItems,
        ifByteArray: ifByteArrayCompletionItems,
        ifChannelStore: ifChannelStoreCompletionItems,
        ifCompositor: ifCompositorCompletionItems,
        ifDateTime: ifDateTimeCompletionItems,
        ifDeviceInfo: ifDeviceInfoCompletionItems,
        ifDraw2D: ifDraw2DCompletionItems,
        ifEnum: ifEnumCompletionItems,
        ifEVPCipher: ifEVPCipherCompletionItems,
        ifEVPDigest: ifEVPDigestCompletionItems,
        ifFileSystem: ifFileSystemCompletionItems,
        ifFont: ifFontCompletionItems,
        ifFontRegistry: ifFontRegistryCompletionItems,
        ifHdmiStatus: ifHdmiStatusCompletionItems,
        ifHMAC: ifHMACCompletionItems,
        ifHttpAgent: ifHttpAgentCompletionItems,
        ifImageMetadata: ifImageMetadataCompletionItems,
        ifList: ifListCompletionItems,
        ifLocalization: ifLocalizationCompletionItems
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
