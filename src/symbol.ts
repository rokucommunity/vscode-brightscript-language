import * as vscode from "vscode";

import { Location, SymbolInformation, TextDocument, Uri } from "vscode";

import { Declaration, DeclarationProvider, readDeclarations } from "./declaration";

function declToSymbolInformation(uri: Uri, decl: Declaration): SymbolInformation {
  return new SymbolInformation(
    decl.name,
    decl.kind,
    decl.containerName ? decl.containerName : decl.name,
    new Location(uri, decl.bodyRange),
  );
}

export function readSymbolInformations(uri: Uri, input: string): SymbolInformation[] {
  return readDeclarations(input).map((d) => declToSymbolInformation(uri, d));
}

export class SymbolInformationRepository {
  private cache: Map<string, SymbolInformation[]> = new Map();

  constructor(private provider: DeclarationProvider) {
    provider.onDidChange((e) => {
      this.cache.set(e.uri.fsPath, e.decls
        .map((d) => declToSymbolInformation(e.uri, d)));
    });
    provider.onDidDelete((e) => {
      this.cache.delete(e.uri.fsPath);
    });
    provider.onDidReset((e) => {
      this.cache.clear();
    });
  }

  public sync(): Promise<void> {
    return this.provider.sync();
  }

  public *find(query: string): IterableIterator<SymbolInformation> {
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
    return new RegExp(chars.join(".*"));
  }

  private findInDocument(document: TextDocument, pattern: RegExp): SymbolInformation[] {
    return readDeclarations(document.getText())
      .filter((d) => pattern.test(d.name))
      .map((d) => declToSymbolInformation(document.uri, d));
  }
}