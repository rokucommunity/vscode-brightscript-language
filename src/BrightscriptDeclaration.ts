import { Location, Position, Range, SymbolKind, Uri, TextDocument } from "vscode";
import * as vscode from "vscode";
export class BrightscriptDeclaration {
  constructor(
    public name: string,
    public kind: SymbolKind,
    public container: BrightscriptDeclaration | undefined,
    public params: string[],
    public nameRange: Range,
    public bodyRange: Range,
    public uri: Uri | undefined = undefined) {
  }
  static fromUri(uri: Uri) {
    let documentName = uri.path;
    return new BrightscriptDeclaration(documentName, vscode.SymbolKind.File, undefined, [], new vscode.Range(0,0,0,0), new vscode.Range(0,0,0, 0), uri);
}
  get isGlobal(): boolean {
    return true;
    // TODO add scope
    // return this.container === undefined;
  }

  get containerName(): string | undefined {
    return this.container && this.container.name;
  }

  public visible(position: Position): boolean {
    return true;
    // return this.container === undefined || this.container.bodyRange.contains(position);
  }
  public getDocumentUri(): Uri {
    if (this.kind === SymbolKind.File) {
      return this.uri;
    } else if (this.container) {
      return this.container.getDocumentUri();
    } else {
      console.log("getDocumentUri: ERROR could not find container for symbol" + this);
    }
  }
  getLocation(): Location {
    return new Location(this.getDocumentUri(), this.nameRange);
  }

}