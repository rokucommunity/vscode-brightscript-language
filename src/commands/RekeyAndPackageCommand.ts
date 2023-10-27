import * as vscode from 'vscode';
import * as fsExtra from 'fs-extra';
import * as rokuDeploy from 'roku-deploy';
import type { BrightScriptCommands } from '../BrightScriptCommands';
import * as path from 'path';
import { readFileSync } from 'fs-extra';

export const FILE_SCHEME = 'bs-captureScreenshot';

export class RekeyAndPackageCommand {

    private brightScriptCommandsInstance: BrightScriptCommands;

    public register(context: vscode.ExtensionContext, BrightScriptCommandsInstance: BrightScriptCommands) {
        this.brightScriptCommandsInstance = BrightScriptCommandsInstance;

        context.subscriptions.push(vscode.commands.registerCommand('extension.brightscript.rekeyDevice', async (hostParam?: string) => {
            await this.rekeyDevice();
        }));

        context.subscriptions.push(vscode.commands.registerCommand('extension.brightscript.createPackage', async (hostParam?: string) => {
            await this.createPackage();
        }));

        context.subscriptions.push(vscode.commands.registerCommand('extension.brightscript.rekeyAndPackage', async (hostParam?: string) => {
            await this.rekeyDevice();
            await this.createPackage();
        }));
    }

    private async rekeyDevice() {
        const PICK_FROM_JSON = 'Pick from Json file';
        const MANUAL_ENTRY = 'Enter manually';

        let rekeyConfig = {
            signingPassword: '',
            rekeySignedPackage: '',
            host: '',
            password: ''
        };

        let rekeyOptionList = [PICK_FROM_JSON, MANUAL_ENTRY];
        let rekeyOption = await vscode.window.showQuickPick(rekeyOptionList, { placeHolder: 'How do you want to select you configurations', canPickMany: false });
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

    private async getRekeyConfigFromJson(rekeyConfig) {
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

            if (content.rekeySignedPackage.includes('./')) {
                await this.brightScriptCommandsInstance.getWorkspacePath();
                let workspacePath = this.brightScriptCommandsInstance.workspacePath;
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

    private async getRekeyManualEntries(rekeyConfig, defaultValues) {
        rekeyConfig.host = await vscode.window.showInputBox({
            placeHolder: 'Enter IP address of the Roku device you want to rekey',
            value: defaultValues?.host ? defaultValues.host : ''
        });

        rekeyConfig.password = await vscode.window.showInputBox({
            placeHolder: 'Enter password for the Roku device you want to rekey',
            value: defaultValues?.password ? defaultValues.password : ''
        });

        rekeyConfig.signingPassword = await vscode.window.showInputBox({
            placeHolder: 'Enter signingPassword to be used to rekey the Roku',
            value: defaultValues?.signingPassword ? defaultValues.signingPassword : ''
        });

        let chooseFileText = 'Choose';
        let cancelText = 'Cancel';
        let response = await vscode.window.showInformationMessage(
            'Please choose a signed package to rekey your device',
            ...[chooseFileText, cancelText]
        );
        if (response === chooseFileText) {
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
                rekeyConfig.rekeySignedPackage = fileUri[0].fsPath;
            }
        }

        return rekeyConfig;
    }

    private async createPackage() {
        await this.brightScriptCommandsInstance.getWorkspacePath();
        let workspacePath = this.brightScriptCommandsInstance.workspacePath;

        let rokuDeployOptions = {
            rootDir: '',
            outDir: workspacePath + '/out',
            outFile: '',
            retainStagingDir: true,
            host: '',
            password: '',
            signingPassword: ''
        };

        let PACKAGE_FOLDER = 'Pick a folder';
        let PACKAGE_FROM_LAUNCH_JSON = 'Pick from a launch.json';
        let PACKAGE_FROM_ROKU_DEPLOY = 'Pick a rokudeploy.json';

        let packageOptionList = [PACKAGE_FOLDER, PACKAGE_FROM_LAUNCH_JSON, PACKAGE_FROM_ROKU_DEPLOY];
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

            await this.brightScriptCommandsInstance.getRemoteHost(false);
            await this.brightScriptCommandsInstance.getRemotePassword(false);
            let host = this.brightScriptCommandsInstance.host;
            let remotePassword = this.brightScriptCommandsInstance.password;
            let signingPassword = await this.brightScriptCommandsInstance.getSigningPassword(false);

            let hostValue = rokuDeployOptions.host ? rokuDeployOptions.host : host;
            let passwordValue = rokuDeployOptions.password ? rokuDeployOptions.password : remotePassword;
            let signingPasswordValue = rokuDeployOptions.signingPassword ? rokuDeployOptions.signingPassword : signingPassword;

            rokuDeployOptions.host = await vscode.window.showInputBox({
                title: 'Enter IP address of the Roku device',
                value: hostValue ? hostValue : ''
            });

            rokuDeployOptions.password = await vscode.window.showInputBox({
                title: 'Enter password for the Roku device',
                value: passwordValue ? passwordValue : ''
            });

            rokuDeployOptions.signingPassword = await vscode.window.showInputBox({
                title: 'Enter signingPassword to be used to rekey the Roku',
                value: signingPasswordValue ? signingPasswordValue : ''
            });

            let confirmText = 'Create Package';
            let cancelText = 'Cancel';
            let response = await vscode.window.showInformationMessage(
                'Please confirm details below to create package \n' + JSON.stringify(rokuDeployOptions),
                ...[confirmText, cancelText]
            );
            if (response === confirmText) {
                //create a zip and pkg file of the app based on the selected launch config
                await rokuDeploy.createPackage(rokuDeployOptions);
                let remotePkgPath = await rokuDeploy.signExistingPackage(rokuDeployOptions);
                await rokuDeploy.retrieveSignedPackage(remotePkgPath, rokuDeployOptions);
                void vscode.window.showInformationMessage(`Package successfully created!`);
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
            let rootDirArray = rootDir.split('/');
            let outFileName = rootDirArray[rootDirArray.length - 1];

            rokuDeployOptions.rootDir = rootDir;
            rokuDeployOptions.outFile = 'roku-' + outFileName.replace(/ /g, '-');

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

        if (selectedConfig.rootDir?.includes('${workspaceFolder}')) {
            await this.brightScriptCommandsInstance.getWorkspacePath();
            let workspacePath = this.brightScriptCommandsInstance.workspacePath;

            selectedConfig.rootDir = path.normalize(selectedConfig.rootDir.replace('${workspaceFolder}', workspacePath));
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
        let content = JSON.parse(readFileSync(filePath).toString());
        await this.brightScriptCommandsInstance.getWorkspacePath();
        let workspacePath = this.brightScriptCommandsInstance.workspacePath;

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

export const rekeyAndPackageCommand = new RekeyAndPackageCommand();
