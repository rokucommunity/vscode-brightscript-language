import * as rpc from 'vscode-jsonrpc';
import {
    CompletionItem,
    CompletionItemKind,
    createConnection,
    Diagnostic,
    DiagnosticSeverity,
    DidChangeConfigurationNotification,
    InitializeParams,
    Position,
    ProposedFeatures,
    TextDocument,
    TextDocumentPositionParams,
    TextDocuments
} from 'vscode-languageserver';
import Uri from 'vscode-uri';

import { BRSLanguageServer } from 'C:/projects/brightscript';

let brightscriptServer = new BRSLanguageServer();

import * as BRSValidator from './BRSValidator';

// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;

let serverFinishedFirstRunPromise;

connection.onInitialize(async (params: InitializeParams) => {
    brightscriptServer = new BRSLanguageServer();
    //start up a new brightscript language server in watch mode,
    //disable all output file generation and deployments, as this
    //is purely for the language server options
    serverFinishedFirstRunPromise = brightscriptServer.run({
        cwd: params.rootPath,
        watch: true,
        skipPackage: true,
        deploy: false
    });
    console.log('Server is running');
    let capabilities = params.capabilities;

    // Does the client support the `workspace/configuration` request?
    // If not, we will fall back using global settings
    hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
    hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);
    hasDiagnosticRelatedInformationCapability =
        !!(capabilities.textDocument &&
            capabilities.textDocument.publishDiagnostics &&
            capabilities.textDocument.publishDiagnostics.relatedInformation);

    return {
        capabilities: {
            textDocumentSync: documents.syncKind,
            // Tell the client that the server supports code completion
            completionProvider: {
                resolveProvider: true
            }
        }
    };
});

connection.onInitialized(async () => {
    if (hasConfigurationCapability) {
        // Register for all configuration changes.
        connection.client.register(
            DidChangeConfigurationNotification.type,
            undefined
        );
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders((evt) => {
            connection.console.log('Workspace folder change event received.');
        });
    }
    //send all diagnostics
    //send all of the initial diagnostics for the whole project
    try {
        await serverFinishedFirstRunPromise;
    } catch (e) {
        //send a message explaining what went wrong
        connection.sendNotification('critical-failure', `BrightScript language server failed to start: \n${e.message}`);
    }
    sendDiagnostics();
});

// The example settings
interface ExampleSettings {
    maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
let documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration((change) => {
    if (hasConfigurationCapability) {
        // Reset all cached document settings
        documentSettings.clear();
    } else {
        globalSettings = <ExampleSettings>(
            (change.settings.languageServerExample || defaultSettings)
        );
    }

    // Revalidate all open text documents
    documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({
            scopeUri: resource,
            section: 'languageServerExample'
        });
        documentSettings.set(resource, result);
    }
    return result;
}

// Only keep settings for open documents
documents.onDidClose((e) => {
    documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
    validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
    //make sure the server has finished loading
    await serverFinishedFirstRunPromise;
    let filePath = Uri.parse(textDocument.uri).fsPath;
    await brightscriptServer.program.loadOrReloadFile(filePath, textDocument.getText());
    await brightscriptServer.program.validate();
    sendDiagnostics();
}

connection.onDidChangeWatchedFiles((change) => {
    // Monitored files have change in VSCode
    connection.console.log('We received an file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
    (textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
        // The pass parameter contains the position of the text document in
        // which code complete got requested. For the example we ignore this
        // info and always provide the same completion items.
        return [
            {
                label: 'TypeScript',
                kind: CompletionItemKind.Text,
                data: 1
            },
            {
                label: 'JavaScript',
                kind: CompletionItemKind.Text,
                data: 2
            }
        ];
    }
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
    (item: CompletionItem): CompletionItem => {
        if (item.data === 1) {
            (item.detail = 'TypeScript details'),
                (item.documentation = 'TypeScript documentation');
        } else if (item.data === 2) {
            (item.detail = 'JavaScript details'),
                (item.documentation = 'JavaScript documentation');
        }
        return item;
    }
);

/*
connection.onDidOpenTextDocument((params) => {
	// A text document got opened in VSCode.
	// params.uri uniquely identifies the document. For documents store on disk this is a file URI.
	// params.text the initial full content of the document.
	connection.console.log(`${params.textDocument.uri} opened.`);
});
connection.onDidChangeTextDocument((params) => {
	// The content of a text document did change in VSCode.
	// params.uri uniquely identifies the document.
	// params.contentChanges describe the content changes to the document.
	connection.console.log(`${params.textDocument.uri} changed: ${JSON.stringify(params.contentChanges)}`);
});
connection.onDidCloseTextDocument((params) => {
	// A text document got closed in VSCode.
	// params.uri uniquely identifies the document.
	connection.console.log(`${params.textDocument.uri} closed.`);
});
*/

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

/**
 * The list of all issues, indexed by file. This allows us to keep track of which buckets of
 * diagnostics to send and which to skip because nothing has changed
 */
let latestDiagnosticsByFile = {} as { [key: string]: Diagnostic[] };
function sendDiagnostics() {
    //compute the new list of diagnostics for whole project
    let issuesByFile = {} as { [key: string]: Diagnostic[] };
    // let uri = Uri.parse(textDocument.uri);

    //make a bucket for every file in the project
    for (let filePath in brightscriptServer.program.files) {
        issuesByFile[filePath] = [];
    }

    for (let error of brightscriptServer.program.errors) {
        issuesByFile[error.filePath].push({
            severity: error.severity === 'warning' ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
            range: {
                start: Position.create(error.lineIndex, error.columnIndexBegin),
                end: Position.create(error.lineIndex, error.columnIndexEnd)
            },
            message: error.message,
            //code: 'NO CODE',
            source: 'brs'
        });
    }

    //send all diagnostics
    for (let filePath in issuesByFile) {
        //TODO filter by only the files that have changed
        connection.sendDiagnostics({
            uri: Uri.file(filePath).toString(),
            diagnostics: issuesByFile[filePath]
        });
    }
    latestDiagnosticsByFile = issuesByFile;
}
