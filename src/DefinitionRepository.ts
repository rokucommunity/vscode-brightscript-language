import * as vscode from "vscode";

import { Location, Position, TextDocument, Uri } from "vscode";
import { BrightscriptDeclaration } from "./BrightscriptDeclaration";
import {DeclarationProvider,  readDeclarations } from "./DeclarationProvider";


export class DefinitionRepository {
  private cache: Map<string, BrightscriptDeclaration[]> = new Map();

  constructor(private provider: DeclarationProvider) {
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

  public sync(): Promise<void> {
    return this.provider.sync();
  }

  public *find(document: TextDocument, position: Position): IterableIterator<Location> {
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
    return readDeclarations(document.uri, document.getText())
    .filter((d) => {
      return d.name.toLowerCase() === word && d.visible(position);
    })
    .map((d) => { 
      return d.getLocation();
    });
  }
  
  private findInDocument(document: TextDocument, word: string): Location[] {
    return readDeclarations(document.uri, document.getText())
      .filter((d) => d.name.toLowerCase() === word && d.isGlobal)
      .map((d) => d.getLocation());
  }

  // duplicating some of this to reduce the risk of introducing nasty performance issues/unwanted behaviour by extending Location
  public *findDefinition(document: TextDocument, position: Position): IterableIterator<BrightscriptDeclaration> {
    const word = this.getWord(document, position).toLowerCase(); //brightscript is not case sensitive!

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
      console.log(">>>>>doc " + doc.uri.path);

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

  private findDefinitionInCurrentDocument(document: TextDocument, position: Position, word: string): BrightscriptDeclaration[] {
    return readDeclarations(document.uri, document.getText())
      .filter((d) => d.name.toLowerCase() === word && d.visible(position));
  }

  private findDefinitionInDocument(document: TextDocument, word: string): BrightscriptDeclaration[] {
    return readDeclarations(document.uri, document.getText())
      .filter((d) => d.name.toLowerCase() === word && d.isGlobal);
  }
}