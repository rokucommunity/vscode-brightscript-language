import type {
    CancellationToken,
    DocumentSymbolProvider,
    SymbolInformation,
    TextDocument, Uri
} from 'vscode';
import type { DeclarationProvider } from './DeclarationProvider';

export class BrightScriptDocumentSymbolProvider implements DocumentSymbolProvider {
    constructor(declarationProvider: DeclarationProvider) {
        this.declarationProvider = declarationProvider;
    }
    private declarationProvider: DeclarationProvider;

    public provideDocumentSymbols(document: TextDocument, token: CancellationToken): SymbolInformation[] {
        return this.readSymbolInformations(document.uri, document.getText());
    }
    public readSymbolInformations(uri: Uri, input: string): SymbolInformation[] {
        return this.declarationProvider.readDeclarations(uri, input).map((d) => this.declarationProvider.declToSymbolInformation(uri, d));
    }
}
