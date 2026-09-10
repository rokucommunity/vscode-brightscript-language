import * as vscode from 'vscode';
import type { Disposable } from 'vscode';
import { LanguageClient, NotificationType, TransportKind } from 'vscode-languageclient/node';
import type { LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node';

/**
 * The languages we own that should be treated as JSON-with-comments by the JSON language server.
 */
const JSON_LSP_LANGUAGES = ['bsconfig', 'brsconfig'];

/**
 * The `json/schemaAssociations` notification — pattern (glob) -> array of schema URIs.
 * This is the protocol vscode-json-languageserver exposes for registering schemas at runtime.
 */
type SchemaAssociations = Record<string, string[]>;
const SchemaAssociationNotification = new NotificationType<SchemaAssociations>('json/schemaAssociations');

/**
 * Spin up a dedicated JSON language server for our config files (bsconfig.json, brsconfig.json).
 *
 * VSCode's built-in JSON language features only attach to documents whose language id is `json` or `jsonc`.
 * Because we own custom language ids (so we can attach custom file icons), the built-in LSP ignores our files.
 * To get completion / hover / schema validation / formatting, we run our own instance of `vscode-json-languageserver`
 * — the same server VSCode uses internally — scoped to our language ids.
 *
 * This client is fully independent of the BrighterScript language server and starts on extension activation.
 */
export function startJsonLanguageClient(context: vscode.ExtensionContext): Disposable {
    const serverModule = context.asAbsolutePath('node_modules/vscode-json-languageserver/out/node/jsonServerMain.js');

    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: { execArgv: ['--nolazy', '--inspect=6045'] }
        }
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: JSON_LSP_LANGUAGES.map(language => ({ language: language })),
        initializationOptions: {
            handledSchemaProtocols: ['file', 'http', 'https'],
            provideFormatter: true
        },
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/*.json')
        }
    };

    const client = new LanguageClient(
        'bsconfigJsonLanguageServer',
        'BrightScript Config JSON Language Server',
        serverOptions,
        clientOptions
    );

    const clientDisposable = client.start();

    void client.onReady().then(() => {
        const schemaUri = vscode.Uri.file(context.asAbsolutePath('dist/bsconfig.schema.json')).toString();
        client.sendNotification(SchemaAssociationNotification, {
            '**/bsconfig.json': [schemaUri],
            '**/brsconfig.json': [schemaUri],
            '**/*bsconfig*.json': [schemaUri],
            '**/*brsconfig*.json': [schemaUri]
        });
    });

    return clientDisposable;
}
