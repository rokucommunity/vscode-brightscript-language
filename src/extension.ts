import * as vscode from 'vscode';
import { Formatter } from './formatter';
import { WorkspaceFolder, DebugConfiguration, CancellationToken, ProviderResult } from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	//register the code formatter
	vscode.languages.registerDocumentFormattingEditProvider({ language: 'brightscript', scheme: 'file' }, new Formatter());

	context.subscriptions.push(vscode.commands.registerCommand('extension.mock-debug.getProgramName', config => {
		return vscode.window.showInputBox({
			placeHolder: "Please enter the name of a markdown file in the workspace folder",
			value: "readme.md"
		});
	}));


	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('brightscript', new BrightscriptConfigurationProvider()));
}

class BrightscriptConfigurationProvider implements vscode.DebugConfigurationProvider {

	/**
	 * Massage a debug configuration just before a debug session is being launched,
	 * e.g. add all missing attributes to the debug configuration.
	 */
	resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {
		return Promise.resolve().then(async () => {
			const editor = vscode.window.activeTextEditor;

			//fill in any missing configuration values
			if (config.type === 'brightscript') {
				config.name = config.name ? config.name : 'BrightScript Debug: Launch';
				config.request = config.request ? config.request : 'launch';
				config.stopOnEntry = config.stopOnEntry ? config.stopOnEntry : true;
				config.rootDir = config.rootDir ? config.rootDir : "${workspaceFolder}";
			}
			if (config.host === 'IP_ADDRESS_HERE') {
				return vscode.window.showInputBox({
					placeHolder: "Please enter the IP address of your Roku device",
					value: "IP_ADDRESS_HERE"
				}).then((host) => {
					config.host = host;
				});
			}
		}).then(() => {
			if (config.password === 'PASSWORD_HERE') {
				return vscode.window.showInputBox({
					placeHolder: "Please enter the developer account password for your Roku device",
					value: "PASSWORD_HERE"
				}).then((password) => {
					config.password = password;
				});
			}
		}).then(() => {
			if (config.host === 'IP_ADDRESS_HERE') {
				return vscode.window.showInformationMessage("Invalid Roku IP address").then(_ => {
					return undefined;	// abort launch
				});
			}
			if (config.password === 'PASSWORD_HERE') {
				return vscode.window.showInformationMessage("Invalid Roku password").then(_ => {
					return undefined;	// abort launch
				});
			}
			return config;
		});
	}
}

export function deactivate() {
}