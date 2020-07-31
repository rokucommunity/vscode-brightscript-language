import * as path from 'path';
import * as rokuDeploy from 'roku-deploy';
import { DocumentLink, Position, Range } from 'vscode';
import * as vscode from 'vscode';

import { util } from './util';
import BrightscriptFileUtils from './BrightScriptFileUtils';
import { BrightScriptLaunchConfiguration } from './DebugConfigurationProvider';

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
}
/**
 * Provides file links in any output window that has the pkg:/ format.
 * This only works after a debug session has started,  because the file mappings are provided in the debug launch arguments
 */
export class LogDocumentLinkProvider implements vscode.DocumentLinkProvider {
    constructor() {
        this.customLinks = [];
        this.fileUtils = new BrightscriptFileUtils();
    }

    //add import as property so it can be mocked in tests
    private rokuDeploy = rokuDeploy;
    public fileUtils: BrightscriptFileUtils;

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
    public customLinks: DocumentLink[];

    private launchConfig: BrightScriptLaunchConfiguration;

    public async provideDocumentLinks(doc: vscode.TextDocument, token: vscode.CancellationToken) {
        return this.customLinks;
    }

    public getFileMap(pkgPath) {
        return this.fileMaps[pkgPath];
    }

    public addCustomFileLink(customLink: CustomDocumentLink) {
        let range = new Range(new Position(customLink.outputLine, customLink.startChar), new Position(customLink.outputLine, customLink.startChar + customLink.length));
        let uri = vscode.Uri.file(customLink.pkgPath);
        if (customLink.lineNumber) {
            uri = uri.with({ fragment: customLink.lineNumber.toString().trim() });
        }

        this.customLinks.push(new DocumentLink(range, uri));
    }

    public addCustomPkgLink(customLink: CustomDocumentLink) {
        let fileMap = this.getFileMap(customLink.pkgPath);
        if (fileMap) {
            let uri = vscode.Uri.file(fileMap.src);
            if (customLink.lineNumber) {
                uri = uri.with({ fragment: customLink.lineNumber.toString().trim() });
            }
            let range = new Range(new Position(customLink.outputLine, customLink.startChar), new Position(customLink.outputLine, customLink.startChar + customLink.length));
            this.customLinks.push(new DocumentLink(range, uri));
        } else {
            console.log('could not find matching file for link with path ' + customLink.pkgPath);
        }
    }

    public resetCustomLinks() {
        this.customLinks = [];
    }

    public convertPkgPathToFsPath(pkgPath: string) {
        let mappedPath = this.getFileMap(pkgPath);
        if (!mappedPath) {
            //if a .brs file gets in here, that comes from a .brs file, but no sourcemap is present, then try to find the alternate source file.
            //this issue can arise when sourcemaps are nto present
            mappedPath = this.getFileMap(this.fileUtils.getAlternateBrsFileName(pkgPath));
        }
        return mappedPath ? mappedPath.src : undefined;
    }
}
