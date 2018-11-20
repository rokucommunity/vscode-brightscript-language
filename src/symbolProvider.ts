import * as vscode from 'vscode';

export function getFnRegex(): RegExp {
  let functionRegex = "^(?:function|sub)\\s+(.*[^\\(])\\(";
  const regex = new RegExp(functionRegex, 'i');
  return regex;
}

export function getSymbolForMatch(testFnMatch: RegExpMatchArray, document: vscode.TextDocument, line: number, kind: vscode.SymbolKind): vscode.SymbolInformation {
  const container = testFnMatch[1];
  const name = testFnMatch[1];
  return new vscode.SymbolInformation(name, kind, container,
    new vscode.Location(document.uri, new vscode.Position(line, 0)));
}

const functionRegexPattern = getFnRegex();

export function getSymbolForLine(document: vscode.TextDocument, line: number): vscode.SymbolInformation | undefined {
  const { text } = document.lineAt(line);
  const functionMatch = text.match(functionRegexPattern);
  if (functionMatch) {
    return getSymbolForMatch(functionMatch, document, line, vscode.SymbolKind.Module);
  }
  return undefined;
}

const symbolProvider = {
  provideDocumentSymbols(document: vscode.TextDocument): vscode.SymbolInformation[] {
    const lineCount = Math.min(document.lineCount, 10000);
    const result: vscode.SymbolInformation[] = [];
    for (let line = 0; line < lineCount; line++) {
      const symbol = getSymbolForLine(document, line);
      if (symbol) {
        console.log("got symbol " + symbol);
        result.push(symbol);
      }
    }

    return result;
  }
};


export function addSymbolProvider(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider('brightscript', symbolProvider));
}