import * as vscode from 'vscode';
import { LANGUAGE_SERVER_NAME, languageServerManager } from '../LanguageServerManager';
import * as path from 'path';
import * as resolve from 'resolve';
import * as fsExtra from 'fs-extra';
import * as childProcess from 'child_process';
import { firstBy } from 'thenby';
import { VscodeCommand } from './VscodeCommand';
import URI from 'vscode-uri';
import * as relativeTime from 'dayjs/plugin/relativeTime';
import { util } from '../util';
import type { LocalPackageManager } from '../managers/LocalPackageManager';
import { standardizePath as s } from 'brighterscript';
import * as dayjs from 'dayjs';
dayjs.extend(relativeTime);

export class LanguageServerInfoCommand {
    public static commandName = 'extension.brightscript.languageServer.info';

    public register(context: vscode.ExtensionContext, localPackageManager: LocalPackageManager) {
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
            }, {
                label: `View BrighterScript version cache folder`,
                description: ``,
                command: async () => {
                    await vscode.commands.executeCommand('revealFileInOS', URI.file(s`${localPackageManager.storageLocation}/brighterscript`));
                }
            }, {
                label: `Remove cached brighterscript versions`,
                description: ``,
                command: async () => {
                    await util.runWithProgress({
                        title: 'Removing cached brighterscript versions'
                    }, async () => {
                        await vscode.commands.executeCommand(VscodeCommand.clearNpmPackageCache);
                    });

                    void vscode.window.showInformationMessage('All cached brighterscript versions have been removed');

                    //restart the language server since we might have just removed the one we're using
                    await this.restartLanguageServer();
                }
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

    private discoverBrighterScriptVersions(workspaceFolders: string[]): BscVersionInfo[] {
        const versions: BscVersionInfo[] = [{
            label: `Use VSCode's version`,
            description: languageServerManager.embeddedBscInfo.version
        }];

        //look for brighterscript in node_modules from all workspace folders
        for (const workspaceFolder of workspaceFolders) {
            let bscPath: string;
            try {

                bscPath = resolve.sync('brighterscript', {
                    basedir: workspaceFolder
                });
            } catch (e) {
                //could not resolve the path, so just move on
            }

            //resolve returns a bsc script path, so remove that to get the root of brighterscript folder
            if (bscPath) {
                bscPath = bscPath.replace(/[\\\/]dist[\\\/]index.js/i, '');
                // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
                const version = fsExtra.readJsonSync(`${bscPath}/package.json`).version;
                //make the path relative to the workspace folder
                bscPath = path.relative(workspaceFolder, bscPath);

                versions.push({
                    label: 'Use Workspace Version',
                    description: version,
                    detail: bscPath.replace(/\\+/g, '/')
                });
            }
        }

        return versions;
    }

    private async getBscVersionsFromNpm() {
        const versions = await new Promise((resolve, reject) => {
            const process = childProcess.exec(`npm view brighterscript time --json`);

            process.stdout.on('data', (data) => {
                try {
                    const versions = JSON.parse(data);
                    delete versions.created;
                    delete versions.modified;
                    resolve(versions);
                } catch (error) {
                    reject(error);
                }
            });

            process.stderr.on('data', (error) => {
                reject(error);
            });

            process.on('exit', (code) => {
                if (code !== 0) {
                    reject(new Error(`Process exited with code ${code}`));
                }
            });
        });
        return Object.entries(versions)
            .map(x => {
                return {
                    version: x[0],
                    date: x[1]
                };
            })
            .sort(firstBy(x => x.date, -1));
    }

    /**
     * If this changes the user/folder/workspace settings, that will trigger a reload of the language server so there's no need to
     * call the reload manually
     */
    public async selectBrighterScriptVersion() {
        const quickPickItems = this.discoverBrighterScriptVersions(
            vscode.workspace.workspaceFolders.map(x => this.getWorkspaceOrFolderPath(x.uri.fsPath))
        );

        //start the request right now, we will leverage it later
        const versionsFromNpmPromise = this.getBscVersionsFromNpm();

        //get the full list of versions from npm
        quickPickItems.push({
            label: '$(package) Install from npm',
            description: '',
            detail: '',
            command: async () => {
                let versionsFromNpm = (await versionsFromNpmPromise).map(x => ({
                    label: x.version,
                    detail: x.version,
                    description: dayjs(x.date).fromNow(true) + ' ago'
                }));
                return await vscode.window.showQuickPick(versionsFromNpm, { placeHolder: `Select the BrighterScript version used for BrightScript and BrighterScript language features` }) as any;
            }
        } as any);

        let selection = await vscode.window.showQuickPick(quickPickItems, { placeHolder: `Select the BrighterScript version used for BrightScript and BrighterScript language features` }) as any;

        //if the selection has a command, run it before continuing;
        selection = await selection?.command?.() ?? selection;

        if (selection) {
            const config = vscode.workspace.getConfiguration('brightscript');
            //quickly clear the setting, then set it again so we are guaranteed to trigger a change event
            await config.update('bsdk', undefined);

            //if the user picked "use embedded version", then remove the setting
            if (quickPickItems.indexOf(selection) === 0) {
                //setting to undefined means "remove"
                await config.update('bsdk', 'embedded');
                return 'embedded';
            } else {
                //save this to workspace/folder settings (vscode automatically decides if it goes into the code-workspace settings or the folder settings)
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

interface BscVersionInfo {
    label: string;
    description: string;
    detail?: string;
}

export const languageServerInfoCommand = new LanguageServerInfoCommand();
