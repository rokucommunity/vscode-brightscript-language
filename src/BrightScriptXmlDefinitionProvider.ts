import * as vscode from 'vscode';
import type {
    CancellationToken,
    Definition,
    DefinitionProvider, Position, TextDocument
} from 'vscode';

import { BrightScriptDeclaration } from './BrightScriptDeclaration';
import BrightScriptFileUtils from './BrightScriptFileUtils';
import { getExcludeGlob } from './DeclarationProvider';
import type { DefinitionRepository } from './DefinitionRepository';
import { XmlUtils, XmlWordType } from './XmlUtils';

export default class BrightScriptXmlDefinitionProvider implements DefinitionProvider {

    constructor(repo: DefinitionRepository) {
        this.repo = repo;
        this.fileUtils = new BrightScriptFileUtils();
        this.xmlUtils = new XmlUtils();
    }

    private repo: DefinitionRepository;
    private xmlUtils: XmlUtils;
    private fileUtils: BrightScriptFileUtils;

    public async provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Promise<Definition> {
        //1. if it's not an xml doc, return empty
        if (!document.fileName.toLowerCase().endsWith('.xml') || !document.getText()) {
            return [];
        }

        let definitions = [];
        //2. if it's an xml element, jump to matching doc
        let xmlWordType = this.xmlUtils.getXmlWordType(document, position, token);
        let word = this.xmlUtils.getWord(document, position, xmlWordType).toLowerCase();

        await this.repo.sync();

        switch (xmlWordType) {
            case XmlWordType.Tag:
                definitions = await this.getXmlFileMatchingWord(word);
                break;
            case XmlWordType.AttributeValue:
                //TODO - ascertain if this value is from an import tag!
                if (word.endsWith('.brs')) {
                    //assume it's a document
                    definitions = await this.getSymbolForBrsFile(word);
                } else {
                    //assume it's a symbol in our codebehind file
                    definitions = await this.getBrsSymbolsMatchingWord(document, position, word);
                }
                break;
            default:
                break;
        }

        return definitions;
    }

    private async getXmlFileMatchingWord(word: string): Promise<Definition[]> {
        let definitions = [];

        const excludes = getExcludeGlob();

        for (const uri of await vscode.workspace.findFiles('**/*.xml', excludes)) {
            let path = uri.path.toLowerCase();
            if (path.includes(word) && path.endsWith('.xml')) {
                let definition = BrightScriptDeclaration.fromUri(uri);
                definitions.push(definition.getLocation());
                if (path.endsWith(word + '.xml')) {
                    definitions = [definition.getLocation()];
                    break;
                }
            }
        }
        return definitions;
    }

    private async getBrsSymbolsMatchingWord(document: TextDocument, position: Position, word: string): Promise<Definition[]> {
        let alternateFilename = this.fileUtils.getAlternateFileName(document.fileName);
        let definitions = [];

        if (alternateFilename) {
            let uri = vscode.Uri.file(alternateFilename);
            let doc = await vscode.workspace.openTextDocument(uri); // calls back into the provider
            if (doc) {
                for (const d of this.repo.findDefinitionInDocument(doc, word)) {
                    definitions.push(d.getLocation());
                }
            }
        }
        return definitions;
    }

    private async getSymbolForBrsFile(word: string): Promise<Definition[]> {
        let definitions = [];
        for (const def of await this.repo.findDefinitionForBrsDocument(word)) {
            definitions.push(def.getLocation());
        }
        return definitions;
    }
}
