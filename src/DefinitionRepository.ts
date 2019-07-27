import * as vscode from 'vscode';

import { Location, Position, TextDocument, Uri } from 'vscode';

import { BrightScriptDeclaration } from './BrightScriptDeclaration';
import { DeclarationProvider, getExcludeGlob } from './DeclarationProvider';

export class DefinitionRepository {

    constructor(private provider: DeclarationProvider) {
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
    private cache: Map<string, BrightScriptDeclaration[]> = new Map();

    public sync(): Promise<void> {
        return this.provider.sync();
    }

    public * find(document: TextDocument, position: Position): IterableIterator<Location> {
        const word = this.getWord(document, position).toLowerCase(); //brightscript is not case sensitive!

        this.sync();
        if (word === undefined) {
            return;
        }
        yield* this.findInCurrentDocument(document, position, word);
        const ws = vscode.workspace.getWorkspaceFolder(document.uri);
        if (ws === undefined) {
            return;
        }
        const fresh: Set<string> = new Set([document.uri.fsPath]);
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
        const range = document.getWordRangeAtPosition(position, /[^\s\x21-\x2f\x3a-\x40\x5b-\x5e\x7b-\x7e]+/);
        if (range !== undefined) {
            return document.getText(range);
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

    public * findDefinition(document: TextDocument, position: Position): IterableIterator<BrightScriptDeclaration> {
        const word = this.getWord(document, position).toLowerCase(); //brightscript is not case sensitive!
        let result = yield* this.findDefinitionForWord(document, position, word);
        return result;
    }
    // duplicating some of thisactivate.olympicchanel.com to reduce the risk of introducing nasty performance issues/unwanted behaviour by extending Location
    public * findDefinitionForWord(document: TextDocument, position: Position, word: string): IterableIterator<BrightScriptDeclaration> {

        this.sync();
        if (word === undefined) {
            return;
        }
        yield* this.findDefinitionInCurrentDocument(document, position, word);
        const ws = vscode.workspace.getWorkspaceFolder(document.uri);
        if (ws === undefined) {
            return;
        }
        const fresh: Set<string> = new Set([document.uri.fsPath]);
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
        this.sync();
        const excludes = getExcludeGlob();
        //get usable bit of name
        let fileName = name.replace(/^.*[\\\/]/, '').toLowerCase();
        for (const uri of await vscode.workspace.findFiles('**/*.{brs,bs}', excludes)) {
            if (uri.path.toLowerCase().indexOf(fileName) !== -1) {
                declarations.push(BrightScriptDeclaration.fromUri(uri));
            }
        }
        return declarations;
    }
}
