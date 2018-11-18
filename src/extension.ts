import * as vscode from 'vscode';
import { Formatter } from './formatter';
import { WorkspaceFolder, DebugConfiguration, CancellationToken, ProviderResult } from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	//register the code formatter
	vscode.languages.registerDocumentFormattingEditProvider({ language: 'brightscript', scheme: 'file' }, new Formatter());

	context.subscriptions.push(vscode.commands.registerCommand('extension.mock-debug.getProgramName', config => {
		return vscode.window.showInputBox({
			placeHolder: 'Please enter the name of a markdown file in the workspace folder',
			value: 'readme.md'
		});
	}));


	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('brightscript', new BrightscriptConfigurationProvider()));
}

class BrightscriptConfigurationProvider implements vscode.DebugConfigurationProvider {
	/**
	 * Massage a debug configuration just before a debug session is being launched,
	 * e.g. add all missing attributes to the debug configuration.
	 */
	async resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: BrightscriptDebugConfiguration, token?: CancellationToken): Promise<DebugConfiguration> {
		//fill in default configuration values
		if (config.type === 'brightscript') {
			config.name = config.name ? config.name : 'BrightScript Debug: Launch';
			config.consoleOutput = config.consoleOutput ? config.consoleOutput : 'normal';
			config.request = config.request ? config.request : 'launch';
			config.stopOnEntry = config.stopOnEntry === false ? false : true;
			config.rootDir = config.rootDir ? config.rootDir : '${workspaceFolder}';
			config.outDir = config.outDir ? config.outDir : '${workspaceFolder}/out';
			config.retainDeploymentArchive = config.retainDeploymentArchive === false ? false : true;
			config.retainStagingFolder = config.retainStagingFolder === true ? true : false;
		}
		//prompt for host if not hardcoded
		if (config.host === '${promptForHost}' || (config.deepLinkUrl && config.deepLinkUrl.indexOf('${promptForHost}') > -1)) {
			config.host = await vscode.window.showInputBox({
				placeHolder: 'The IP address of your Roku device',
				value: ''
			});
			if (!config.host) {
				throw new Error('Debug session terminated: host is required.');
			}
		}
		//prompt for password if not hardcoded
		if (config.password === '${promptForPassword}') {
			config.password = await vscode.window.showInputBox({
				placeHolder: 'The developer account password for your Roku device.',
				value: ''
			});
			if (!config.password) {
				throw new Error('Debug session terminated: password is required.');
			}
		}
		if (config.deepLinkUrl) {
			config.deepLinkUrl = config.deepLinkUrl.replace("${host}", config.host);
			config.deepLinkUrl = config.deepLinkUrl.replace("${promptForHost}", config.host);
			if (config.deepLinkUrl.indexOf('${promptForContentId') > -1) {
				let contentId = await vscode.window.showInputBox({
					placeHolder: "Content id for deep link",
					value: ""
				});
				config.deepLinkUrl = config.deepLinkUrl.replace('${promptForContentId}', contentId);
			}
			if (config.deepLinkUrl.indexOf('${promptForMediaType') > -1) {
				let mediaType = await vscode.window.showInputBox({
					placeHolder: "Content id for deep link",
					value: ""
				});
				config.deepLinkUrl = config.deepLinkUrl.replace('${promptForMediaType}', mediaType);
			}
			if (config.deepLinkUrl === '${promptForDeepLinkUrl}') {
				config.deepLinkUrl = await vscode.window.showInputBox({
					placeHolder: "Full deep link url",
					value: ""
				});
			}
		}


		//await vscode.window.showInformationMessage('Invalid Roku IP address')
		return config;
	}
}

export function deactivate() {
}

interface BrightscriptDebugConfiguration extends DebugConfiguration {
	host: string;
	deepLinkUrl: string;
	password: string;
	rootDir: string;
	outDir: string;
	stopOnEntry: boolean;
	consoleOutput: 'full' | 'normal';
	retainDeploymentArchive: boolean;
	retainStagingFolder: boolean;
}