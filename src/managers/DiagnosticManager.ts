import type { BSDebugDiagnostic } from 'roku-debug';
import * as vscode from 'vscode';

export class DiagnosticManager {

    private collection = vscode.languages.createDiagnosticCollection('BrightScript');

    public clear() {
        this.collection.clear();
    }

    public async addDiagnosticForError(path: string, diagnostics: BSDebugDiagnostic[]) {
        //TODO get the actual folder
        let documentUri: vscode.Uri;
        let uri = vscode.Uri.file(path);
        let doc = await vscode.workspace.openTextDocument(uri); // calls back
        if (doc !== undefined) {
            documentUri = doc.uri;
        }
        // console.log("got " + documentUri);

        //debug crap - for some reason - using this URI works - using the one from the path does not :()
        // const document = vscode.window.activeTextEditor.document;
        // const currentDocumentUri = document.uri;
        // console.log("currentDocumentUri " + currentDocumentUri);
        if (documentUri !== undefined) {
            let result: vscode.Diagnostic[] = [];
            for (const diagnostic of diagnostics) {
                result.push({
                    code: diagnostic.code,
                    message: `From debugger: ${diagnostic.message}`,
                    source: diagnostic.source,
                    severity: diagnostic.severity,
                    tags: diagnostic.tags,
                    range: new vscode.Range(
                        new vscode.Position(diagnostic.range.start.line, diagnostic.range.start.character),
                        new vscode.Position(diagnostic.range.end.line, diagnostic.range.end.character)
                    )
                });
            }
            this.collection.set(documentUri, result);
        }
    }


}
