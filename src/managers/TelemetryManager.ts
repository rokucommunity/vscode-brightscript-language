import TelemetryReporter from '@vscode/extension-telemetry';
import type { Disposable } from 'vscode';
import type { BrightScriptLaunchConfiguration } from '../DebugConfigurationProvider';
import type { RemoteControlModeInitiator } from './RemoteControlManager';
import * as vscode from 'vscode';
import type { DeviceInfo } from 'roku-deploy';

const APP_INSIGHTS_KEY = '8618f206-4732-4729-88ed-d07dcf17f199';

export class TelemetryManager implements Disposable {
    public constructor(
        public options: {
            extensionId: string;
            extensionVersion: string;
            applicationInsightsKey?: string;
        }
    ) {
        this.reporter = new TelemetryReporter(this.options.extensionId, this.options.extensionVersion, this.options.applicationInsightsKey ?? APP_INSIGHTS_KEY);
    }

    public dispose() {
        return this.reporter.dispose();
    }

    /**
     * The extension has first started up
     */
    public sendStartupEvent() {
        this.reporter.sendTelemetryEvent('startup');
    }

    /**
     * Track when a debug session has been started
     */
    public sendStartDebugSessionEvent(initialConfig: BrightScriptLaunchConfiguration & { preLaunchTask: string }, finalConfig: BrightScriptLaunchConfiguration, deviceInfo?: DeviceInfo) {
        let debugConnectionType: 'debugProtocol' | 'telnet';
        let enableDebugProtocol = finalConfig?.enableDebugProtocol ?? initialConfig?.enableDebugProtocol;
        if (enableDebugProtocol === true) {
            debugConnectionType = 'debugProtocol';
        } else if (enableDebugProtocol === false) {
            debugConnectionType = 'telnet';
        } else {
            debugConnectionType = undefined;
        }

        this.reporter.sendTelemetryEvent('startDebugSession', {
            enableDebugProtocol: boolToString(initialConfig.enableDebugProtocol),
            enableVariablesPanel: boolToString(initialConfig.enableVariablesPanel),
            deferScopeLoading: boolToString(initialConfig.deferScopeLoading),
            autoResolveVirtualVariables: boolToString(initialConfig.autoResolveVirtualVariables),
            enhanceREPLCompletions: boolToString(initialConfig.enhanceREPLCompletions),
            rewriteDevicePathsInLogs: boolToString(initialConfig.rewriteDevicePathsInLogs),
            showHiddenVariables: boolToString(initialConfig.showHiddenVariables),
            debugConnectionType: debugConnectionType?.toString(),
            retainDeploymentArchive: boolToString(initialConfig.retainDeploymentArchive),
            retainStagingFolder: boolToString(initialConfig.retainStagingFolder),
            injectRaleTrackerTask: boolToString(initialConfig.injectRaleTrackerTask),
            isFilesDefined: isDefined(initialConfig.files),
            isPreLaunchTaskDefined: isDefined(initialConfig.preLaunchTask),
            isComponentLibrariesDefined: isDefined(initialConfig.componentLibraries),
            isDeepLinkUrlDefined: isDefined(initialConfig.deepLinkUrl),
            isStagingFolderPathDefined: isDefined(initialConfig.stagingFolderPath),
            isLogfilePathDefined: isDefined(initialConfig.logfilePath),
            isBsConstDefined: isDefined(initialConfig.bsConst),
            isExtensionLogfilePathDefined: isDefined(
                vscode.workspace.getConfiguration('brightscript').get<string>('extensionLogfilePath')
            ),
            // include some deviceInfo data
            deviceInfoSoftwareVersion: deviceInfo?.softwareVersion,
            deviceInfoSoftwareBuild: deviceInfo?.softwareBuild?.toString(),
            deviceInfoBrightscriptDebuggerVersion: deviceInfo?.brightscriptDebuggerVersion,
            deviceInfoCountry: deviceInfo?.country,
            deviceInfoLocale: deviceInfo?.locale,
            deviceInfoUiResolution: deviceInfo?.uiResolution
        });
    }

    /**
     * Track when remoteControlMode has been enabled or disabled (we don't track WHAT users send, only that they're enabling/disabling the feature)
     * @param enabled is the remoteControlMode being enabled or disabled
     * @param initiator who triggered this event. 'statusbar' is when the user clicks the "toggle remote mode" in the statusbar.
     *                  "command" is when it's triggered directly from a vscode command
     */
    public sendSetRemoteControlModeEvent(isEnabled: boolean, initiator: RemoteControlModeInitiator) {
        this.reporter.sendTelemetryEvent('setRemoteControlMode', {
            isEnabled: boolToString(isEnabled),
            initiator: initiator
        });
    }

    private reporter: TelemetryReporter;
}

function boolToString(value: boolean | undefined) {
    return value?.toString() ?? 'undefined';
}

function isDefined(value: any) {
    return value ? 'true' : 'false';
}
