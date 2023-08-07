import * as vscode from 'vscode';
import { LANGUAGE_SERVER_NAME, languageServerManager } from '../LanguageServerManager';
import * as path from 'path';

export class LanguageServerInfoCommand {
    public static commandName = 'extension.brightscript.languageServer.info';

    private context: vscode.ExtensionContext;
    public register(context: vscode.ExtensionContext) {
        this.context = context;

        context.subscriptions.push(vscode.commands.registerCommand(LanguageServerInfoCommand.commandName, async () => {
            const commands = [{
                label: `Change Selected BrighterScript Version`,
                description: `(current v${languageServerManager.selectedBscInfo.version})`,
                command: this.selectBrighterScriptVersion.bind(this)
            }, {
                label: `Restart BrighterScript Language Server`,
                description: ``,
                command: this.restartLanguageServer.bind(this)
            }, {
                label: `View language server logs`,
                description: ``,
                command: this.focusLanguageServerOutputChannel.bind(this)
            }];

            let selection = await vscode.window.showQuickPick(commands, { placeHolder: `BrighterScript Project Info` });
            await selection?.command();
        }));
    }

    private async focusLanguageServerOutputChannel() {
        const commands = await vscode.commands.getCommands();
        const command = commands.find(x => x.endsWith(LANGUAGE_SERVER_NAME));
        if (command) {
            void vscode.commands.executeCommand(command);
        }
    }

    private async restartLanguageServer() {
        await vscode.commands.executeCommand('extension.brightscript.languageServer.restart');
    }

    /**
     * If this changes the user/folder/workspace settings, that will trigger a reload of the language server so there's no need to
     * call the reload manually
     */
    public async selectBrighterScriptVersion() {
        const versions = [{
            label: `Use VS Code's version`,
            description: languageServerManager.embeddedBscInfo.version,
            detail: undefined as string //require.resolve('brighterscript')
        }];

        //look for brighterscript in all workspace folders
        for (const workspaceFolder of vscode.workspace.workspaceFolders) {
            const workspaceOrFolderPath = this.getWorkspaceOrFolderPath(workspaceFolder.uri.fsPath);
            try {
                let bscPath = require.resolve('brighterscript', {
                    paths: [workspaceFolder.uri.fsPath]
                });
                //require.resolve returns a bsc script path, so remove that to get the root of brighterscript folder
                if (bscPath) {
                    bscPath = bscPath.replace(/[\\\/]dist[\\\/]index.js/i, '');
                    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
                    const version = require(`${bscPath}/package.json`).version;
                    //make the path relative to the workspace folder
                    bscPath = path.relative(workspaceOrFolderPath, bscPath);

                    versions.push({
                        label: 'Use Workspace Version',
                        description: version,
                        detail: bscPath
                    });
                }
            } finally { }
        }
        let selection = await vscode.window.showQuickPick(versions, { placeHolder: `Select the BrighterScript version used for BrightScript and BrighterScript language features` });
        if (selection) {
            const config = vscode.workspace.getConfiguration('brightscript');
            //if the user picked "use embedded version", then remove the setting
            if (versions.indexOf(selection) === 0) {
                //setting to undefined means "remove"
                await config.update('bsdk', 'embedded');
                return 'embedded';
            } else {
                //save this to workspace/folder settings (vscode automatically decides if it goes into the code-workspace settings or the folder settings
                await config.update('bsdk', selection.detail);
                return selection.detail;
            }
        }
    }

    private getWorkspaceOrFolderPath(workspaceFolder: string) {
        const workspaceFile = vscode.workspace.workspaceFile;
        if (workspaceFile) {
            return path.dirname(workspaceFile.fsPath);
        } else {
            return workspaceFolder;
        }
    }
}

export const languageServerInfoCommand = new LanguageServerInfoCommand();
