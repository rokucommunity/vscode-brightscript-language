import { Deferred, util as bslangUtil } from 'brighterscript';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fsExtra from 'fs-extra';
import { DefaultFiles } from 'roku-deploy';
import * as rta from 'roku-test-automation';
import type {
    CancellationToken,
    DebugConfigurationProvider,
    Disposable,
    ExtensionContext,
    QuickPickItem,
    WorkspaceFolder
} from 'vscode';
import * as vscode from 'vscode';
import type { LaunchConfiguration } from 'roku-debug';
import { fileUtils } from 'roku-debug';
import { util } from './util';
import type { TelemetryManager } from './managers/TelemetryManager';
import type { ActiveDeviceManager, RokuDeviceDetails } from './ActiveDeviceManager';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import cloneDeep = require('clone-deep');
import { rokuDeploy } from 'roku-deploy';
import type { DeviceInfo } from 'roku-deploy';

/**
 * An id to represent the "Enter manually" option in the host picker
 */
export const manualHostItemId = `${Number.MAX_SAFE_INTEGER}`;
const manualLabel = 'Enter manually';

export class BrightScriptDebugConfigurationProvider implements DebugConfigurationProvider {

    public constructor(
        private context: ExtensionContext,
        private activeDeviceManager: ActiveDeviceManager,
        private telemetryManager: TelemetryManager,
        private extensionOutputChannel: vscode.OutputChannel
    ) {
        this.context = context;
        this.activeDeviceManager = activeDeviceManager;

        this.configDefaults = {
            type: 'brightscript',
            name: 'BrightScript Debug: Launch',
            host: '${promptForHost}',
            password: '${promptForPassword}',
            consoleOutput: 'normal',
            request: 'launch',
            stopOnEntry: false,
            outDir: '${workspaceFolder}/out/',
            retainDeploymentArchive: true,
            injectRaleTrackerTask: false,
            injectRdbOnDeviceComponent: false,
            disableScreenSaver: true,
            retainStagingFolder: false,
            enableVariablesPanel: true,
            showHiddenVariables: false,
            enableDebuggerAutoRecovery: false,
            stopDebuggerOnAppExit: false,
            autoRunSgDebugCommands: [],
            files: [...DefaultFiles],
            enableSourceMaps: true,
            packagePort: 80,
            enableDebugProtocol: false,
            remotePort: 8060,
            rendezvousTracking: true,
            deleteDevChannelBeforeInstall: false,
            remoteControlMode: {
                activateOnSessionStart: false,
                deactivateOnSessionEnd: false
            }
        };
    }

    //make unit testing easier by adding these imports properties
    public fsExtra = fsExtra;
    public util = util;

    private configDefaults: any;

    /**
     * Massage a debug configuration just before a debug session is being launched,
     * e.g. add all missing attributes to the debug configuration.
     */
    public async resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: BrightScriptLaunchConfiguration, token?: CancellationToken): Promise<BrightScriptLaunchConfiguration> {
        let deviceInfo: DeviceInfo;
        try {
            // merge user and workspace settings into the config
            let result = this.processUserWorkspaceSettings(config);

            //force a specific staging folder path because sometimes this conflicts with bsconfig.json
            result.stagingFolderPath = path.join('${outDir}/.roku-deploy-staging');

            result = await this.sanitizeConfiguration(result, folder);
            result = await this.processEnvFile(folder, result);
            result = await this.processHostParameter(result);
            result = await this.processPasswordParameter(result);
            result = await this.processDeepLinkUrlParameter(result);
            result = await this.processLogfilePath(folder, result);

            try {
                deviceInfo = await rokuDeploy.getDeviceInfo({ host: result.host, remotePort: result.remotePort, enhance: true });
            } catch (e) {
                // a failed deviceInfo request should NOT fail the launch
                console.error(`Failed to fetch device info for ${result.host}`, e);
            }

            if (deviceInfo && !deviceInfo.developerEnabled) {
                throw new Error(`Cannot deploy: developer mode is disabled on '${result.host}'`);
            }

            await this.context.workspaceState.update('enableDebuggerAutoRecovery', result.enableDebuggerAutoRecovery);

            return result;
        } catch (e) {
            //log any exceptions to the extension panel
            this.extensionOutputChannel.append((e as Error).stack);
            throw e;
        } finally {
            //send telemetry about this debug session (don't worry, it gets sanitized...we're just checking if certain features are being used)
            this.telemetryManager?.sendStartDebugSessionEvent(
                this.processUserWorkspaceSettings(config) as any,
                deviceInfo
            );
        }
    }

    /**
     * There are several debug-level config values that can be stored in user settings, so get those
     */
    private processUserWorkspaceSettings(config: BrightScriptLaunchConfiguration): BrightScriptLaunchConfiguration {
        const workspaceConfig = vscode.workspace.getConfiguration('brightscript.debug');

        let userWorkspaceSettings = {} as BrightScriptLaunchConfiguration;

        //only keep the config values that were explicitly defined in a config file (i.e. exclude default values)
        for (const key of Object.keys(workspaceConfig)) {
            const inspection = workspaceConfig.inspect(key);
            //if the value was explicitly defined by the user in one of the various locations, then keep this value
            if (
                inspection.globalValue !== undefined ||
                inspection.workspaceValue !== undefined ||
                inspection.globalLanguageValue !== undefined ||
                inspection.defaultLanguageValue !== undefined ||
                inspection.workspaceFolderValue !== undefined ||
                inspection.workspaceLanguageValue !== undefined ||
                inspection.workspaceFolderLanguageValue !== undefined
            ) {
                userWorkspaceSettings[key] = workspaceConfig[key];
            }
        }

        //merge the user/workspace settings in with the config (the config wins on conflict)
        const result = {
            ...userWorkspaceSettings ?? {},
            ...cloneDeep(config ?? {})
        };
        return result as BrightScriptLaunchConfiguration;
    }

    /**
     * Takes the launch.json config and applies any defaults to missing values and sanitizes some of the more complex options
     * @param config current config object
     */
    private async sanitizeConfiguration(config: BrightScriptLaunchConfiguration, folder: WorkspaceFolder): Promise<BrightScriptLaunchConfiguration> {
        let userWorkspaceSettings: any = vscode.workspace.getConfiguration('brightscript') || {};

        //make sure we have an object
        config = {

            //the workspace settings are the baseline
            ...userWorkspaceSettings,
            //override with any debug-specific settings
            ...config
        };

        let folderUri: vscode.Uri;
        //use the workspace folder provided
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

        //load the bsconfig settings (if available)
        let bsconfig = this.getBsConfig(folderUri);
        if (bsconfig) {
            config = { ...bsconfig, ...config };
        }

        config.rootDir = this.util.ensureTrailingSlash(config.rootDir ? config.rootDir : '${workspaceFolder}');

        //Check for depreciated Items
        if (config.debugRootDir) {
            if (config.sourceDirs) {
                throw new Error('Cannot set both debugRootDir AND sourceDirs');
            } else {
                config.sourceDirs = [this.util.ensureTrailingSlash(config.debugRootDir)];
            }
        } else if (config.sourceDirs) {
            let dirs: string[] = [];

            for (let dir of config.sourceDirs) {
                dirs.push(this.util.ensureTrailingSlash(dir));
            }
            config.sourceDirs = dirs;
        } else if (!config.sourceDirs) {
            config.sourceDirs = [];
        }

        if (config.componentLibraries) {
            config.componentLibrariesOutDir = this.util.ensureTrailingSlash(config.componentLibrariesOutDir ? config.componentLibrariesOutDir : '${workspaceFolder}/libs');

            for (let library of config.componentLibraries as any) {
                library.rootDir = this.util.ensureTrailingSlash(library.rootDir);
                library.files = library.files ? library.files : [...DefaultFiles];
            }
        } else {
            //create an empty array so it's easier to reason with downstream
            config.componentLibraries = [];
        }
        config.componentLibrariesPort = config.componentLibrariesPort ? config.componentLibrariesPort : 8080;

        // Pass along files needed by RDB to roku-debug
        config.rdbFilesBasePath = rta.utils.getDeviceFilesPath();

        // Apply any defaults to missing values
        config.type = config.type ? config.type : this.configDefaults.type;
        config.name = config.name ? config.name : this.configDefaults.name;
        config.host = config.host ? config.host : this.configDefaults.host;
        config.password = config.password ? config.password : this.configDefaults.password;
        config.consoleOutput = config.consoleOutput ? config.consoleOutput : this.configDefaults.consoleOutput;
        config.autoRunSgDebugCommands = config.autoRunSgDebugCommands ? config.autoRunSgDebugCommands : this.configDefaults.autoRunSgDebugCommands;
        config.request = config.request ? config.request : this.configDefaults.request;
        config.stopOnEntry ??= this.configDefaults.stopOnEntry;
        config.outDir = this.util.ensureTrailingSlash(config.outDir ? config.outDir : this.configDefaults.outDir);
        config.retainDeploymentArchive = config.retainDeploymentArchive === false ? false : this.configDefaults.retainDeploymentArchive;
        config.injectRaleTrackerTask = config.injectRaleTrackerTask === true ? true : this.configDefaults.injectRaleTrackerTask;
        config.injectRdbOnDeviceComponent = config.injectRdbOnDeviceComponent === true ? true : this.configDefaults.injectRdbOnDeviceComponent;
        config.disableScreenSaver = config.disableScreenSaver === false ? false : this.configDefaults.disableScreenSaver;
        config.retainStagingFolder ??= this.configDefaults.retainStagingFolder;
        config.enableVariablesPanel = 'enableVariablesPanel' in config ? config.enableVariablesPanel : this.configDefaults.enableVariablesPanel;
        config.showHiddenVariables = config.showHiddenVariables === true ? true : this.configDefaults.showHiddenVariables;
        config.enableDebuggerAutoRecovery = config.enableDebuggerAutoRecovery === true ? true : this.configDefaults.enableDebuggerAutoRecovery;
        config.stopDebuggerOnAppExit = config.stopDebuggerOnAppExit === true ? true : this.configDefaults.stopDebuggerOnAppExit;
        config.files = config.files ? config.files : this.configDefaults.files;
        config.enableSourceMaps = config.enableSourceMaps === false ? false : this.configDefaults.enableSourceMaps;
        config.packagePort = config.packagePort ? config.packagePort : this.configDefaults.packagePort;
        config.remotePort = config.remotePort ? config.remotePort : this.configDefaults.remotePort;
        config.logfilePath ??= null;
        config.enableDebugProtocol = config.enableDebugProtocol ? true : false;
        config.cwd = folderUri.fsPath;
        config.rendezvousTracking = config.rendezvousTracking === false ? false : true;
        config.deleteDevChannelBeforeInstall = config.deleteDevChannelBeforeInstall === true;
        if (typeof config.remoteControlMode === 'boolean') {
            config.remoteControlMode = {
                activateOnSessionStart: config.remoteControlMode,
                deactivateOnSessionEnd: config.remoteControlMode
            };
        } else {
            config.remoteControlMode = {
                activateOnSessionStart: config.remoteControlMode?.activateOnSessionStart ?? this.configDefaults.remoteControlMode.activateOnSessionStart,
                deactivateOnSessionEnd: config.remoteControlMode?.deactivateOnSessionEnd ?? this.configDefaults.remoteControlMode.deactivateOnSessionEnd
            };
        }

        if (config.request !== 'launch') {
            await vscode.window.showErrorMessage(`roku-debug only supports the 'launch' request type`);
        }

        if (config.raleTrackerTaskFileLocation?.includes('${workspaceFolder}')) {
            config.raleTrackerTaskFileLocation = path.normalize(config.raleTrackerTaskFileLocation.replace('${workspaceFolder}', folderUri.fsPath));
        }

        // Check for the existence of the tracker task file in auto injection is enabled
        if (config.injectRaleTrackerTask) {
            if (!config.raleTrackerTaskFileLocation) {
                await vscode.window.showErrorMessage(`"raleTrackerTaskFileLocation" must be defined when "injectRaleTrackerTask" is enabled`);
            } else if (await this.util.fileExists(config.raleTrackerTaskFileLocation) === false) {
                await vscode.window.showErrorMessage(`injectRaleTrackerTask was set to true but could not find TrackerTask.xml at:\n${config.raleTrackerTaskFileLocation}`);
            }
        }

        //for rootDir, replace workspaceFolder now to avoid issues in vscode itself
        if (config.rootDir.includes('${workspaceFolder}')) {
            config.rootDir = path.normalize(config.rootDir.replace('${workspaceFolder}', folderUri.fsPath));
        }

        //for outDir, replace workspaceFolder now
        if (config.outDir.includes('${workspaceFolder}')) {
            config.outDir = path.normalize(config.outDir.replace('${workspaceFolder}', folderUri.fsPath));
        }

        if (config.stagingFolderPath.includes('${outDir}')) {
            config.stagingFolderPath = path.normalize(config.stagingFolderPath.replace('${outDir}', config.outDir));
        }
        if (config.stagingFolderPath.includes('${workspaceFolder}')) {
            config.stagingFolderPath = path.normalize(config.stagingFolderPath.replace('${workspaceFolder}', folderUri.fsPath));
        }

        // Make sure that directory paths end in a trailing slash
        if (config.debugRootDir) {
            config.debugRootDir = this.util.ensureTrailingSlash(config.debugRootDir);
        }

        if (!config.rootDir) {
            console.log('No rootDir specified: defaulting to ${workspaceFolder}');
            //use the current workspace folder
            config.rootDir = folderUri.fsPath;
        }

        return config;
    }

    public async processLogfilePath(folder: WorkspaceFolder | undefined, config: BrightScriptLaunchConfiguration) {
        if (config?.logfilePath?.trim()) {
            config.logfilePath = config.logfilePath.trim();
            if (config.logfilePath.includes('${workspaceFolder}')) {
                config.logfilePath = config.logfilePath.replace('${workspaceFolder}', folder.uri.fsPath);
            }

            try {
                config.logfilePath = fileUtils.standardizePath(config.logfilePath);
                //create the logfile folder structure if not exist
                fsExtra.ensureDirSync(path.dirname(config.logfilePath));

                //create the log file if it doesn't exist
                if (!fsExtra.pathExistsSync(config.logfilePath)) {
                    fsExtra.createFileSync(config.logfilePath);
                }
                await this.context.workspaceState.update('logfilePath', config.logfilePath);
            } catch (e) {
                throw new Error(`Could not create logfile at "${config.logfilePath}"`);
            }
        }
        return config;
    }

    /**
     * Reads the manifest file and updates any config values that are mapped to it
     * @param folder current workspace folder
     * @param config current config object
     */
    private async processEnvFile(folder: WorkspaceFolder | undefined, config: BrightScriptLaunchConfiguration): Promise<BrightScriptLaunchConfiguration> {
        //process .env file if present
        if (config.envFile) {
            let envFilePath = config.envFile;
            //resolve ${workspaceFolder} so we can actually load the .env file now
            if (config.envFile.includes('${workspaceFolder}')) {
                envFilePath = config.envFile.replace('${workspaceFolder}', folder.uri.fsPath);
            }
            if (await this.util.fileExists(envFilePath) === false) {
                throw new Error(`Cannot find .env file at "${envFilePath}`);
            }
            //parse the .env file
            let envConfig = dotenv.parse(await this.fsExtra.readFile(envFilePath));

            // temporarily convert entire config to string for any envConfig replacements.
            let configString = JSON.stringify(config);
            let match: RegExpMatchArray;
            let regexp = /\$\{env:([\w\d_]*)\}/g;
            let updatedConfigString = configString;

            // apply any defined values to env placeholders
            while ((match = regexp.exec(configString))) {
                let environmentVariableName = match[1];
                let environmentVariableValue = envConfig[environmentVariableName];

                if (environmentVariableValue) {
                    updatedConfigString = updatedConfigString.replace(match[0], environmentVariableValue);
                }
            }

            config = JSON.parse(updatedConfigString);

            let configDefaults = {
                rootDir: config.rootDir,
                ...this.configDefaults
            };

            // apply any default values to env placeholders
            for (let key in config) {
                let configValue = config[key];
                let match: RegExpMatchArray;
                //replace all environment variable placeholders with their values
                while ((match = regexp.exec(configValue))) {
                    let environmentVariableName = match[1];
                    configValue = configDefaults[key];
                    console.log(`The configuration value for ${key} was not found in the env file under the name ${environmentVariableName}. Defaulting the value to: ${configValue}`);
                }
                config[key] = configValue;
            }
        }
        return config;
    }

    private async promptForHostManual() {
        return this.openInputBox('The IP address of your Roku device');
    }

    /**
     * Validates the host parameter in the config and opens an input ui if set to ${promptForHost}
     * @param config  current config object
     */
    private async processHostParameter(config: BrightScriptLaunchConfiguration): Promise<BrightScriptLaunchConfiguration> {
        if (config.host.trim() === '${promptForHost}' || (config?.deepLinkUrl?.includes('${promptForHost}'))) {
            if (this.activeDeviceManager.enabled) {
                config.host = await this.promptForHost();
            } else {
                config.host = await this.promptForHostManual();
            }
        }

        //check the host and throw error if not provided or update the workspace to set last host
        if (!config.host) {
            throw new Error('Debug session terminated: host is required.');
        } else {
            await this.context.workspaceState.update('remoteHost', config.host);
        }

        return config;
    }

    /**
     * Prompt the user to pick a host from a list of devices
     */
    private async promptForHost() {
        const deferred = new Deferred<{ ip: string; manual?: boolean } | { ip?: string; manual: true }>();
        const disposables: Array<Disposable> = [];

        const discoveryTime = 5_000;

        //create the quickpick item
        const quickPick = vscode.window.createQuickPick();
        disposables.push(quickPick);
        quickPick.placeholder = `Please Select a Roku or manually type an IP address`;
        quickPick.keepScrollPosition = true;

        function dispose() {
            for (const disposable of disposables) {
                disposable.dispose();
            }
        }

        //detect if the user types an IP address into the picker and presses enter.
        quickPick.onDidAccept(() => {
            deferred.resolve({
                ip: quickPick.value
            });
        });

        let activeChangesSinceRefresh = 0;
        let activeItem: QuickPickItem;

        // remember the currently active item so we can maintain active selection when refreshing the list
        quickPick.onDidChangeActive((items) => {
            // reset our activeChanges tracker since users cannot cause items.length to be 0 (meaning a refresh has just happened)
            if (items.length === 0) {
                activeChangesSinceRefresh = 0;
                return;
            }
            if (activeChangesSinceRefresh > 0) {
                activeItem = items[0];
            }
            activeChangesSinceRefresh++;
        });

        const itemCache = new Map<string, QuickPickHostItem>();
        quickPick.show();
        const refreshList = () => {
            const items = this.createHostQuickPickList(
                this.activeDeviceManager.getActiveDevices(),
                this.activeDeviceManager.lastUsedDevice,
                itemCache
            );
            quickPick.items = items;

            // update the busy spinner based on how long it's been since the last discovered device
            quickPick.busy = this.activeDeviceManager.timeSinceLastDiscoveredDevice < discoveryTime;
            setTimeout(() => {
                quickPick.busy = this.activeDeviceManager.timeSinceLastDiscoveredDevice < discoveryTime;
            }, discoveryTime - this.activeDeviceManager.timeSinceLastDiscoveredDevice + 20);

            // clear the activeItem if we can't find it in the list
            if (!quickPick.items.includes(activeItem)) {
                activeItem = undefined;
            }

            // if the user manually selected an item, re-focus that item now that we refreshed the list
            if (activeItem) {
                quickPick.activeItems = [activeItem];
            }
            // quickPick.show();
        };

        //anytime the device picker adds/removes a device, update the list
        this.activeDeviceManager.on('device-found', refreshList, disposables);
        this.activeDeviceManager.on('device-expired', refreshList, disposables);

        quickPick.onDidHide(() => {
            dispose();
            deferred.reject(new Error('No host was selected'));
        });

        quickPick.onDidChangeSelection(selection => {
            const selectedItem = selection[0];
            if (selectedItem) {
                if (selectedItem.kind === vscode.QuickPickItemKind.Separator) {
                    // Handle separator selection
                } else {
                    if (selectedItem.label === manualLabel) {
                        deferred.resolve({ manual: true });
                    } else {
                        const device = (selectedItem as any).device as RokuDeviceDetails;
                        this.activeDeviceManager.lastUsedDevice = device;
                        deferred.resolve(device);
                    }
                    quickPick.dispose();
                }
            }
        });
        //run the list refresh once to show the popup
        refreshList();
        const result = await deferred.promise;
        dispose();
        if (result?.manual === true) {
            return this.promptForHostManual();
        } else {
            return result?.ip;
        }
    }

    /**
     * Generate the label used when showing "host" entries in a quick picker
     * @param device the device containing all the info
     * @returns a properly formatted host string
     */
    private createHostLabel(device: RokuDeviceDetails) {
        return `${device.ip} | ${device.deviceInfo['user-device-name']} - ${device.deviceInfo['serial-number']} - ${device.deviceInfo['model-number']}`;
    }

    /**
     * Generate the item list for the `this.promptForHost()` call
     */
    private createHostQuickPickList(devices: RokuDeviceDetails[], lastUsedDevice: RokuDeviceDetails, cache = new Map<string, QuickPickHostItem>()) {
        //the collection of items we will eventually return
        let items: QuickPickHostItem[] = [];

        //find the lastUsedDevice from the devices list if possible, or use the data from the lastUsedDevice if not
        lastUsedDevice = devices.find(x => x.id === lastUsedDevice?.id) ?? lastUsedDevice;
        //remove the lastUsedDevice from the devices list so we can more easily reason with the rest of the list
        devices = devices.filter(x => x.id !== lastUsedDevice?.id);

        // Ensure the most recently used device is at the top of the list
        if (lastUsedDevice) {
            //add a separator for "last used"
            items.push({
                label: 'last used',
                kind: vscode.QuickPickItemKind.Separator
            });

            //add the device
            items.push({
                label: this.createHostLabel(lastUsedDevice),
                device: lastUsedDevice
            });
        }

        //add all other devices
        if (devices.length > 0) {
            items.push({
                label: lastUsedDevice ? 'other devices' : 'devices',
                kind: vscode.QuickPickItemKind.Separator
            });

            //add each device
            for (const device of devices) {
                //add the device
                items.push({
                    label: this.createHostLabel(device),
                    device: device
                });
            }
        }

        //include a divider between devices and "manual" option (only if we have devices)
        if (lastUsedDevice || devices.length) {
            items.push({ label: ' ', kind: vscode.QuickPickItemKind.Separator });
        }

        // allow user to manually type an IP address
        items.push(
            { label: 'Enter manually', device: { id: manualHostItemId } } as any
        );

        // replace items with their cached versions if found (to maintain references)
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (cache.has(item.label)) {
                items[i] = cache.get(item.label);
                items[i].device = item.device;
            } else {
                cache.set(item.label, item);
            }
        }

        return items;
    }

    /**
     * Validates the password parameter in the config and opens an input ui if set to ${promptForPassword}
     * @param config  current config object
     */
    private async processPasswordParameter(config: BrightScriptLaunchConfiguration) {
        //prompt for password if not hardcoded
        if (config.password.trim() === '${promptForPassword}') {
            config.password = await this.openInputBox('The developer account password for your Roku device.');
            if (!config.password) {
                throw new Error('Debug session terminated: password is required.');
            } else {
                await this.context.workspaceState.update('remotePassword', config.password);
            }
        }

        return config;
    }

    /**
     * Validates the deepLinkUrl parameter in the config and opens an input ui if set to ${promptForDeepLinkUrl} or if the url contains ${promptForQueryParams
     * @param config  current config object
     */
    private async processDeepLinkUrlParameter(config: BrightScriptLaunchConfiguration) {
        if (config.deepLinkUrl) {
            config.deepLinkUrl = config.deepLinkUrl.replace('${host}', config.host);
            config.deepLinkUrl = config.deepLinkUrl.replace('${promptForHost}', config.host);
            if (config.deepLinkUrl.includes('${promptForQueryParams}')) {
                let queryParams = await this.openInputBox('Querystring params for deep link');
                config.deepLinkUrl = config.deepLinkUrl.replace('${promptForQueryParams}', queryParams);
            }
            if (config.deepLinkUrl === '${promptForDeepLinkUrl}') {
                config.deepLinkUrl = await this.openInputBox('Full deep link url');
            }
        }
        return config;
    }

    /**
     * Helper to open a vscode input box ui
     * @param placeHolder placeHolder text
     * @param value default value
     */
    private async openInputBox(placeHolder: string, value = '') {
        return vscode.window.showInputBox({
            placeHolder: placeHolder,
            value: value
        });
    }

    /**
     * Get the bsconfig file, if available
     */
    public getBsConfig(workspaceFolder: vscode.Uri) {
        //try to load bsconfig settings
        let settings = vscode.workspace.getConfiguration('brightscript', workspaceFolder);
        let configFilePath = settings.get<string>('configFile');
        let isDefaultPath = false;
        if (!configFilePath) {
            isDefaultPath = true;
            configFilePath = 'bsconfig.json';
        }

        //if the path is relative, resolve it relative to the workspace folder. If it's absolute, use as is (path.resolve handles this logic for us)
        let workspaceFolderPath = bslangUtil.uriToPath(workspaceFolder.toString());
        configFilePath = path.resolve(workspaceFolderPath, configFilePath);
        try {
            let bsconfig = bslangUtil.loadConfigFile(configFilePath);
            return bsconfig;
        } catch (e) {
            //only log the error if the user explicitly defined a config path
            if (!isDefaultPath) {
                console.error(`Could not load bsconfig file at "${configFilePath}`);
            }
            return undefined;
        }
    }
}

export interface BrightScriptLaunchConfiguration extends LaunchConfiguration {
    /**
     * The name of this launch configuration
     */
    name: string;
    /**
     * The type of this debug configuration
     */
    type: string;
    /**
     * Should the debugger launch or attach. roku-debug only supports launching
     */
    request: 'launch' | 'attach';

    /**
     * A path to a file where all brightscript console output will be written. If falsey, file logging will be disabled.
     */
    logfilePath?: string;
    /**
     *  If true, then the zip archive is NOT deleted after a debug session has been closed.
     * @default true
     */
    retainDeploymentArchive?: boolean;

    /**
     * A path to an environment variables file which will be used to augment the launch config
     */
    envFile?: string;

    /**
     * If injectRdbOnDeviceComponent is true and this is true the screen saver will be be disabled while the deployed application is running.
     */
    disableScreenSaver?: boolean;

    /**
     * If set, the remote control will be enabled/disabled at the start/end of the debug session, respectively.
     * @default { activateOnSessionStart: false, deactivateOnSessionEnd: false }
     */
    remoteControlMode?: { activateOnSessionStart?: boolean; deactivateOnSessionEnd?: boolean };
}

type QuickPickHostItem = QuickPickItem & { device?: RokuDeviceDetails };
