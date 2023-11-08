import { EventEmitter } from 'eventemitter3';
import type { Command, Range, TreeDataProvider, TreeItemCollapsibleState, Uri, WorkspaceFolder, ConfigurationScope, ExtensionContext, WorkspaceConfiguration, OutputChannel, QuickPickItem } from 'vscode';

//copied from vscode to help with unit tests
enum QuickPickItemKind {
    Separator = -1,
    Default = 0
}

afterEach(() => {
    delete vscode.workspace.workspaceFile;
    delete vscode.workspace._configuration;
    vscode.context.globalState['_data'] = {};
});

export let vscode = {
    env: {
        //disable all telemetry reporting during unit tests
        telemetryConfiguration: {
            isUsageEnabled: false,
            isErrorsEnabled: false,
            isCrashEnabled: false
        }
    },
    CompletionItem: class { },
    CodeLens: class { },
    CodeAction: class { },
    Diagnostic: class { },
    CallHierarchyItem: class { },
    QuickPickItemKind: QuickPickItemKind,
    StatusBarAlignment: {
        Left: 1,
        Right: 2
    },
    extensions: {
        getExtension: () => {
            let packageContents = require('../package.json');
            return {
                packageJSON: {
                    ...packageContents
                }
            };
        }
    },
    debug: {
        registerDebugConfigurationProvider: () => { },
        onDidStartDebugSession: () => { },
        onDidTerminateDebugSession: () => { },
        onDidReceiveDebugSessionCustomEvent: () => { }
    },
    languages: {
        registerDefinitionProvider: () => { },
        registerDocumentSymbolProvider: () => { },
        registerWorkspaceSymbolProvider: () => { },
        registerDocumentRangeFormattingEditProvider: () => { },
        registerSignatureHelpProvider: () => { },
        registerReferenceProvider: () => { },
        registerDocumentLinkProvider: () => { },
        registerCompletionItemProvider: () => { },
        createDiagnosticCollection: () => {
            return {
                clear: () => { }
            };
        }
    },
    subscriptions: [],
    commands: {
        registerCommand: () => {

        },
        executeCommand: () => {

        }
    },
    context: {
        subscriptions: [],
        asAbsolutePath: () => {
            return '';
        },
        extensionUri: undefined as Uri,
        extensionPath: '',
        storageUri: undefined as Uri,
        storagePath: '',
        globalStoragePath: '',
        globalState: {
            _data: {},
            update: function(key: string, value: any) {
                this._data[key] = value;
            },
            get: function(key: string) {
                return this._data[key];
            }
        } as any,
        workspaceState: {
            _data: {},
            update: function(key: string, value: any) {
                this._data[key] = value;
            },
            get: function(key: string) {
                return this._data[key];
            }
        } as any,
        globalStorageUri: undefined as Uri,
        environmentVariableCollection: {} as any,
        logUri: undefined as Uri,
        logPath: '',
        extensionMode: 2
    } as unknown as ExtensionContext,
    workspace: {
        workspaceFolders: [] as WorkspaceFolder[],
        workspaceFile: undefined as Uri,
        createFileSystemWatcher: () => {
            return {
                onDidCreate: () => {

                },
                onDidChange: () => {

                },
                onDidDelete: () => {

                }
            };
        },
        _configuration: {} as any,
        getConfiguration: function(configurationName: string, scope?: ConfigurationScope | null) {
            return {
                get: (name: string) => {
                    return this._configuration?.[`${configurationName}.${name}`];
                },
                inspect: (name: string) => {
                    return {
                        key: name,
                        globalValue: this._configuration?.[`${configurationName}.${name}`]
                    } as ReturnType<WorkspaceConfiguration['inspect']>;
                }
            };
        },
        onDidChangeConfiguration: () => { },
        onDidChangeWorkspaceFolders: () => { },
        findFiles: (include, exclude) => {
            return [];
        },
        fs: {
            writeFile: (uri, buffer) => { },
            readFile: (uri) => {
                return Buffer.alloc(0);
            }
        },
        registerTextDocumentContentProvider: () => { },
        onDidChangeTextDocument: () => { },
        onDidCloseTextDocument: () => { }
    },
    window: {
        showInputBox: () => { },
        createStatusBarItem: () => {
            return {
                clear: () => { },
                text: '',
                show: () => { }
            };
        },
        createQuickPick: () => {
            class QuickPick {
                private emitter = new EventEmitter();

                public placeholder = '';

                public items: QuickPickItem[];
                public keepScrollPosition = false;

                public show() { }

                public onDidAccept(cb) {
                    this.emitter.on('didAccept', cb);
                }

                public onDidHide(cb) {
                    this.emitter.on('didHide', cb);
                }

                public hide() {
                    this.emitter.emit('didHide');
                }

                public onDidChangeSelection(cb) {
                    this.emitter.on('didChangeSelection', cb);
                }

                public dispose() {
                    this.emitter.removeAllListeners();
                }
            }
            return new QuickPick();
        },
        createOutputChannel: function(name?: string) {
            return {
                name: name,
                append: () => { },
                dispose: () => { },
                hide: () => { },
                replace: () => { },
                show: () => { },
                clear: () => { },
                appendLine: () => { }
            } as OutputChannel;
        },
        registerTreeDataProvider: function(viewId: string, treeDataProvider: TreeDataProvider<any>) { },
        showInformationMessage: function(message: string) {

        },
        showWarningMessage: function(message: string) {

        },
        showErrorMessage: function(message: string) {

        },
        activeTextEditor: {
            document: undefined
        },
        onDidChangeTextEditorSelection: () => { },
        registerUriHandler: () => { },
        registerWebviewViewProvider: () => {
            return {
                asWebViewUri: () => { }
            };
        },
        showSaveDialog: () => {
            return Promise.resolve('');
        },
        showOpenDialog: () => {
            return Promise.resolve([]);
        }
    },
    CompletionItemKind: {
        Function: 2
    },
    Disposable: class {
        public static from() {

        }
    },
    EventEmitter: class {
        public fire() {

        }
        public event() {
        }
    },
    DeclarationProvider: class {
        public onDidChange = () => { };
        public onDidDelete = () => { };
        public onDidReset = () => { };
        public sync = () => { };
    },
    OutputChannel: class {
        public clear() { }
        public appendLine() { }
        public show() { }
    },
    DebugCollection: class {
        public clear() { }
        public set() { }
    },
    Position: class {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
        public line: number;
        public character: number;
    },
    ParameterInformation: class {
        constructor(label: string, documentation?: any) {
            this.label = label;
            this.documentation = documentation;
        }
        public label: string;
        public documentation: any;
    },
    SignatureHelp: class {
        constructor() {
            this.signatures = [];
        }
        public signatures: any[];
        public activeParameter: number;
        public activeSignature: number;
    },
    SignatureInformation: class {
        constructor(label: string, documentation?: any) {
            this.label = label;
            this.documentation = documentation;
        }
        public label: string;
        public documentation: any;
    },
    Range: class {
        constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
            this.startLine = startLine;
            this.startCharacter = startCharacter;
            this.endLine = endLine;
            this.endCharacter = endCharacter;
        }
        public startLine: number;
        public startCharacter: number;
        public endLine: number;
        public endCharacter: number;
    },
    SymbolKind: {
        File: 0,
        Module: 1,
        Namespace: 2,
        Package: 3,
        Class: 4,
        Method: 5,
        Property: 6,
        Field: 7,
        Constructor: 8,
        Enum: 9,
        Interface: 10,
        Function: 11,
        Variable: 12,
        Constant: 13,
        String: 14,
        Number: 15,
        Boolean: 16,
        Array: 17,
        Object: 18,
        Key: 19,
        Null: 20,
        EnumMember: 21,
        Struct: 22,
        Event: 23,
        Operator: 24,
        TypeParameter: 25
    },
    TextDocument: class {
        constructor(fileName: string, text?: string) {
            this.fileName = fileName;
            this.text = text;
        }

        private text: any;
        public fileName: string;
        public getText() {
            return this.text;
        }
        public getWordRangeAtPosition() {
            //returns a dummy range (because honestly we should be mocking this in a real test...)
            return undefined;
        }
        public lineAt() {
            return {
                text: ''
            };
        }
        public offsetAt() {
            return -1;
        }
    },
    TreeItem: class {
        constructor(label: string, collapsibleState?: TreeItemCollapsibleState) {
            this.label = label;
            this.collapsibleState = collapsibleState;
        }
        public readonly label: string;
        public readonly iconPath?: string | Uri | { light: string | Uri; dark: string | Uri };
        public readonly command?: Command;
        public readonly collapsibleState?: TreeItemCollapsibleState;
        public readonly contextValue?: string;
    },
    DocumentLink: class {
        constructor(range: Range, uri: string) {
            this.range = range;
            this.uri = uri;
        }
        public range: any;
        public uri: string;
    },
    MarkdownString: class {
        constructor(value: string = null) {
            this.value = value;
        }
        public value: string;
    },
    ThemeColor: class { },
    Uri: {
        file: (src: string) => {
            return {
                with: () => {
                    return {};
                }
            };
        },
        parse: () => { }
    },
    SnippetString: class {
        constructor(value: string = null) {
            this.value = value;
        }
        public value: string;
    }
};

export let vscodeLanguageClient = {
    LanguageClient: class {
        public start() { }
        public onReady() {
            return Promise.resolve<any>(null);
        }
        public onNotification() { }
    },
    TransportKind: {
        stdio: 0,
        ipc: 1,
        pipe: 2,
        socket: 3
    }
};
