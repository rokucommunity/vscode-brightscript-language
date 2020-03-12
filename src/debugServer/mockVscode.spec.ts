import { Command, Range, TreeDataProvider, TreeItemCollapsibleState, Uri, Position } from 'vscode';

export let vscode = {
    debug: {
        registerDebugConfigurationProvider: () => { },
        onDidStartDebugSession: () => { },
        onDidReceiveDebugSessionCustomEvent: () => { },
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

        }
    },
    context: {
        subscriptions: [],
    },
    workspace: {
        workspaceFolders: [],
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
        getConfiguration: function() {
            return {
                get: function() { }
            };
        },
        onDidChangeConfiguration: () => {

        },
        onDidChangeWorkspaceFolders: () => {

        },
        findFiles: (include, exclude) => {
            return [];
        }
    },
    window: {
        createOutputChannel: function() {
            return {
                show: () => { },
                clear: () => { }
            };
        },
        registerTreeDataProvider: function(viewId: string, treeDataProvider: TreeDataProvider<any>) { },
        showErrorMessage: function(message: string) {

        },
        activeTextEditor: {
            document: undefined
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
        public onDidChange = () => {

        }
        public onDidDelete = () => {

        }
        public onDidReset = () => {

        }
        public sync = () => {

        }
    },
    OutputChannel: class {
        public clear() { }
        public appendLine() { }
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
        private line: number;
        private character: number;
    },
    ParameterInformation: class {
        constructor(label: string, documentation?: string | any) {
            this.label = label;
            this.documentation = documentation;
        }
        private label: string;
        private documentation: string | any | undefined;
    },
    SignatureHelp: class {
        constructor() {
            this.signatures = [];
        }
        private signatures: any[];
        private activeParameter: number;
        private activeSignature: number;
    },
    SignatureInformation: class {
        constructor(label: string, documentation?: string | any) {
            this.label = label;
            this.documentation = documentation;
        }
        private label: string;
        private documentation: string | any | undefined;
    },
    Range: class {
        constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
            this.startLine = startLine;
            this.startCharacter = startCharacter;
            this.endLine = endLine;
            this.endCharacter = endCharacter;
        }
        private startLine: number;
        private startCharacter: number;
        private endLine: number;
        private endCharacter: number;
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
        private fileName: string;
        public getText() { return this.text; }
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
        private range: any;
        private uri: string;
    },
    MarkdownString: class {
        constructor(value: string = null) {
            this.value = value;
        }
        private value: string;
    },
    Uri: {
        file: (src: string) => {
            return {
                with: ({ }) => {
                    return {};
                }
            };
        }
    },
    SnippetString: class {
        constructor(value: string = null) {
            this.value = value;
        }
        private value: string;
    }
};
