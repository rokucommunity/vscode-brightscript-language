import {
    CancellationToken,
    Position,
    Range,
    TextDocument
} from 'vscode';

export enum XmlWordType {
    Illegal = -1,
    Tag = 0,
    AttributeValue = 1,
    Attribute = 2,
}
export class XmlUtils {
    public getXmlWordType(document: TextDocument, position: Position, token: CancellationToken): XmlWordType {
        if (this.isTagName(document, position) || this.isClosingTagName(document, position)) {
            return XmlWordType.Tag;
        } else if (this.isAttributeValue(document, position)) {
            return XmlWordType.AttributeValue;
        } else if (this.isAttribute(document, position)) {
            return XmlWordType.Attribute;
        }
        return XmlWordType.Illegal;
    }

    public getWord(document: TextDocument, position: Position, xmlWordType: XmlWordType) {
        switch (xmlWordType) {
            case XmlWordType.Tag:
                //TODO end offset!
                if (this.isTagName(document, position)) {
                    return this.getTextWithOffsets(document, position);
                } else {
                    return this.getTextWithOffsets(document, position);
                }
                break;
            case XmlWordType.Attribute:
                return this.getTextWithOffsets(document, position);
                break;
            case XmlWordType.AttributeValue:
                return this.getTextWithOffsets(document, position, /[^\s\"]+/);
                break;
        }
    }

    private isTagName(document: TextDocument, position: Position): boolean {
        return this.textBeforeWordEquals(document, position, '<');
    }

    private isClosingTagName(document: TextDocument, position: Position): boolean {
        return this.textBeforeWordEquals(document, position, '</');
    }

    // Check if the cursor is about complete the value of an attribute.
    private isAttributeValue(document: TextDocument, position: Position): boolean {
        let wordRange = document.getWordRangeAtPosition(position, /[^\s\"\']+/);
        let wordStart = wordRange ? wordRange.start : position;
        let wordEnd = wordRange ? wordRange.end : position;
        if (wordStart.character === 0 || wordEnd.character > document.lineAt(wordEnd.line).text.length - 1) {
            return false;
        }
        // TODO: This detection is very limited, only if the char before the word is ' or "
        let rangeBefore = new Range(wordStart.line, wordStart.character - 1, wordStart.line, wordStart.character);
        if (document.getText(rangeBefore).match(/'|"/)) {
            return true;
        }
        return false;
    }

    private isAttribute(document: TextDocument, position: Position): boolean {
        let wordRange = document.getWordRangeAtPosition(position);
        let wordStart = wordRange ? wordRange.start : position;
        let text = document.getText();
        return text.lastIndexOf('<', document.offsetAt(wordStart)) > text.lastIndexOf('>', document.offsetAt(wordStart));
    }

    private textBeforeWordEquals(document: TextDocument, position: Position, textToMatch: string) {
        let wordRange = document.getWordRangeAtPosition(position);
        let wordStart = wordRange ? wordRange.start : position;
        if (wordStart.character < textToMatch.length) {
            // Not enough room to match
            return false;
        }
        let charBeforeWord = document.getText(new Range(new Position(wordStart.line, wordStart.character - textToMatch.length), wordStart));
        return charBeforeWord === textToMatch;
    }

    private getTextWithOffsets(document: TextDocument, position: Position, wordRegex?) {
        let wordRange = document.getWordRangeAtPosition(position, wordRegex);
        let wordStart = wordRange ? wordRange.start : position;
        return document.getText(
            new Range(
                new Position(wordStart.line, wordStart.character),
                new Position(wordRange?.end?.line, wordRange?.end?.character)
            )
        );
    }
}
