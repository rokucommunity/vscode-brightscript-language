import TelemetryReporter from "@vscode/extension-telemetry";
import { Disposable, ExtensionContext } from "vscode";

export class AnalyticsManager implements Disposable {
    public constructor(
        public extensionId: string,
        public extensionVersion: string,
        public applicationInsightsKey = '8618f206-4732-4729-88ed-d07dcf17f199'
    ) {
        this.reporter = new TelemetryReporter(extensionId, extensionVersion, applicationInsightsKey);
    }

    dispose() {
        return this.reporter.dispose();
    }

    public sendExtensionStartupEvent() {
        this.reporter.sendRawTelemetryEvent(
            'extension-startup',
            {
                extensionId: this.extensionId,
                extensionVersion: this.extensionVersion
            }
        );
        //this.reporter.sendRawTelemetryEvent('extension-startup', { 'stringProp': 'some string' }, { 'numericMeasure': 123 });

        return this.reporter.dispose();
    }

    private reporter: TelemetryReporter;
}