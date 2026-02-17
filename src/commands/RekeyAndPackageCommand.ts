import * as vscode from 'vscode';
import * as rokuDeploy from 'roku-deploy';
import type { BrightScriptCommands } from '../BrightScriptCommands';
import * as path from 'path';
import { readFileSync } from 'fs-extra';
import type { UserInputManager } from '../managers/UserInputManager';
import { standardizePath } from 'brighterscript';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import open = require('open');

export const FILE_SCHEME = 'bs-captureScreenshot';

export class RekeyAndPackageCommand {

    private brightScriptCommands: BrightScriptCommands;
    private userInputManager: UserInputManager;

    public register(context: vscode.ExtensionContext, BrightScriptCommandsInstance: BrightScriptCommands, userInputManager: UserInputManager) {
        this.brightScriptCommands = BrightScriptCommandsInstance;
        this.userInputManager = userInputManager;

        context.subscriptions.push(vscode.commands.registerCommand('extension.brightscript.rekeyDevice', async (hostParam?: string) => {
            await this.rekeyDevice();
        }));

        context.subscriptions.push(vscode.commands.registerCommand('extension.brightscript.createPackage', async (hostParam?: string) => {
            await this.createPackage({});
        }));

        context.subscriptions.push(vscode.commands.registerCommand('extension.brightscript.rekeyAndPackage', async (hostParam?: string) => {
            await this.createPackage({}, true);
        }));
    }

    private async rekeyDevice() {
        const PICK_FROM_JSON = 'Pick from Json file';
        const MANUAL_ENTRY = 'Enter manually';

        let rekeyConfig: RekeyConfig = {
            signingPassword: '',
            rekeySignedPackage: '',
            host: '',
            password: ''
        };

        let rekeyOptionList = [PICK_FROM_JSON, MANUAL_ENTRY];
        let rekeyOption = await vscode.window.showQuickPick(rekeyOptionList, { placeHolder: 'How would you like to select your configuration', canPickMany: false });
        if (rekeyOption) {
            switch (rekeyOption) {
                case PICK_FROM_JSON:
                    rekeyConfig = await this.getRekeyConfigFromJson(rekeyConfig);
                    break;

                case MANUAL_ENTRY:
                    rekeyConfig = await this.getRekeyManualEntries(rekeyConfig, {});
                    break;
            }
        }

        await rokuDeploy.rekeyDevice(rekeyConfig);
        void vscode.window.showInformationMessage(`Device successfully rekeyed!`);
    }

    private async getRekeyConfigFromJson(rekeyConfig: RekeyConfig) {
        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: 'Select',
            canSelectFiles: true,
            canSelectFolders: false,
            filters: {
                'Json files': ['json']
            }
        };

        let fileUri = await vscode.window.showOpenDialog(options);
        if (fileUri?.[0]) {
            let content = JSON.parse(readFileSync(fileUri[0].fsPath).toString());

            if (content.signingPassword) {
                rekeyConfig.signingPassword = content.signingPassword;
            }

            if (content.rekeySignedPackage?.includes('./')) {
                await this.brightScriptCommands.getWorkspacePath();
                let workspacePath = this.brightScriptCommands.workspacePath;
                rekeyConfig.rekeySignedPackage = workspacePath + content.rekeySignedPackage.replace('./', '/');
            }

            if (content.host) {
                rekeyConfig.host = content.host;
            }

            if (content.password) {
                rekeyConfig.password = content.password;
            }
        }
        return this.getRekeyManualEntries(rekeyConfig, rekeyConfig);
    }

    private async getRekeyManualEntries(rekeyConfig: RekeyConfig, defaultValues) {
        rekeyConfig.host = await this.userInputManager.promptForHost({ defaultValue: rekeyConfig?.host ?? defaultValues?.host });

        rekeyConfig.password = await vscode.window.showInputBox({
            title: 'Enter password for the Roku device you want to rekey',
            value: defaultValues?.password ?? ''
        });
        if (!rekeyConfig.password) {
            throw new Error('Cancelled');
        }

        rekeyConfig.signingPassword = await vscode.window.showInputBox({
            title: 'Enter signingPassword to be used to rekey the Roku',
            value: defaultValues?.signingPassword ?? ''
        });
        if (!rekeyConfig.signingPassword) {
            throw new Error('Cancelled');
        }

        rekeyConfig.rekeySignedPackage = await this.getSignedPackage(rekeyConfig.rekeySignedPackage);

        const selection = await vscode.window.showInformationMessage('Rekey info:', {
            modal: true,
            detail: [
                `host: ${rekeyConfig.host}`,
                `password: ${rekeyConfig.password}`,
                `signing password: ${rekeyConfig.signingPassword}`,
                `package: ${rekeyConfig.rekeySignedPackage}`
            ].join('\n')
        }, 'Rekey', 'I want to change something');
        if (selection === 'Rekey') {
            return rekeyConfig;
        } else if (selection === 'I want to change something') {
            return this.getRekeyManualEntries(rekeyConfig, rekeyConfig);
        }
    }

    private async getSignedPackage(rekeySignedPackage: string) {
        let response = '';
        rekeySignedPackage = standardizePath(rekeySignedPackage);
        if (rekeySignedPackage?.length > 0) {
            response = await vscode.window.showInformationMessage(
                'Please choose a signed package (a .pkg file) to rekey your device',
                {
                    modal: true,
                    detail: `Current file: ${rekeySignedPackage}`
                },
                'Use the current file', 'Pick a different file'
            );
        } else {
            response = await vscode.window.showInformationMessage(
                'Please choose a signed package (a .pkg file) to rekey your device',
                { modal: true },
                'Open file picker'
            );
        }
        if ((response === 'Open file picker') || (response === 'Pick a different file')) {
            const options: vscode.OpenDialogOptions = {
                canSelectMany: false,
                openLabel: 'Select signed package file',
                canSelectFiles: true,
                canSelectFolders: false,
                filters: {
                    'Pkg files': ['pkg']
                }
            };
            let fileUri = await vscode.window.showOpenDialog(options);
            if (fileUri?.[0]) {
                return fileUri[0].fsPath;
            }
        } else if (response === 'Use the current file') {
            return rekeySignedPackage;
        } else {
            throw new Error('Cancelled');
        }
    }

    private async promptUserForAFolder(dialogTitle) {
        let response = '';

        response = await vscode.window.showInformationMessage(
            dialogTitle,
            { modal: true },
            'Open file picker'
        );

        if (response === 'Open file picker') {
            const options: vscode.OpenDialogOptions = {
                canSelectMany: false,
                openLabel: 'Select',
                canSelectFiles: false,
                canSelectFolders: true
            };
            let folderUri = await vscode.window.showOpenDialog(options);
            if (folderUri?.[0]) {
                return folderUri[0].fsPath;
            }
        } else {
            throw new Error('Cancelled');
        }
    }

    private async createPackage(defaultValues: Partial<RokuDeployOptions>, rekeyFlag = false) {
        const workspaceFolder = await this.brightScriptCommands.getWorkspacePath();

        let rokuDeployOptions = defaultValues as RokuDeployOptions;

        let PACKAGE_FOLDER = 'Pick a folder';
        let PACKAGE_FROM_LAUNCH_JSON = 'Pick from a launch.json';
        let PACKAGE_FROM_ROKU_DEPLOY = 'Pick a rokudeploy.json';
        let packageOptionList = [];

        if (rokuDeployOptions.packageConfig) {
            packageOptionList.push({
                label: `Previous Selection:`,
                detail: `${rokuDeployOptions.packageConfig}`
            });
        }
        packageOptionList.push(PACKAGE_FOLDER, PACKAGE_FROM_LAUNCH_JSON, PACKAGE_FROM_ROKU_DEPLOY);

        let packageOption = await vscode.window.showQuickPick(packageOptionList, { placeHolder: 'What would you like to package', canPickMany: false });
        if (packageOption) {
            switch (packageOption) {
                case PACKAGE_FOLDER:
                    rokuDeployOptions = await this.packageFromFolder(rokuDeployOptions);
                    break;

                case PACKAGE_FROM_LAUNCH_JSON:
                    rokuDeployOptions = await this.packageFromLaunchConfig(rokuDeployOptions);
                    break;

                case PACKAGE_FROM_ROKU_DEPLOY:
                    rokuDeployOptions = await this.packageFromRokuDeploy(rokuDeployOptions);
                    break;
            }

            rokuDeployOptions.host = await this.userInputManager.promptForHost({ defaultValue: rokuDeployOptions?.host ?? '' });

            rokuDeployOptions.password = await vscode.window.showInputBox({
                title: 'Enter password for the Roku device',
                value: rokuDeployOptions.password ?? ''
            });
            if (!rokuDeployOptions.password) {
                throw new Error('Cancelled');
            }

            rokuDeployOptions.signingPassword = await vscode.window.showInputBox({
                title: 'Enter signingPassword for the Roku',
                value: rokuDeployOptions.signingPassword ?? ''
            });

            if (!rokuDeployOptions.rootDir) {
                rokuDeployOptions.rootDir = await this.promptUserForAFolder('Select rootDir to create package');
            }
            if (!rokuDeployOptions.rootDir) {
                throw new Error('Cancelled');
            }

            //normalize a few options
            rokuDeployOptions.outFile ??= rokuDeploy.getOptions(rokuDeployOptions).outFile;
            rokuDeployOptions.outDir = standardizePath(rokuDeployOptions.outDir ?? `${workspaceFolder}/out`);
            rokuDeployOptions.rootDir = standardizePath(rokuDeployOptions.rootDir);
            rokuDeployOptions.retainStagingDir = true;
            if (rokuDeployOptions.rekeySignedPackage?.length > 0) {
                rokuDeployOptions.rekeySignedPackage = standardizePath(rokuDeployOptions.rekeySignedPackage);
            }

            let details = [
                `host: ${rokuDeployOptions.host}`,
                `password: ${rokuDeployOptions.password}`,
                `signing password: ${rokuDeployOptions.signingPassword}`,
                `outDir: ${rokuDeployOptions.outDir}`,
                `outFile: ${rokuDeployOptions.outFile}.pkg`,
                `rootDir: ${rokuDeployOptions.rootDir}`
            ];

            if (rekeyFlag) {
                rokuDeployOptions.rekeySignedPackage = await this.getSignedPackage(rokuDeployOptions.rekeySignedPackage);
                details.push(`rekeySignedPackage: ${rokuDeployOptions.rekeySignedPackage}`);
            }

            let confirmText = 'Create Package';
            let changeText = 'I want to change something';
            let response = await vscode.window.showInformationMessage('Create Package info:', {
                modal: true,
                detail: details.join('\n')
            }, confirmText, changeText);

            if (response === confirmText) {
                if (rekeyFlag) {
                    //rekey device
                    await rokuDeploy.rekeyDevice(rokuDeployOptions);
                }

                //create a zip and pkg file of the app based on the selected launch config
                await rokuDeploy.createPackage(rokuDeployOptions);
                let remotePkgPath = await rokuDeploy.signExistingPackage(rokuDeployOptions);
                await rokuDeploy.retrieveSignedPackage(remotePkgPath, rokuDeployOptions);
                const outPath = standardizePath(`${rokuDeployOptions.outDir}/${rokuDeployOptions.outFile}`);
                let successfulMessage = `Package successfully created at ${outPath}`;
                void vscode.window.showInformationMessage(successfulMessage, 'View in folder').then(() => {
                    return open(rokuDeployOptions.outDir);
                });

            } else if (response === changeText) {
                return this.createPackage(rokuDeployOptions, rekeyFlag);
            }
        }
    }

    private async packageFromFolder(rokuDeployOptions) {
        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: 'Select Folder to package',
            canSelectFiles: false,
            canSelectFolders: true
        };
        let fileUri = await vscode.window.showOpenDialog(options);
        if (fileUri?.[0]) {
            let rootDir = fileUri?.[0].fsPath;

            rokuDeployOptions.rootDir = rootDir;
            rokuDeployOptions.outFile = path.basename(rootDir);
            rokuDeployOptions.packageConfig = 'folder: ' + rootDir;

            return rokuDeployOptions;
        }
    }

    private async packageFromRokuDeploy(rokuDeployOptions) {
        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: 'Select',
            canSelectFiles: true,
            canSelectFolders: false,
            filters: {
                'Json files': ['json']
            }
        };

        let fileUri = await vscode.window.showOpenDialog(options);
        if (fileUri?.[0]) {
            return this.parseRokuDeployJson(fileUri[0].fsPath, rokuDeployOptions);
        }
        return rokuDeployOptions;
    }

    private async packageFromLaunchConfig(rokuDeployOptions) {
        let config = vscode.workspace.getConfiguration('launch', null);
        const configurations = config.get<any[]>('configurations');
        let configNames = [];
        for (let config of configurations) {
            configNames.push(config.name);
        }

        //show user a list of available launch configs to choose from
        let selectedConfig = configurations[0];
        let selectedConfigName = await vscode.window.showQuickPick(configNames, { placeHolder: 'Please select a config', canPickMany: false });
        if (selectedConfigName) {
            let selectedIndex = configNames.indexOf(selectedConfigName);
            selectedConfig = configurations[selectedIndex];
        }

        let workspacePath = await this.brightScriptCommands.getWorkspacePath();
        if (selectedConfig.rootDir?.includes('${workspaceFolder}')) {
            selectedConfig.rootDir = path.normalize(selectedConfig.rootDir.replace('${workspaceFolder}', workspacePath));
        }
        rokuDeployOptions.packageConfig = 'launch.json: ' + selectedConfig.rootDir;

        if (selectedConfig?.profiling?.perfettoEvent?.dir?.includes('${workspaceFolder}')) {
            selectedConfig.profiling.perfettoEvent.dir = path.normalize(selectedConfig.profiling.perfettoEvent.dir.replace('${workspaceFolder}', workspacePath));
        }

        if (selectedConfig?.profiling?.perfettoEvent && !selectedConfig.profiling.perfettoEvent.dir) {
            selectedConfig.profiling.perfettoEvent.dir = `${workspacePath}/profiling`;
        }

        if (!selectedConfig.host.includes('${')) {
            rokuDeployOptions.host = selectedConfig.host;
        }

        if (!selectedConfig.password.includes('${')) {
            rokuDeployOptions.password = selectedConfig.password;
        }

        rokuDeployOptions.rootDir = selectedConfig.rootDir;
        rokuDeployOptions.files = selectedConfig.files;
        rokuDeployOptions.outFile = 'roku-' + selectedConfig.name.replace(/ /g, '-');

        return rokuDeployOptions;
    }

    private async parseRokuDeployJson(filePath: string, rokuDeployOptions) {
        rokuDeployOptions.packageConfig = 'rokudeploy.json: ' + filePath;
        let content = JSON.parse(readFileSync(filePath).toString());
        await this.brightScriptCommands.getWorkspacePath();
        let workspacePath = this.brightScriptCommands.workspacePath;

        if (content.signingPassword) {
            rokuDeployOptions.signingPassword = content.signingPassword;
        }

        if (content.rekeySignedPackage?.includes('./')) {
            rokuDeployOptions.rekeySignedPackage = workspacePath + content.rekeySignedPackage.replace('./', '/');
        }

        if (content.host) {
            rokuDeployOptions.host = content.host;
        }

        if (content.password) {
            rokuDeployOptions.password = content.password;
        }

        if (content.rootDir?.includes('./')) {
            rokuDeployOptions.rootDir = workspacePath + content.rootDir.replace('./', '/');
        }

        if (content.outDir?.includes('./')) {
            rokuDeployOptions.outDir = workspacePath + content.outDir.replace('./', '/');
        }

        if (content.outFile) {
            rokuDeployOptions.outFile = content.outFile;
        }

        if (content.retainStagingDir) {
            rokuDeployOptions.retainStagingDir = content.retainStagingDir;
        }

        return rokuDeployOptions;
    }
}

interface RekeyConfig {
    signingPassword: string;
    rekeySignedPackage: string;
    host: string;
    password: string;
}

interface RokuDeployOptions {
    rootDir: string;
    outDir: string;
    outFile: string;
    retainStagingDir: boolean;
    host: string;
    password: string;
    signingPassword: string;
    rekeySignedPackage: string;
    packageConfig: string;
}

export const rekeyAndPackageCommand = new RekeyAndPackageCommand();
