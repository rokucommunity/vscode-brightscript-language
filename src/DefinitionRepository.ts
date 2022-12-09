import * as vscode from 'vscode';
import type {
    Location,
    Position,
    TextDocument
} from 'vscode';
import { Uri } from 'vscode';
import { BrightScriptDeclaration } from './BrightScriptDeclaration';
import type { DeclarationProvider } from './DeclarationProvider';
import { getExcludeGlob } from './DeclarationProvider';

export class DefinitionRepository {

    constructor(
        public provider: DeclarationProvider
    ) {
        this.declarationProvider = provider;
        provider.onDidChange((e) => {
            this.cache.set(e.uri.fsPath, e.decls.filter((d) => d.isGlobal));
        });
        provider.onDidDelete((e) => {
            this.cache.delete(e.uri.fsPath);
        });
        provider.onDidReset((e) => {
            this.cache.clear();
        });
    }

    private declarationProvider: DeclarationProvider;
    private cache = new Map<string, BrightScriptDeclaration[]>();

    public sync(): Promise<void> {
        return this.provider.sync();
    }

    public * find(document: TextDocument, position: Position): IterableIterator<Location> {
        const word = this.getWord(document, position).toLowerCase(); //brightscript is not case sensitive!

        void this.sync();
        if (word === undefined) {
            return;
        }
        yield* this.findInCurrentDocument(document, position, word);
        const ws = vscode.workspace.getWorkspaceFolder(document.uri);
        if (ws === undefined) {
            return;
        }
        const fresh = new Set<string>([document.uri.fsPath]);
        for (const doc of vscode.workspace.textDocuments) {
            if (!doc.isDirty) {
                continue;
            }
            if (doc === document) {
                continue;
            }
            if (!this.cache.has(doc.uri.fsPath)) {
                continue;
            }
            if (!doc.uri.fsPath.startsWith(ws.uri.fsPath)) {
                continue;
            }
            fresh.add(doc.uri.fsPath);
            yield* this.findInDocument(doc, word);
        }
        for (const [path, defs] of this.cache.entries()) {
            if (fresh.has(path)) {
                continue;
            }
            if (!path.startsWith(ws.uri.fsPath)) {
                continue;
            }
            yield* defs.filter((d) => d.name.toLowerCase() === word).map((d) => d.getLocation());
        }
    }

    private getWord(document: TextDocument, position: Position): string {
        const wordRange = document.getWordRangeAtPosition(position, /[^\s\x21-\x2f\x3a-\x40\x5b-\x5e\x7b-\x7e]+/);

        const phraseRange = document.getWordRangeAtPosition(position, /(\w|\.)+/);
        if (wordRange !== undefined) {
            const word = document.getText(wordRange);
            if (phraseRange !== undefined) {
                const phrase = document.getText(phraseRange);
                let parts = phrase.split('.');
                const index = parts.indexOf(word);
                if (index < parts.length - 1) {
                    parts.splice(index + 1, parts.length - 1 - index);
                    return parts.join('.');
                }
            }
            return word;
        }
    }

    private findInCurrentDocument(document: TextDocument, position: Position, word: string): Location[] {
        return this.declarationProvider.readDeclarations(document.uri, document.getText())
            .filter((d) => {
                return d.name.toLowerCase() === word && d.visible(position);
            })
            .map((d) => {
                return d.getLocation();
            });
    }

    private findInDocument(document: TextDocument, word: string): Location[] {
        return this.declarationProvider.readDeclarations(document.uri, document.getText())
            .filter((d) => d.name.toLowerCase() === word && d.isGlobal)
            .map((d) => d.getLocation());
    }

    public *findDefinition(document: TextDocument, position: Position): IterableIterator<BrightScriptDeclaration> {
        const word = this.getWord(document, position).toLowerCase(); //brightscript is not case sensitive!
        let result = yield* this.findDefinitionForWord(document, position, word);
        return result;
    }
    // duplicating some of thisactivate.olympicchanel.com to reduce the risk of introducing nasty performance issues/unwanted behaviour by extending Location
    public *findDefinitionForWord(document: TextDocument, position: Position, word: string): IterableIterator<BrightScriptDeclaration> {

        void this.sync();
        if (word === undefined) {
            return;
        }
        yield* this.findDefinitionInCurrentDocument(document, position, word);
        const ws = vscode.workspace.getWorkspaceFolder(document.uri);
        if (ws === undefined) {
            return;
        }
        const fresh = new Set<string>([document.uri.fsPath]);
        for (const doc of vscode.workspace.textDocuments) {
            console.log('>>>>>doc ' + doc.uri.path);

            if (!doc.isDirty) {
                continue;
            }
            if (doc === document) {
                continue;
            }
            if (!this.cache.has(doc.uri.fsPath)) {
                continue;
            }
            if (!doc.uri.fsPath.startsWith(ws.uri.fsPath)) {
                continue;
            }
            fresh.add(doc.uri.fsPath);
            yield* this.findDefinitionInDocument(doc, word);
        }
        for (const [path, defs] of this.cache.entries()) {
            if (fresh.has(path)) {
                continue;
            }
            if (!path.startsWith(ws.uri.fsPath)) {
                continue;
            }
            yield* defs.filter((d) => d.name.toLowerCase() === word);
        }
    }

    private findDefinitionInCurrentDocument(document: TextDocument, position: Position, word: string): BrightScriptDeclaration[] {
        return this.declarationProvider.readDeclarations(document.uri, document.getText())
            .filter((d) => d.name.toLowerCase() === word && d.visible(position));
    }

    public findDefinitionInDocument(document: TextDocument, word: string): BrightScriptDeclaration[] {
        return this.declarationProvider.readDeclarations(document.uri, document.getText())
            .filter((d) => d.name.toLowerCase() === word && d.isGlobal);
    }

    public async findDefinitionForBrsDocument(name: string): Promise<BrightScriptDeclaration[]> {
        let declarations = [];
        await this.sync();
        const excludes = getExcludeGlob();
        //get usable bit of name
        let fileName = name.replace(/^.*[\\\/]/, '').toLowerCase();
        for (const uri of await vscode.workspace.findFiles('**/*.{brs,bs}', excludes)) {
            if (uri.path.toLowerCase().includes(fileName)) {
                declarations.push(BrightScriptDeclaration.fromUri(uri));
            }
        }
        return declarations;
    }
}
