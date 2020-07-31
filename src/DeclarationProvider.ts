import * as fs from 'fs-extra';
import * as iconv from 'iconv-lite';
import * as vscode from 'vscode';

import {
    Disposable,
    Event,
    EventEmitter, Location,
    Position,
    Range, SymbolInformation,
    SymbolKind,
    Uri
} from 'vscode';

import { BrightScriptDeclaration } from './BrightScriptDeclaration';

///////////////////////////////////////////////////////////////////////////////////////////////////////////
// CREDIT WHERE CREDIT IS DUE
// georgejecook: I lifted most of the declaration and symbol work from sasami's era basic implementation
// at https://github.com/sasami/vscode-erabasic and hacked it in with some basic changes
///////////////////////////////////////////////////////////////////////////////////////////////////////////

export function* iterlines(input: string): IterableIterator<[number, string]> {
    const lines = input.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const text = lines[i];
        if (/^\s*(?:$|;(?![!#];))/.test(text)) {
            continue;
        }
        yield [i, text];
    }
}

export class WorkspaceEncoding {

    constructor() {
        this.reset();
    }

    private encoding: string[][];

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
        const encoding: string = vscode.workspace.getConfiguration('files', uri).get('encoding', 'utf8');
        if (encoding === 'utf8bom') {
            return 'utf8';  // iconv-lite removes bom by default when decoding, so this is fine
        }
        return encoding;
    }
}

export class DeclarationChangeEvent {
    constructor(public uri: Uri, public decls: BrightScriptDeclaration[]) {
    }
}

export class DeclarationDeleteEvent {
    constructor(public uri: Uri) {
    }
}

export class DeclarationProvider implements Disposable {
    constructor() {
        const subscriptions: Disposable[] = [];

        const watcher = vscode.workspace.createFileSystemWatcher('**/*.{brs,bs}');
        watcher.onDidCreate(this.onDidChangeFile, this);
        watcher.onDidChange(this.onDidChangeFile, this);
        watcher.onDidDelete(this.onDidDeleteFile, this);
        subscriptions.push(watcher);

        vscode.workspace.onDidChangeConfiguration(this.onDidChangeWorkspace, this, subscriptions);
        vscode.workspace.onDidChangeWorkspaceFolders(this.onDidChangeWorkspace, this, subscriptions);

        this.disposable = Disposable.from(...subscriptions);
        this.flush();
    }
    public cache: Map<string, BrightScriptDeclaration[]> = new Map();
    private fullscan: boolean = true;

    private dirty: Map<string, Uri> = new Map();
    private fileNamespaces = new Map<Uri, Set<string>>();
    private fileClasses = new Map<Uri, Set<string>>();
    private allNamespaces = new Map<string, BrightScriptDeclaration>();
    private allClasses = new Map<string, BrightScriptDeclaration>();

    private syncing: Promise<void>;
    private encoding: WorkspaceEncoding = new WorkspaceEncoding();

    private disposable: Disposable;

    private onDidChangeEmitter: EventEmitter<DeclarationChangeEvent> = new EventEmitter();
    private onDidDeleteEmitter: EventEmitter<DeclarationDeleteEvent> = new EventEmitter();
    private onDidResetEmitter: EventEmitter<void> = new EventEmitter();

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
        console.log('onDidChangeFile ' + uri.path);
        const excludes = getExcludeGlob();
        this.dirty.set(uri.fsPath, uri);
    }

    private onDidDeleteFile(uri: Uri) {
        this.dirty.delete(uri.fsPath);
        this.onDidDeleteEmitter.fire(new DeclarationDeleteEvent(uri));
    }

    private onDidChangeWorkspace() {
        console.log('onDidChangeWorkspace 33');
        this.fullscan = true;
        this.dirty.clear();
        this.encoding.reset();
        this.onDidResetEmitter.fire();
    }

    private async flush(): Promise<void> {
        const excludes = getExcludeGlob();

        if (this.fullscan) {
            this.fullscan = false;

            for (const uri of await vscode.workspace.findFiles('**/*.{brs,bs}', excludes)) {
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
                        if (typeof err === 'object' && err.code === 'ENOENT') {
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
                this.onDidChangeEmitter.fire(new DeclarationChangeEvent(uri, this.readDeclarations(uri, input)));
            }
        }
    }

    public readDeclarations(uri: Uri, input: string): BrightScriptDeclaration[] {
        const container = BrightScriptDeclaration.fromUri(uri);
        const symbols: BrightScriptDeclaration[] = [];
        let currentFunction: BrightScriptDeclaration;
        let funcEndLine: number;
        let funcEndChar: number;
        let mDefs = {};

        let oldNamespaces = this.fileNamespaces.get(uri);
        if (oldNamespaces) {
            for (let key of oldNamespaces.keys()) {
                let ns = this.allNamespaces.get(key);
                if (ns && ns.uri === uri) {
                    this.allNamespaces.delete(key);
                }
            }
        }
        this.fileNamespaces.delete(uri);

        let oldClasses = this.fileClasses.get(uri);
        if (oldClasses) {

            for (let key of oldClasses.keys()) {
                let clazz = this.allClasses.get(key);
                if (clazz && clazz.uri === uri) {
                    this.allClasses.delete(key);
                }
            }
        }
        this.fileClasses.delete(uri);

        let namespaces = new Set<string>();
        let classes = new Set<string>();
        let namespaceSymbol: BrightScriptDeclaration | null;
        let classSymbol: BrightScriptDeclaration | null;

        for (const [line, text] of iterlines(input)) {
            // console.log("" + line + ": " + text);
            funcEndLine = line;
            funcEndChar = text.length;

            //FUNCTION START
            let match = /^\s*(?:public|protected|private)*\s*(?:override)*\s*(?:function|sub)\s+(.*[^\(])\s*\((.*)\)/i.exec(text);
            // console.log("match " + match);
            if (match !== null) {
                // function has started
                if (currentFunction !== undefined) {
                    currentFunction.bodyRange = currentFunction.bodyRange.with({ end: new Position(funcEndLine, funcEndChar) });
                }
                currentFunction = new BrightScriptDeclaration(
                    match[1].trim(),
                    match[1].trim().toLowerCase() === 'new' ? SymbolKind.Constructor : SymbolKind.Function,
                    container,
                    match[2].split(','),
                    new Range(line, match[0].length - match[1].length - match[2].length - 2, line, match[0].length - 1),
                    new Range(line, 0, line, text.length),
                );
                symbols.push(currentFunction);

                if (classSymbol) {
                    currentFunction.container = classSymbol;
                } else if (namespaceSymbol) {
                    currentFunction.container = namespaceSymbol;
                }
                continue;
            }

            //FUNCTION END
            match = /^\s*(end)\s*(function|sub)/i.exec(text);
            if (match !== null) {
                // console.log("function END");
                if (currentFunction !== undefined) {
                    currentFunction.bodyRange = currentFunction.bodyRange.with({ end: new Position(funcEndLine, funcEndChar) });
                }
                continue;
            }

            // //FIELD
            match = /^(?!.*\()(?: |\t)*(public|private|protected)(?: |\t)*([a-z|\.|_]*).*((?: |\t)*=(?: |\t)*.*)*$/i.exec(text);
            if (match !== null) {
                // console.log("FOUND VAR " + match);
                const name = match[2].trim();
                if (mDefs[name] !== true) {
                    mDefs[name] = true;
                    let varSymbol = new BrightScriptDeclaration(
                        name,
                        SymbolKind.Field,
                        container,
                        undefined,
                        new Range(line, match[0].length - match[1].length, line, match[0].length),
                        new Range(line, 0, line, text.length),
                    );
                    console.log('FOUND VAR ' + varSymbol.name);
                    symbols.push(varSymbol);

                    if (classSymbol) {
                        varSymbol.container = classSymbol;
                    } else if (namespaceSymbol) {
                        varSymbol.container = namespaceSymbol;
                    }
                }
                continue;
            }

            //start namespace declaration
            match = /^(?: |\t)*namespace(?: |\t)*([a-z|\.|_]*).*$/i.exec(text);
            if (match !== null) {
                const name = match[1].trim();
                if (name) {
                    namespaceSymbol = new BrightScriptDeclaration(
                        name,
                        SymbolKind.Namespace,
                        container,
                        undefined,
                        new Range(line, match[0].length - match[1].length, line, match[0].length),
                        new Range(line, 0, line, text.length),
                    );
                    // console.log('FOUND NAMESPACES ' + namespaceSymbol.name);
                    symbols.push(namespaceSymbol);
                    namespaces.add(name.toLowerCase());
                }
            }
            //end namespace declaration
            match = /^(?: |\t)*end namespace.*$/i.exec(text);
            if (match !== null && namespaceSymbol) {
                namespaceSymbol = null;
            }

            //start class declaration
            match = /(?:(class)\s+([a-z_][a-z0-9_]*))\s*(?:extends\s*([a-z_][a-z0-9_]+))*$/i.exec(text);
            if (match !== null) {
                const name = match[2].trim();
                if (name) {
                    classSymbol = new BrightScriptDeclaration(
                        name,
                        SymbolKind.Class,
                        container,
                        undefined,
                        new Range(line, match[0].length - match[2].length, line, match[0].length),
                        new Range(line, 0, line, text.length),
                    );
                    // console.log('FOUND CLASS ' + classSymbol.name);
                    symbols.push(classSymbol);
                    classes.add(name.toLowerCase());
                }
            }

        }
        this.fileNamespaces.set(uri, namespaces);
        this.fileClasses.set(uri, classes);
        this.cache.set(uri.fsPath, symbols);
        return symbols;
    }

    public declToSymbolInformation(uri: Uri, decl: BrightScriptDeclaration): SymbolInformation {
        return new SymbolInformation(
            decl.name,
            decl.kind,
            decl.containerName ? decl.containerName : decl.name,
            new Location(uri, decl.bodyRange),
        );
    }

    public getFunctionBeforeLine(filePath: string, lineNumber: number): BrightScriptDeclaration | null {
        let symbols = this.cache.get(filePath);
        if (!symbols) {
            try {

                let uri = vscode.Uri.file(filePath);
                let decls = this.readDeclarations(uri, fs.readFileSync(filePath, 'utf8'));
                this.cache.set(filePath, decls);
                // if there was no match, then get the declarations now
                symbols = this.cache.get(filePath);
            } catch (e) {
                console.error(`error loading symbols for file ${filePath}: ${e.message}`);
            }
        }
        //try to load it now
        if (symbols) {
            const matchingMethods = symbols
                .filter((symbol) => symbol.kind === SymbolKind.Function && symbol.nameRange.start.line < lineNumber);
            return matchingMethods.length > 0 ? matchingMethods[matchingMethods.length - 1] : null;
        }
        return null;
    }

}

export function getExcludeGlob(): string {
    const exclude = [
        ...Object.keys(vscode.workspace.getConfiguration('search', null).get('exclude') || {}),
        ...Object.keys(vscode.workspace.getConfiguration('files', null).get('exclude') || {})
    ].join(',');
    return `{${exclude}}`;
}
