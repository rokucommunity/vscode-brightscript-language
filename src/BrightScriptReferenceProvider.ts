import * as fs from 'fs';
import * as iconv from 'iconv-lite';
import * as vscode from 'vscode';
import {
    Location,
    Position,
    TextDocument,
    Uri
} from 'vscode';

import { getExcludeGlob, iterlines, WorkspaceEncoding } from './DeclarationProvider';

export class BrightScriptReferenceProvider implements vscode.ReferenceProvider {
    private encoding: WorkspaceEncoding = new WorkspaceEncoding();

    public async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        options: { includeDeclaration: boolean },
        token: vscode.CancellationToken
    ): Promise<vscode.Location[]> {
        return await this.find(document, position);
    }

    private async find(document: TextDocument, position: Position): Promise<Location[]> {
        const excludes = getExcludeGlob();
        const word = this.getWord(document, position).toLowerCase();
        let locations = [];
        for (const uri of await vscode.workspace.findFiles('**/*.{brs,bs}', excludes)) {
            const input = await new Promise<string>((resolve, reject) => {
                fs.readFile(uri.fsPath, (err, data) => {
                    if (err) {
                        if (typeof err === 'object' && err.code === 'ENOENT') {
                            resolve();
                        } else {
                            reject(err);
                        }
                    } else {
                        resolve(iconv.decode(data, this.encoding.find(uri.fsPath)));
                    }
                });
            });
            if (input !== undefined) {
                locations = locations.concat(this.findWordInFile(uri, input, word));
            }
        }
        return locations;
    }

    public findWordInFile(uri: Uri, input: string, word: string): Location[] {
        let locations = [];
        let searchTerm = word;
        let regex = new RegExp(searchTerm, 'ig');
        let wordLength = word.length;
        for (const [line, text] of iterlines(input)) {
            let result;
            while (result = regex.exec(text)) {
                locations.push(new Location(uri, new Position(line, result.index)));
            }
        }
        return locations;
    }

    public getIndicesOf(searchStr, str, caseSensitive) {
        let searchStrLen = searchStr.length;
        if (searchStrLen === 0) {
            return [];
        }
        let startIndex = 0;
        let index = 0;
        let indices = [];

        if (!caseSensitive) {
            str = str.toLowerCase();
            searchStr = searchStr.toLowerCase();
        }
        while ((index = str.indexOf(searchStr, startIndex)) > -1) {
            indices.push(index);
            startIndex = index + searchStrLen;
        }
        return indices;
    }

    private getWord(document: TextDocument, position: Position): string {
        const range = document.getWordRangeAtPosition(position, /[^\s\x21-\x2f\x3a-\x40\x5b-\x5e\x7b-\x7e]+/);
        if (range !== undefined) {
            return document.getText(range);
        }
    }
}
