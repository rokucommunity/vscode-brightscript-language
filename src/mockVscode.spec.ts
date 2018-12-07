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
        createDiagnosticCollection: () => { }
    },
    subscriptions: [],
    commands: {
        registerCommand: () => {

        }
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

        }
    },
    window: {
        createOutputChannel: function() {
            return {
                show: () => {}
            };
        },
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
        public clear() {}
        public appendLine() {}
    },
    DebugCollection: class {
        public clear() {}
        public set() {}
    }
};
