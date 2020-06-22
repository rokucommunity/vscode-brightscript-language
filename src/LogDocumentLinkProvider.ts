import * as fsExtra from 'fs-extra';
import * as path from 'path';
import * as rokuDeploy from 'roku-deploy';
import { DocumentLink, Position, Range } from 'vscode';
import { SourceLocation } from 'roku-debug';
import * as vscode from 'vscode';

import BrightScriptFileUtils from './BrightScriptFileUtils';
import { BrightScriptLaunchConfiguration } from './DebugConfigurationProvider';
import { link } from 'fs';

const fileUtils = new BrightScriptFileUtils();

export class CustomDocumentLink {
    constructor(outputLine: number, startChar: number, length: number, pkgPath: string, lineNumber: number, filename: string) {
        this.outputLine = outputLine;
        this.startChar = startChar;
        this.length = length;
        this.pkgPath = pkgPath;
        this.lineNumber = lineNumber;
        this.filename = filename;
    }

    public outputLine: number;
    public startChar: number;
    public length: number;
    public pkgPath: string;
    public filename: string;
    public lineNumber: number;
    public transpiledLocation?: SourceLocation;
}
/**
 * Provides file links in any output window that has the pkg:/ format.
 * This only works after a debug session has started,  because the file mappings are provided in the debug launch arguments
 */
export class LogDocumentLinkProvider implements vscode.DocumentLinkProvider {
    constructor() {
        this.rawLinks = [];
    }

    //add import as property so it can be mocked in tests
    private rokuDeploy = rokuDeploy;

    public async setLaunchConfig(launchConfig: BrightScriptLaunchConfiguration) {
        this.launchConfig = launchConfig;
        this.fileMaps = {};

        let sourceRootDir = launchConfig.sourceDirs ? launchConfig.sourceDirs : [launchConfig.rootDir];
        let paths = [];
        for (const rootDir of sourceRootDir) {
            let pathsFromRoot = await this.rokuDeploy.getFilePaths(launchConfig.files, rootDir);
            paths = paths.concat(pathsFromRoot);
        }
        //get every file used in this project

        let outDir = path.normalize(launchConfig.outDir);

        //convert every path into a pkg link, which maps back to the source location of the file
        for (let fileMap of paths) {

            //make the dest path relative. (fileMap.dest IS already relative to pkg path, but this line doesn't hurt anything so leave it here)
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
    public rawLinks: CustomDocumentLink[];
    private launchConfig: BrightScriptLaunchConfiguration;

    public async provideDocumentLinks(doc: vscode.TextDocument, token: vscode.CancellationToken) {
        let links = [];
        for (const [i, link] of this.rawLinks.entries()) {
            links.push(this.createDocLink(link));
        }
        return links;
    }

    public getFileMap(pkgPath) {
        return this.fileMaps[pkgPath];
    }

    public addCustomLink(customLink: CustomDocumentLink) {
        this.rawLinks.push(customLink);
    }

    private createDocLink(customLink: CustomDocumentLink): DocumentLink {
        if (customLink.transpiledLocation) {
            let uri = vscode.Uri.file(customLink.transpiledLocation.filePath);
            uri = uri.with({ fragment: customLink.transpiledLocation.lineNumber.toString().trim() });
            let range = new Range(new Position(customLink.outputLine, customLink.startChar), new Position(customLink.outputLine, customLink.startChar + customLink.length));
            return new DocumentLink(range, uri);
        } else {

            for (let i = 0; i < 2; i++) {
                let fileMap = this.getFileMap(customLink.pkgPath);
                if (fileMap) {
                    let uri = vscode.Uri.file(fileMap.src);
                    if (customLink.lineNumber) {
                        uri = uri.with({ fragment: customLink.lineNumber.toString().trim() });
                    }
                    let range = new Range(new Position(customLink.outputLine, customLink.startChar), new Position(customLink.outputLine, customLink.startChar + customLink.length));
                    return new DocumentLink(range, uri);
                }
                customLink.pkgPath = fileUtils.getAlternateBrsFileName(customLink.pkgPath);
            }
        }

    }

    public resetCustomLinks() {
        this.rawLinks = [];
    }

    public convertPkgPathToFsPath(pkgPath: string) {
        //remove preceeding pkg:
        if (pkgPath.toLowerCase().indexOf('pkg:') === 0) {
            pkgPath = pkgPath.substring(4);
        }

        //use debugRootDir if provided, or rootDir if not provided.
        let rootDir = this.launchConfig.rootDir;
        for (let i = 0; i < 2; i++) {
            if (this.launchConfig.debugRootDir) {
                rootDir = this.launchConfig.debugRootDir;
                let clientPath = path.normalize(path.join(rootDir, pkgPath));
                if (fsExtra.existsSync(clientPath)) {
                    return clientPath;
                }
            }

            if (this.launchConfig.sourceDirs) {
                for (let sourceDir of this.launchConfig.sourceDirs) {
                    let clientPath = path.normalize(path.join(sourceDir, pkgPath));
                    if (fsExtra.existsSync(clientPath)) {
                        return clientPath;
                    }
                }
            }
            pkgPath = fileUtils.getAlternateBrsFileName(pkgPath);
        }
        return pkgPath;
    }
}
