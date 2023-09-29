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
                    message: `From debugger: ${diagnostic.message}`,
                    source: diagnostic.source,
                    severity: diagnostic.severity as vscode.DiagnosticSeverity,
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
