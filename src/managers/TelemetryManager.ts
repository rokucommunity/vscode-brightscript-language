import TelemetryReporter from '@vscode/extension-telemetry';
import type { Disposable } from 'vscode';
import type { BrightScriptLaunchConfiguration } from '../DebugConfigurationProvider';
import type { RemoteControlModeInitiator } from './RemoteControlManager';

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
    public sendStartDebugSessionEvent(event: BrightScriptLaunchConfiguration & { preLaunchTask: string }) {
        this.reporter.sendTelemetryEvent('startDebugSession', {
            enableDebugProtocol: boolToString(event.enableDebugProtocol),
            retainDeploymentArchive: boolToString(event.retainDeploymentArchive),
            retainStagingFolder: boolToString(event.retainStagingFolder),
            injectRaleTrackerTask: boolToString(event.injectRaleTrackerTask),
            isFilesDefined: isDefined(event.files),
            isPreLaunchTaskDefined: isDefined(event.preLaunchTask),
            isComponentLibrariesDefined: isDefined(event.componentLibraries),
            isDeepLinkUrlDefined: isDefined(event.deepLinkUrl),
            isStagingFolderPathDefined: isDefined(event.stagingFolderPath)
        });
    }

    /**
     * Track when remoteControlMode has been enabled or disabled (we don't track WHAT users send, only that they're enabling/disabling the feature)
     * @param enabled is the remoteControlMode being enabled or disabled
     * @param initiator who triggered this event. 'statusbar' is when the user clicks the "toggle remote mode" in the statusbar.
     *                  "command" is when it's triggered directly from a vscode command
     */
    public sendSetRemoteControlModeEvent(isEnabled: boolean, initiator: RemoteControlModeInitiator) {
        // this.reporter.sendTelemetryEvent('setRemoteControlMode', {
        //     isEnabled: boolToString(isEnabled),
        //     initiator: initiator
        // });
    }

    private reporter: TelemetryReporter;
}

function boolToString(value: boolean | undefined) {
    return value?.toString() ?? 'undefined';
}

function isDefined(value: any) {
    return value ? 'true' : 'false';
}
