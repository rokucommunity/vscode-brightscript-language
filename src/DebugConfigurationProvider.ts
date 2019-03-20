import * as dotenv from 'dotenv';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import { FilesType } from 'roku-deploy';
import {
    CancellationToken,
    DebugConfiguration,
    DebugConfigurationProvider,
    ExtensionContext,
    WorkspaceFolder,
} from 'vscode';
import * as vscode from 'vscode';

import * as util from './util';

export class BrightScriptDebugConfigurationProvider implements DebugConfigurationProvider {

    public constructor(context: ExtensionContext) {
        this.context = context;
    }

    public context: ExtensionContext;

    //make unit testing easier by adding these imports properties
    public fsExtra = fsExtra;
    public util = util;

    /**
     * Massage a debug configuration just before a debug session is being launched,
     * e.g. add all missing attributes to the debug configuration.
     */
    public async resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: BrightScriptDebugConfiguration, token?: CancellationToken): Promise<DebugConfiguration> {
        //make sure we have an object
        config = config ? config : {} as any;
        let folderUri: vscode.Uri;
        //us ethe workspace folder provided
        if (folder) {
            folderUri = folder.uri;

            //if there's only one workspace, use that workspace's folder path
        } else if (vscode.workspace.workspaceFolders.length === 1) {
            folderUri = vscode.workspace.workspaceFolders[0].uri;
        } else {
            //there are multiple workspaces, ask the user to specify which one they want to use
            let workspaceFolder = await vscode.window.showWorkspaceFolderPick();
            if (workspaceFolder) {
                folderUri = workspaceFolder.uri;
            }
        }

        if (!folderUri) {
            //cancel this whole thing because we can't continue without the user specifying a workspace folder
            throw new Error('Cannot determine which workspace to use for brightscript debugging');
        }

        //load the brsconfig settings (if available)
        let brsconfig = await util.getBrsConfig(folderUri);
        if (brsconfig) {
            config = Object.assign({}, brsconfig, config);
        }

        config.type = config.type ? config.type : 'brightscript';
        config.name = config.name ? config.name : 'BrightScript Debug: Launch';
        config.host = config.host ? config.host : '${promptForHost}';
        config.password = config.password ? config.password : '${promptForPassword}';
        config.consoleOutput = config.consoleOutput ? config.consoleOutput : 'normal';
        config.request = config.request ? config.request : 'launch';
        config.stopOnEntry = config.stopOnEntry === false ? false : true;
        config.rootDir = config.rootDir ? config.rootDir : '${workspaceFolder}';
        config.outDir = config.outDir ? config.outDir : '${workspaceFolder}/out';
        config.retainDeploymentArchive = config.retainDeploymentArchive === false ? false : true;
        config.retainStagingFolder = config.retainStagingFolder === true ? true : false;
        config.clearOutputOnLaunch = config.clearOutputOnLaunch === true ? true : false;
        config.selectOutputOnLogMessage = config.selectOutputOnLogMessage === true ? true : false;
        config.enableVariablesPanel = 'enableVariablesPanel' in config ? config.enableVariablesPanel : true;

        //for rootDir, replace workspaceFolder now to avoid issues in vscode itself
        if (config.rootDir.indexOf('${workspaceFolder}') > -1) {
            config.rootDir = path.normalize(config.rootDir.replace('${workspaceFolder}', folderUri.fsPath));
        }

        //for outDir, replace workspaceFolder now
        if (config.outDir.indexOf('${workspaceFolder}') > -1) {
            config.outDir = path.normalize(config.outDir.replace('${workspaceFolder}', folderUri.fsPath));
        }

        //prompt for host if not hardcoded
        if (config.host.trim() === '${promptForHost}') {
            config.host = await vscode.window.showInputBox({
                placeHolder: 'The IP address of your Roku device',
                value: ''
            });
        }

        //prompt for password if not hardcoded
        if (config.password.trim() === '${promptForPassword}') {
            config.password = await vscode.window.showInputBox({
                placeHolder: 'The developer account password for your Roku device.',
                value: ''
            });
            if (!config.password) {
                throw new Error('Debug session terminated: password is required.');
            }
        }

        //process .env file if present
        if (config.envFile) {
            let envFilePath = config.envFile;
            //resolve ${workspaceFolder} so we can actually load the .env file now
            if (config.envFile.indexOf('${workspaceFolder}') > -1) {
                envFilePath = config.envFile.replace('${workspaceFolder}', folderUri.fsPath);
            }
            if (await this.util.fileExists(envFilePath) === false) {
                throw new Error(`Cannot find .env file at "${envFilePath}`);
            }
            //parse the .env file
            let envConfig = dotenv.parse(await this.fsExtra.readFile(envFilePath));

            //replace any env placeholders
            for (let key in config) {
                let configValue = config[key];
                let match: RegExpMatchArray;
                let regexp = /\$\{env:([\w\d_]*)\}/g;
                //replace all environment variable placeholders with their values
                while (match = regexp.exec(configValue)) {
                    let environmentVariableName = match[1];
                    let environmentVariableValue = envConfig[environmentVariableName];
                    if (environmentVariableValue) {
                        configValue = configValue.replace(match[0], environmentVariableValue);
                    }
                }
                config[key] = configValue;
            }

            //chech the host and throw error if not provided or update the workspace to set last host
            if (!config.host) {
                throw new Error('Debug session terminated: host is required.');
            } else {
                await this.context.workspaceState.update('remoteHost', config.host);
            }

        }
        return config;
    }
}

export interface BrightScriptDebugConfiguration extends DebugConfiguration {
    host: string;
    password: string;
    rootDir: string;
    debugRootDir?: string;
    outDir: string;
    stopOnEntry: boolean;
    files?: FilesType[];
    consoleOutput: 'full' | 'normal';
    retainDeploymentArchive: boolean;
    retainStagingFolder: boolean;
    clearOutputOnLaunch: boolean;
    selectOutputOnLogMessage: boolean;
    enableVariablesPanel: boolean;
    envFile?: string;
}
