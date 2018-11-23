import * as vscode from 'vscode';
import { BrightscriptDebugCompileError } from "./RokuAdapter";
import URI from "vscode-uri";

const collection = vscode.languages.createDiagnosticCollection('Brightscript');

export function registerDebugErrorHandler() {
  vscode.debug.onDidStartDebugSession(e => {
    collection.clear();
  });

  let _channel: vscode.OutputChannel;
  function getOutputChannel(): vscode.OutputChannel {
    if (!_channel) {
      _channel = vscode.window.createOutputChannel('Brightscript Log');
    }
    return _channel;
  }
  vscode.debug.onDidReceiveDebugSessionCustomEvent(e => {
    console.log("received event " + e.event);
    if (e.event === "BSLogOutputEvent") {
      getOutputChannel().appendLine(e.body);
    } else {


      collection.clear();
      let errorsByPath = {};
      e.body.forEach(async compileError => {
        if (!errorsByPath[compileError.path]) {
          errorsByPath[compileError.path] = [];
        }
        errorsByPath[compileError.path].push(compileError);
      });

      for (const path in errorsByPath) {
        if (errorsByPath.hasOwnProperty(path)) {
          const errors = errorsByPath[path];
          addDiagnosticForError(path, errors);
        }
      }
    }
  });

  async function addDiagnosticForError(path: string, compileErrors: BrightscriptDebugCompileError[]) {

    //TODO get the actual folder
    let documentUri: vscode.Uri = undefined;
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
      {
        let diagnostics: vscode.Diagnostic[] = [];
        compileErrors.forEach(compileError => {

          const path: string = compileError.path;
          const message: string = compileError.message;
          const source: string = compileError.errorText;
          const lineNumber: number = compileError.lineNumber;
          const charStart: number = compileError.charStart;
          const charEnd: number = compileError.charEnd;

          diagnostics.push({
            code: '',
            message: message,
            range: new vscode.Range(new vscode.Position(lineNumber, charStart), new vscode.Position(lineNumber, charEnd)),
            severity: vscode.DiagnosticSeverity.Error,
            source: source
          });
        });
        collection.set(documentUri, diagnostics);
      }
    }
  }
}
