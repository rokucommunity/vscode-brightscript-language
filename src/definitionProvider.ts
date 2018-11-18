import * as vscode from "vscode";

import { Location, Position, TextDocument, Uri } from "vscode";

import { Declaration, DeclarationProvider, readDeclarations } from "./declaration";

function declToDefinition(uri: Uri, decl: Declaration): Location {
  return new Location(uri, decl.nameRange);
}

class DefinitionInfo {
  constructor(public name: string, public location: Location) {
  }
}

export class DefinitionRepository {
  private cache: Map<string, DefinitionInfo[]> = new Map();

  constructor(private provider: DeclarationProvider) {
    provider.onDidChange((e) => {
      this.cache.set(e.uri.fsPath, e.decls.filter((d) => d.isGlobal)
        .map((d) => new DefinitionInfo(d.name, declToDefinition(e.uri, d))));
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

  public *find(document: TextDocument, position: Position): IterableIterator<Location> {
    const word = this.getWord(document, position).toLowerCase(); //brightscript is not case sensitive!
    console.log("find word" + word);
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
      yield* defs.filter((d) => d.name.toLowerCase() === word).map((d) => d.location);
    }
  }

  private getWord(document: TextDocument, position: Position): string {
    const range = document.getWordRangeAtPosition(position, /[^\s\x21-\x2f\x3a-\x40\x5b-\x5e\x7b-\x7e]+/);
    if (range !== undefined) {
      return document.getText(range);
    }
  }

  private findInCurrentDocument(document: TextDocument, position: Position, word: string): Location[] {
    return readDeclarations(document.getText())
      .filter((d) => d.name.toLowerCase() === word && d.visible(position))
      .map((d) => declToDefinition(document.uri, d));
  }

  private findInDocument(document: TextDocument, word: string): Location[] {
    return readDeclarations(document.getText())
      .filter((d) => d.name.toLowerCase() === word && d.isGlobal)
      .map((d) => declToDefinition(document.uri, d));
  }
}