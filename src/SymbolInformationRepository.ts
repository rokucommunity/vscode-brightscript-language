import * as vscode from 'vscode';

import {
  CancellationToken,
  Location,
  SymbolInformation, SymbolKind,
  TextDocument,
  Uri,
  WorkspaceSymbolProvider
} from 'vscode';

import { DeclarationProvider } from './DeclarationProvider';

export class BrightScriptWorkspaceSymbolProvider implements WorkspaceSymbolProvider {

    constructor(provider: DeclarationProvider, symbolInformationRepository: SymbolInformationRepository) {
        this.declarationProvider = provider;
        this.repo = symbolInformationRepository;
    }

    private declarationProvider: DeclarationProvider;
    private repo: SymbolInformationRepository;

    public provideWorkspaceSymbols(query: string, token: CancellationToken): Promise<SymbolInformation[]> {
        return this.repo.sync().then(() => Array.from(this.repo.find(query)));
    }
}

export class SymbolInformationRepository {

    constructor(private provider: DeclarationProvider) {
        this.declarationProvider = provider;
        provider.onDidChange((e) => {
            this.cache.set(e.uri.fsPath, e.decls
                .map((d) => this.declarationProvider.declToSymbolInformation(e.uri, d)));
        });
        provider.onDidDelete((e) => {
            this.cache.delete(e.uri.fsPath);
        });
        provider.onDidReset((e) => {
            this.cache.clear();
        });
    }

    private declarationProvider: DeclarationProvider;
    private cache: Map<string, SymbolInformation[]> = new Map();

    public sync(): Promise<void> {
        return this.provider.sync();
    }

    public * find(query: string): IterableIterator<SymbolInformation> {
        const pattern = this.compileQuery(query);
        if (pattern === undefined) {
            return;
        }
        const fresh: Set<string> = new Set();
        for (const doc of vscode.workspace.textDocuments) {
            if (!doc.isDirty) {
                continue;
            }
            if (!this.cache.has(doc.uri.fsPath)) {
                continue;
            }
            fresh.add(doc.uri.fsPath);
            yield* this.findInDocument(doc, pattern);
        }
        for (const [path, symbols] of this.cache.entries()) {
            if (fresh.has(path)) {
                continue;
            }
            yield* symbols.filter((s) => pattern.test(s.name));
        }
    }

    private compileQuery(query: string): RegExp | undefined {
        if (query.length === 0) {
            return;
        }
        const chars = Array.from(query).map((c) => {
            const uc = c.toUpperCase();
            const lc = c.toLowerCase();
            return uc === lc ? c : `[${uc}${lc}]`;
        });
        return new RegExp(chars.join('.*'));
    }

    private findInDocument(document: TextDocument, pattern: RegExp): SymbolInformation[] {
        return this.declarationProvider.readDeclarations(document.uri, document.getText())
            .filter((d) => pattern.test(d.name))
            .map((d) => this.declarationProvider.declToSymbolInformation(document.uri, d));
    }
}
