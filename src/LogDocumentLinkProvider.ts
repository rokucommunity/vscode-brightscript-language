import * as path from 'path';
import * as rokuDeploy from 'roku-deploy';
import { DocumentLink, Position, Range } from 'vscode';
import * as vscode from 'vscode';

import { BrightScriptDebugConfiguration } from './BrightScriptConfigurationProvider';

export class CustomDocumentLink {
    constructor(outputLine: number, startChar: number, length: number, pkgPath: string) {
        this.outputLine = outputLine;
        this.startChar = startChar;
        this.length = length;
        this.pkgPath = pkgPath;
    }

    public outputLine: number;
    public startChar: number;
    public length: number;
    public pkgPath: string;
}
/**
 * Provides file links in any output window that has the pkg:/ format.
 * This only works after a debug session has started,  because the file mappings are provided in the debug launch arguments
 */
export class LogDocumentLinkProvider implements vscode.DocumentLinkProvider {
    constructor() {
        this.customLinks = [];
        this.pkgRegex = /(pkg:\/.*\.(?:brs|xml))[ \t]*(?:\((\d+)(?:\:(\d+))?\))?/g;
    }

    //add import as property so it can be mocked in tests
    private rokuDeploy = rokuDeploy;
    private pkgRegex: RegExp;

    public async setLaunchConfig(launchConfig: BrightScriptDebugConfiguration) {
        this.launchConfig = launchConfig;
        this.fileMaps = {};

        let sourceRootDir = launchConfig.debugRootDir ? launchConfig.debugRootDir : launchConfig.rootDir;

        //get every file used in this project
        let paths = await this.rokuDeploy.getFilePaths(launchConfig.files, launchConfig.outDir, sourceRootDir);

        let outDir = path.normalize(launchConfig.outDir);

        //convert every path into a pkg link, which maps back to the source location of the file
        for (let fileMap of paths) {

            //make the dest path relative
            let pkgPath = 'pkg:/' + path.normalize(fileMap.dest).replace(outDir, '');
            //replace windows slashes with 'nix ones
            pkgPath = pkgPath.replace(/\\/g, '/');
            //replace double slashes with single ones
            pkgPath = pkgPath.replace(/\/\//g, '/');
            this.fileMaps[pkgPath] = {
                pkgPath: pkgPath,
                ...fileMap
            };
        }
    }

    public fileMaps: { [pkgPath: string]: { src: string; dest: string; pkgPath: string; } };
    public customLinks: DocumentLink[];

    private launchConfig: BrightScriptDebugConfiguration;

    public async provideDocumentLinks(doc: vscode.TextDocument, token: vscode.CancellationToken) {
        let k = doc;
        let links = <DocumentLink[]>[];
        let outputText = doc.getText();
        let match: RegExpExecArray;

        //find all pkg matches in the output
        while (match = this.pkgRegex.exec(outputText)) {
            let pkgPath = match[1];
            let fileNumber = match[2];
            let lineNumber = match[3];
            //we don't do anything with column number right now...but maybe we can someday
            let columnNumber = match[4];
            let fileMap = this.getFileMap(pkgPath);
            if (fileMap) {
                let uri = vscode.Uri.file(fileMap.src);
                if (fileNumber) {
                    uri = uri.with({ fragment: fileNumber });
                }
                let range = new Range(doc.positionAt(match.index), doc.positionAt(match.index + match[0].length));
                links.push(new DocumentLink(range, uri));
            }

        }
        links = links.concat(this.customLinks);
        return links;
    }

    public getFileMap(pkgPath) {
        return this.fileMaps[pkgPath];
    }

    public addCustomLink(customLink: CustomDocumentLink) {
        let match: RegExpExecArray;

        //find all pkg matches in the output
        while (match = this.pkgRegex.exec(customLink.pkgPath)) {
            let pkgPath = match[1];
            let fileNumber = match[2];
            let fileMap = this.getFileMap(pkgPath);
            if (fileMap) {
                let uri = vscode.Uri.file(fileMap.src);
                if (fileNumber) {
                    uri = uri.with({ fragment: fileNumber });
                }
                let range = new Range(new Position(customLink.outputLine, customLink.startChar), new Position(customLink.outputLine, customLink.startChar + customLink.length));
                this.customLinks.push(new DocumentLink(range, uri));
            }
        }
    }

    public resetCustomLinks() {
        this.customLinks = [];
    }
}
