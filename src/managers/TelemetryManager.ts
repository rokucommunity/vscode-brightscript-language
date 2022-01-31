import TelemetryReporter from "@vscode/extension-telemetry";
import type { Disposable } from "vscode";
import { BrightScriptLaunchConfiguration } from "../DebugConfigurationProvider";

const APP_INSIGHTS_KEY = '8618f206-4732-4729-88ed-d07dcf17f199';

export class TelemetryManager implements Disposable {
    public constructor(
        public options: {
            extensionId: string,
            extensionVersion: string,
            applicationInsightsKey?: string
        }
    ) {
        this.reporter = new TelemetryReporter(this.options.extensionId, this.options.extensionVersion, this.options.applicationInsightsKey ?? APP_INSIGHTS_KEY);
    }

    dispose() {
        return this.reporter.dispose();
    }

    /**
     * The extension has first started up
     */
    public sendStartupEvent() {
        this.reporter.sendTelemetryEvent('startup');
    }

    public sendStartDebugSessionEvent(event: BrightScriptLaunchConfiguration & { preLaunchTask: string }) {
        this.reporter.sendTelemetryEvent('startDebugSession', {
            enableDebugProtocol: event.enableDebugProtocol?.toString(),
            retainDeploymentArchive: event.retainDeploymentArchive?.toString(),
            retainStagingFolder: event.retainStagingFolder?.toString(),
            isFilesDefined: event.files ? 'true' : 'false',
            isPreLaunchTaskDefined: event.preLaunchTask ? 'true' : 'false',
            isComponentLibrariesDefined: event.componentLibraries ? 'true' : 'false',
            isDeepLinkUrlDefined: event.deepLinkUrl ? 'true' : 'false',
            injectRaleTrackerTask: event.injectRaleTrackerTask?.toString(),
            isStagingFolderPathDefined: event.stagingFolderPath ? 'true' : 'false'
        });
    }

    private reporter: TelemetryReporter;
}
