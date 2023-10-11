import type { BSDebugDiagnostic } from 'roku-debug';
import * as vscode from 'vscode';

export class DiagnosticManager {

    private collection = vscode.languages.createDiagnosticCollection('BrightScript');

    public clear() {
        this.collection.clear();
    }

    public async addDiagnosticForError(path: string, diagnostics: BSDebugDiagnostic[]) {
        let documentUri: vscode.Uri;
        let uri = vscode.Uri.file(path);
        let doc = await vscode.workspace.openTextDocument(uri);
        if (doc !== undefined) {
            documentUri = doc.uri;
        }

        if (documentUri !== undefined) {
            let result: vscode.Diagnostic[] = [];
            for (const diagnostic of diagnostics) {

                result.push({
                    code: diagnostic.code,
                    message: diagnostic.message,
                    source: diagnostic.source,
                    //the DiagnosticSeverity.Error from vscode-languageserver-types starts at 1, but vscode.DiagnosticSeverity.Error starts at 0. So subtract 1 to make them compatible
                    severity: diagnostic.severity - 1,
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
