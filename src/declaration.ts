import * as fs from "fs";
import * as iconv from "iconv-lite";
import * as vscode from "vscode";

import { Disposable, Event, EventEmitter, Position, Range, SymbolInformation, SymbolKind, Uri } from "vscode";

///////////////////////////////////////////////////////////////////////////////////////////////////////////
// CREDIT WHERE CREDIT IS DUE
// georgejecook: I lifted most of the declration and symbol work from sasami's era basic implementation
// at https://github.com/sasami/vscode-erabasic and hcked it in with some basic changes
///////////////////////////////////////////////////////////////////////////////////////////////////////////
export class Declaration {
  constructor(
    public name: string,
    public kind: SymbolKind,
    public container: Declaration | undefined,
    public nameRange: Range,
    public bodyRange: Range) {

  }


  get isGlobal(): boolean {
    return this.container === undefined;
  }

  get containerName(): string | undefined {
    return this.container && this.container.name;
  }

  public visible(position: Position): boolean {
    return this.container === undefined || this.container.bodyRange.contains(position);
  }
}

function* iterlines(input: string): IterableIterator<[number, string]> {
  const lines = input.split(/\r?\n/);
  loop: for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    if (/^\s*(?:$|;(?![!#];))/.test(text)) {
      continue;
    }
    yield [i, text];
  }
}

export function readDeclarations(input: string): Declaration[] {
  const symbols: Declaration[] = [];
  let currentFunction: Declaration;
  let funcEndLine: number;
  let funcEndChar: number;
  let mDefs = {};
  console.log("READ DECLARATIONS");
  for (const [line, text] of iterlines(input)) {
    // console.log("" + line + ": " + text);
    funcEndLine = line;
    funcEndChar = text.length;

    //FUNCTION START
    let match = /^(?:function|sub)\s+(.*[^\(])\(/i.exec(text);
    console.log("match " + match);
    if (match !== null) {
      console.log("function START");
      // function has started
      if (currentFunction !== undefined) {
        currentFunction.bodyRange = currentFunction.bodyRange.with({ end: new Position(funcEndLine, funcEndChar) });
      }
      currentFunction = new Declaration(
        match[1],
        SymbolKind.Function,
        undefined,
        new Range(line, match[0].length - match[1].length -1, line, match[0].length -1),
        new Range(line, 0, line, text.length),
      );
      console.log("function START", currentFunction.name);
      symbols.push(currentFunction);
      continue;
    }

    //FUNCTION END
    match = /^\s*(end)\s*(function|sub)/i.exec(text);
    if (match !== null) {
      console.log("function END");
      if (currentFunction !== undefined) {
        currentFunction.bodyRange = currentFunction.bodyRange.with({ end: new Position(funcEndLine, funcEndChar) });
      }
      continue;
    }

    // //VAR
    match = /^\s*(?:m\.)([a-zA-Z_0-9]*)/i.exec(text);
    if (match !== null) {
      // console.log("FOUND VAR " + match);
      const name = match[1].trim();
      if (mDefs[name] !== true) {
        mDefs[name] = true;
        let varSymbol = new Declaration(
          name,
          SymbolKind.Field,
          undefined,
          new Range(line, match[0].length - match[1].length, line, match[0].length),
          new Range(line, 0, line, text.length),
        );
        console.log("FOUND VAR " + varSymbol.name);
        symbols.push(varSymbol);
      }
      continue;
    }
  }
  return symbols;
}

class WorkspaceEncoding {
  private encoding: string[][];

  constructor() {
    this.reset();
  }

  public find(path: string): string {
    return this.encoding.find((v) => path.startsWith(v[0]))[1];
  }

  public reset() {
    this.encoding = [];
    for (const folder of vscode.workspace.workspaceFolders) {
      this.encoding.push([folder.uri.fsPath, this.getConfiguration(folder.uri)]);
    }
  }

  private getConfiguration(uri: Uri): string {
    const encoding: string = vscode.workspace.getConfiguration("files", uri).get("encoding", "utf8");
    if (encoding === "utf8bom") {
      return "utf8";  // iconv-lite removes bom by default when decoding, so this is fine
    }
    return encoding;
  }
}

export class DeclarationChangeEvent {
  constructor(public uri: Uri, public decls: Declaration[]) {
  }
}

export class DeclarationDeleteEvent {
  constructor(public uri: Uri) {
  }
}

export class DeclarationProvider implements Disposable {
  private fullscan: boolean = true;

  private dirty: Map<string, Uri> = new Map();

  private syncing: Promise<void>;
  private encoding: WorkspaceEncoding = new WorkspaceEncoding();

  private disposable: Disposable;

  private onDidChangeEmitter: EventEmitter<DeclarationChangeEvent> = new EventEmitter();
  private onDidDeleteEmitter: EventEmitter<DeclarationDeleteEvent> = new EventEmitter();
  private onDidResetEmitter: EventEmitter<void> = new EventEmitter();

  constructor() {
    const subscriptions: Disposable[] = [];

    const watcher = vscode.workspace.createFileSystemWatcher("**/*.brs");
    watcher.onDidCreate(this.onDidChangeFile, this);
    watcher.onDidChange(this.onDidChangeFile, this);
    watcher.onDidDelete(this.onDidDeleteFile, this);
    subscriptions.push(watcher);

    vscode.workspace.onDidChangeConfiguration(this.onDidChangeWorkspace, this, subscriptions);
    vscode.workspace.onDidChangeWorkspaceFolders(this.onDidChangeWorkspace, this, subscriptions);

    this.disposable = Disposable.from(...subscriptions);
  }

  get onDidChange(): Event<DeclarationChangeEvent> {
    return this.onDidChangeEmitter.event;
  }

  get onDidDelete(): Event<DeclarationDeleteEvent> {
    return this.onDidDeleteEmitter.event;
  }

  get onDidReset(): Event<void> {
    return this.onDidResetEmitter.event;
  }

  public sync(): Promise<void> {
    console.log("syncing 11");
    if (this.syncing === undefined) {
      this.syncing = this.flush().then(() => {
        this.syncing = undefined;
      });
    }
    return this.syncing;
  }

  public dispose() {
    this.disposable.dispose();
  }

  private onDidChangeFile(uri: Uri) {
    console.log("onDidChangeFile 11");
    this.dirty.set(uri.fsPath, uri);
  }

  private onDidDeleteFile(uri: Uri) {
    this.dirty.delete(uri.fsPath);
    this.onDidDeleteEmitter.fire(new DeclarationDeleteEvent(uri));
  }

  private onDidChangeWorkspace() {
    console.log("onDidChangeWorkspace 33");
    this.fullscan = true;
    this.dirty.clear();
    this.encoding.reset();
    this.onDidResetEmitter.fire();
  }

  private async flush(): Promise<void> {
    if (this.fullscan) {
      this.fullscan = false;
      for (const uri of await vscode.workspace.findFiles("**/*.brs")) {
        this.dirty.set(uri.fsPath, uri);
      }
    }
    if (this.dirty.size === 0) {
      return;
    }
    for (const [path, uri] of Array.from(this.dirty)) {
      const input = await new Promise<string>((resolve, reject) => {
        fs.readFile(path, (err, data) => {
          if (err) {
            if (typeof err === "object" && err.code === "ENOENT") {
              resolve();
            } else {
              reject(err);
            }
          } else {
            resolve(iconv.decode(data, this.encoding.find(path)));
          }
        });
      });
      if (input === undefined) {
        this.dirty.delete(path);
        this.onDidDeleteEmitter.fire(new DeclarationDeleteEvent(uri));
        continue;
      }
      if (this.dirty.delete(path)) {
        this.onDidChangeEmitter.fire(new DeclarationChangeEvent(uri, readDeclarations(input)));
      }
    }
  }
}