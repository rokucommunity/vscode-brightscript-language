import {Position, Range, SymbolKind} from "vscode";

export class BrightscriptDeclaration {
    constructor(
        public name: string,
        public kind: SymbolKind,
        public container: BrightscriptDeclaration | undefined,
        public params: string[],
        public nameRange: Range,
        public bodyRange: Range) {

    }


    get isGlobal(): boolean {
        return this.container === undefined;
    }

    get containerName(): string | undefined {
        return this.container && this.container.name;
    }

    public visible(position: Position): boolean {
        return this.container === undefined || this.container.bodyRange.contains(position);
    }
}