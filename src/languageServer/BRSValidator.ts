import { ast, parse } from '@roku-road/bright';
import {
    Diagnostic,
    DiagnosticSeverity,
    TextDocument,
    TextDocumentPositionParams,
    TextDocuments,
} from 'vscode-languageserver';

export function getIssues(textDocument: TextDocument) {
    let text = textDocument.getText();
    const { value, lexErrors, tokens, parseErrors } = parse(text, 'Program');

    let issues: Diagnostic[] = [];
    lexErrors.forEach((x) => x.severity = DiagnosticSeverity.Warning);
    parseErrors.forEach((x) => x.severity = DiagnosticSeverity.Error);

    //if we have errors, convert line and column numbers into absolute positions
    for (let err of [...lexErrors, ...parseErrors]) {
        issues.push({
            severity: err.severity,
            range: {
                start: textDocument.positionAt(
                    textDocument.offsetAt({
                        line: err.location.start.line - 1,
                        character: err.location.start.column - 1
                    })
                ),
                end: textDocument.positionAt(
                    textDocument.offsetAt({
                        line: err.location.end.line - 1,
                        character: err.location.end.column - 1
                    })
                )
            },
            message: err.message,
            code: err.name,
            source: 'brs'
        });
    }
    return issues;
}
