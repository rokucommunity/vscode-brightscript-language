import { util as bslangUtil } from 'brighterscript';
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

    public constructor(context: ExtensionContext, activeDeviceManager: any) {
        this.context = context;
        this.activeDeviceManager = activeDeviceManager;
        let config: any = vscode.workspace.getConfiguration('brightscript') || {};
        this.showDeviceInfoMessages = (config.deviceDiscovery || {}).showInfoMessages;
        this.trackerTaskFileLocation = (config.rokuAdvancedLayoutEditor || {}).trackerTaskFileLocation;
        vscode.workspace.onDidChangeConfiguration((e) => {
            let config: any = vscode.workspace.getConfiguration('brightscript') || {};
            this.showDeviceInfoMessages = (config.deviceDiscovery || {}).showInfoMessages;
            this.trackerTaskFileLocation = (config.rokuAdvancedLayoutEditor || {}).trackerTaskFileLocation;
        });
    }

    public context: ExtensionContext;
    public activeDeviceManager: any;

    //make unit testing easier by adding these imports properties
    public fsExtra = fsExtra;
    public util = util;

    private showDeviceInfoMessages: boolean;
    private trackerTaskFileLocation: string;

    /**
     * Massage a debug configuration just before a debug session is being launched,
     * e.g. add all missing attributes to the debug configuration.
     */
    public async resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: BrightScriptDebugConfiguration, token?: CancellationToken): Promise<DebugConfiguration> {
        let settings: any = vscode.workspace.getConfiguration('brightscript') || {};

        let defaultFilesArray: FilesType[] = [
            'manifest',
            'source/**/*.*',
            'components/**/*.*',
            'images/**/*.*'
        ];

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
        let brsconfig = await this.getBrsConfig(folderUri);
        if (brsconfig) {
            config = Object.assign({}, brsconfig, config);
        }

        config.rootDir = this.util.checkForTrailingSlash(config.rootDir ? config.rootDir : '${workspaceFolder}');

        //Check for depreciated Items
        if (config.debugRootDir) {
            if (config.sourceDirs) {
                throw new Error('Cannot set both debugRootDir AND sourceDirs');
            } else {
                config.sourceDirs = [this.util.checkForTrailingSlash(config.debugRootDir)];
            }
        } else if (config.sourceDirs) {
            let dirs: string[] = [];

            for (let dir of config.sourceDirs) {
                dirs.push(this.util.checkForTrailingSlash(dir));
            }
            config.sourceDirs = dirs;
        } else if (!config.sourceDirs) {
            config.sourceDirs = [config.rootDir];
        }

        // #region Prepare Component Library config items
        if (config.componentLibraries) {
            config.componentLibrariesOutDir = this.util.checkForTrailingSlash(config.componentLibrariesOutDir ? config.componentLibrariesOutDir : '${workspaceFolder}/libs');

            let compLibs: FilesType[][] = [];
            for (let library of config.componentLibraries as any) {
                library.rootDir = this.util.checkForTrailingSlash(library.rootDir);
                library.files = library.files ? library.files : defaultFilesArray;
                compLibs.push(library);
            }
            config.componentLibraries = compLibs;
        } else {
            config.componentLibraries = [];
        }
        config.componentLibrariesPort = config.componentLibrariesPort ? config.componentLibrariesPort : 8080;
        // #endregion

        config.type = config.type ? config.type : 'brightscript';
        config.name = config.name ? config.name : 'BrightScript Debug: Launch';
        config.host = config.host ? config.host : '${promptForHost}';
        config.password = config.password ? config.password : '${promptForPassword}';
        config.consoleOutput = config.consoleOutput ? config.consoleOutput : 'normal';
        config.request = config.request ? config.request : 'launch';
        config.stopOnEntry = config.stopOnEntry ? config.stopOnEntry : false;
        config.outDir = this.util.checkForTrailingSlash(config.outDir ? config.outDir : '${workspaceFolder}/out');
        config.retainDeploymentArchive = config.retainDeploymentArchive === false ? false : true;
        config.injectRaleTrackerTask = config.injectRaleTrackerTask === true ? true : false;
        config.retainStagingFolder = config.retainStagingFolder === true ? true : false;
        config.clearOutputOnLaunch = config.clearOutputOnLaunch === true ? true : false;
        config.selectOutputOnLogMessage = config.selectOutputOnLogMessage === true ? true : false;
        config.enableVariablesPanel = 'enableVariablesPanel' in config ? config.enableVariablesPanel : true;
        config.enableDebuggerAutoRecovery = config.enableDebuggerAutoRecovery === true ? true : false;
        config.stopDebuggerOnAppExit = config.stopDebuggerOnAppExit === true ? true : false;
        config.enableLookupVariableNodeChildren = config.enableLookupVariableNodeChildren === true ? true : false;
        config.files = config.files ? config.files : defaultFilesArray;

        if (config.injectRaleTrackerTask) {
            if (await this.util.fileExists(this.trackerTaskFileLocation) === false) {
                vscode.window.showErrorMessage(`injectRaleTrackerTask was set to true but could not find TrackerTask.xml at:\n${this.trackerTaskFileLocation}`);
            } else {
                config.trackerTaskFileLocation = this.trackerTaskFileLocation;
            }
        }

        //for rootDir, replace workspaceFolder now to avoid issues in vscode itself
        if (config.rootDir.indexOf('${workspaceFolder}') > -1) {
            config.rootDir = path.normalize(config.rootDir.replace('${workspaceFolder}', folderUri.fsPath));
        }

        //for outDir, replace workspaceFolder now
        if (config.outDir.indexOf('${workspaceFolder}') > -1) {
            config.outDir = path.normalize(config.outDir.replace('${workspaceFolder}', folderUri.fsPath));
        }

        // Make sure that directory paths end in a trailing slash
        if (config.debugRootDir) {
            config.debugRootDir = this.util.checkForTrailingSlash(config.debugRootDir);
        }

        let showInputBox = false;

        // #region prompt for host if not hardcoded
        if (config.host.trim() === '${promptForHost}' || (config.deepLinkUrl && config.deepLinkUrl.indexOf('${promptForHost}') > -1)) {
            if (this.activeDeviceManager.firstRequestForDevices && !this.activeDeviceManager.getCacheStats().keys) {
                let deviceWaitTime = 5000;
                if (this.showDeviceInfoMessages) {
                    vscode.window.showInformationMessage(`Device Info: Allowing time for device discovery (${deviceWaitTime} ms)`);
                }

                await util.delay(deviceWaitTime);
            }

            let activeDevices = this.activeDeviceManager.getActiveDevices();

            if (activeDevices && Object.keys(activeDevices).length) {
                let items = [];

                // Create the Quick Picker option items
                Object.keys(activeDevices).map((key) => {
                    let device = activeDevices[key];
                    let itemText = `${device.ip} | ${device.deviceInfo['default-device-name']} - ${device.deviceInfo['model-number']}`;

                    if (this.activeDeviceManager.lastUsedDevice && device.deviceInfo['default-device-name'] === this.activeDeviceManager.lastUsedDevice) {
                        items.unshift(itemText);
                    } else {
                        items.push(itemText);
                    }
                });

                // Give the user the option to type their own IP incase the device they want has not yet been detected on the network
                let manualIpOption = 'Other';
                items.push(manualIpOption);

                let host = await vscode.window.showQuickPick(items, { placeHolder: `Please Select a Roku or use the "${manualIpOption}" option to enter a IP` });

                if (host === manualIpOption) {
                    showInputBox = true;
                } else if (host) {
                    let defaultDeviceName = host.substring(host.toLowerCase().indexOf(' | ') + 3, host.toLowerCase().lastIndexOf(' - '));
                    let deviceIP = host.substring(0, host.toLowerCase().indexOf(' | '));
                    if (defaultDeviceName) {
                        this.activeDeviceManager.lastUsedDevice = defaultDeviceName;
                    }
                    config.host = deviceIP;
                } else {
                    // User canceled. Give them one more change to enter an ip
                    showInputBox = true;
                }
            } else {
                showInputBox = true;
            }
        }

        if (showInputBox) {
            config.host = await this.openInputBox('The IP address of your Roku device');
        }
        console.log(config.host);
        // #endregion

        //prompt for password if not hardcoded
        if (config.password.trim() === '${promptForPassword}') {
            config.password = await this.openInputBox('The developer account password for your Roku device.');
            if (!config.password) {
                throw new Error('Debug session terminated: password is required.');
            }
        }

        if (config.deepLinkUrl) {
            config.deepLinkUrl = config.deepLinkUrl.replace('${host}', config.host);
            config.deepLinkUrl = config.deepLinkUrl.replace('${promptForHost}', config.host);
            if (config.deepLinkUrl.indexOf('${promptForQueryParams') > -1) {
                let queryParams = await this.openInputBox('Querystring params for deep link');
                config.deepLinkUrl = config.deepLinkUrl.replace('${promptForQueryParams}', queryParams);
            }
            if (config.deepLinkUrl === '${promptForDeepLinkUrl}') {
                config.deepLinkUrl = await this.openInputBox('Full deep link url');
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
            await this.context.workspaceState.update('enableDebuggerAutoRecovery', config.enableDebuggerAutoRecovery);
        }
        return config;
    }

    private async openInputBox(placeHolder: string, value: string = '') {
        return await vscode.window.showInputBox({
            placeHolder: placeHolder,
            value: value
        });
    }

    /**
     * Get the brsConfig file, if available
     */
    public async getBrsConfig(workspaceFolder: vscode.Uri) {
        //try to load brsconfig settings
        let settings = await vscode.workspace.getConfiguration('brightscript', workspaceFolder);
        let configFilePath = settings.get<string>('configFile');

        //if the path is relative, resolve it relative to the workspace folder. If it's absolute, use as is (path.resolve handles this logic for us)
        configFilePath = path.resolve(bslangUtil.uriToPath(workspaceFolder.toString()), configFilePath);
        try {
            let brsconfig = await bslangUtil.loadConfigFile(configFilePath);
            return brsconfig;
        } catch (e) {
            console.error(`Could not load brsconfig file at "${configFilePath}`);
            return undefined;
        }
    }
}

export interface BrightScriptDebugConfiguration extends DebugConfiguration {
    host: string;
    password: string;
    rootDir: string;
    sourceDirs?: string[];
    bsConst?: { [key: string]: boolean };
    componentLibrariesPort?; number;
    componentLibrariesOutDir: string;
    componentLibraries: FilesType[][];
    outDir: string;
    stopOnEntry: boolean;
    files?: FilesType[];
    consoleOutput: 'full' | 'normal';
    retainDeploymentArchive: boolean;
    injectRaleTrackerTask: boolean;
    trackerTaskFileLocation: string;
    retainStagingFolder: boolean;
    clearOutputOnLaunch: boolean;
    selectOutputOnLogMessage: boolean;
    enableVariablesPanel: boolean;
    enableDebuggerAutoRecovery: boolean;
    stopDebuggerOnAppExit: boolean;
    envFile?: string;
}
