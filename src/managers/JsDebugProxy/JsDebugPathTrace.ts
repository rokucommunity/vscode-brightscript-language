import * as vscode from 'vscode';
import * as path from 'path';
import * as fsExtra from 'fs-extra';

/**
 * `brightscript.debug.jsPathTrace` diagnostics for the TS/JS (Hermes) attach flow. Every bug in
 * that flow has been diagnosed from two complementary views: this class's DAP-level log (which
 * paths js-debug reported to vscode) and js-debug's own wire log (which raw CDP script urls and
 * sourcemap decisions produced those paths) - `getJsDebugTraceConfig()` wires up the latter.
 *
 * All logging is gated on the `jsPathTrace` setting being read FRESH on every call, not cached at
 * `register()` time, so toggling it mid-session (or between attach attempts of the same session)
 * takes effect immediately without requiring a new debug session.
 */
export class JsDebugPathTrace {
    constructor(
        private log: (message: string) => void
    ) {
    }

    /**
     * Registers the DAP-tracker factory for the JS session type js-debug uses (`pwa-node`). Only
     * taps the Hermes child session (marked `_isBrightscriptJsSession` on its parent's
     * configuration by `attachJsDebugger`) - not the pwa-node process-tree sessions js-debug may
     * spawn for unrelated child processes.
     */
    public register(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            vscode.debug.registerDebugAdapterTrackerFactory('pwa-node', {
                createDebugAdapterTracker: (session) => this.createTracker(session)
            })
        );
    }

    /**
     * The js-debug `trace` config value for the attach config, or `undefined` when tracing is
     * disabled. `workspaceRootDir` is where the `logs/` folder is created (the workspace folder,
     * falling back to the bundle's rootDir when there is no open workspace folder).
     */
    public getJsDebugTraceConfig(workspaceRootDir: string): JsDebugTraceConfig | undefined {
        if (!this.isEnabled()) {
            return undefined;
        }
        try {
            const logDir = path.join(workspaceRootDir, 'logs');
            fsExtra.ensureDirSync(logDir);
            return {
                logFile: path.join(logDir, `js-debug-trace-${Date.now()}.json`)
            };
        } catch (e) {
            this.log(`[jsPathTrace] Failed to set up jsPathTrace logging: ${e?.message ?? e}`);
            return undefined;
        }
    }

    /**
     * Logs the derivation the attach flow used to build its debug config, plus (when tracing is
     * enabled) where js-debug's own wire log landed and what to grep it for. No-ops when tracing
     * is disabled.
     */
    public logStartupSummary(summary: JsDebugStartupSummary): void {
        if (!this.isEnabled()) {
            return;
        }
        try {
            const lines = [
                `[jsPathTrace] platform            = ${summary.platform}`,
                `[jsPathTrace] tsPath (pkg:stripped)= ${JSON.stringify(summary.tsPath)}`,
                `[jsPathTrace] remoteRoot           = ${JSON.stringify(summary.remoteRoot)}`,
                `[jsPathTrace] localRoot            = ${JSON.stringify(summary.localRoot)}`,
                `[jsPathTrace] outFiles             = ${JSON.stringify(summary.outFiles)}`
            ];
            if (summary.jsDebugTraceFile) {
                lines.push(
                    `[jsPathTrace] js-debug wire log    = ${summary.jsDebugTraceFile}`,
                    `[jsPathTrace]   grep it for 'setBreakpointByUrl' (expect THREE slashes: file:///${summary.remoteRoot.replace(/^\//, '')}/...)`,
                    `[jsPathTrace]   and for 'runtime.sourcecreate' (expect a drive-lettered absolutePath, not /examples/...)`
                );
            }
            this.log(lines.join('\n'));
        } catch (e) {
            this.log(`[jsPathTrace] Failed to log startup summary: ${e?.message ?? e}`);
        }
    }

    private isEnabled(): boolean {
        return vscode.workspace.getConfiguration('brightscript.debug').get<boolean>('jsPathTrace') === true;
    }

    private logJsPath(...parts: string[]): void {
        if (this.isEnabled()) {
            this.log(`[jsPathTrace] ${parts.join(' ')}`);
        }
    }

    private createTracker(session: vscode.DebugSession): vscode.DebugAdapterTracker | undefined {
        if (!session.parentSession?.configuration?._isBrightscriptJsSession) {
            return undefined;
        }

        return {
            onWillReceiveMessage: (message: any) => this.onWillReceiveMessage(message),
            onDidSendMessage: (message: any) => this.onDidSendMessage(message)
        };
    }

    /** requests vscode sends TO js-debug. A `source` request is the smoking gun for a
     * path-resolution failure: vscode only asks the adapter for file CONTENT when it could not
     * resolve the frame's path to a local file on disk. */
    private onWillReceiveMessage(message: any): void {
        if (message.type === 'request' && message.command === 'setBreakpoints') {
            this.logJsPath('REQ setBreakpoints ->', JSON.stringify(message.arguments?.source), `lines=${JSON.stringify(message.arguments?.lines)}`);
        }
        if (message.type === 'request' && message.command === 'source') {
            this.logJsPath('REQ source ->', JSON.stringify(message.arguments?.source ?? message.arguments));
        }
    }

    private onDidSendMessage(message: any): void {
        //THE answer to "did my breakpoint bind?" - an unverified breakpoint usually carries a
        //`message` saying why.
        if (message.type === 'response' && message.command === 'setBreakpoints') {
            this.logJsPath('RES setBreakpoints', JSON.stringify((message.body?.breakpoints ?? []).map((b: any) => ({ verified: b.verified, line: b.line, path: b.source?.path, message: b.message }))));
        }
        //the paths js-debug resolved for each script/source - a driveless path here is what
        //makes vscode open a phantom duplicate tab
        if (message.type === 'event' && message.event === 'loadedSource') {
            const src = message.body?.source;
            this.logJsPath(`EVT loadedSource[${message.body?.reason}]`, `name=${JSON.stringify(src?.name)}`, `path=${JSON.stringify(src?.path)}`);
        }
        if (message.type === 'response' && message.command === 'source' && message.success === false) {
            this.logJsPath('RES source FAILED', JSON.stringify(message.message ?? message.body));
        }
        //which file the stop actually landed in (and whether its path has a drive letter)
        if (message.type === 'response' && message.command === 'stackTrace') {
            const frames = message.body?.stackFrames ?? [];
            this.logJsPath(`RES stackTrace (${frames.length} frames)`, JSON.stringify(frames.slice(0, 5).map((f: any) => ({ name: f.name, line: f.line, path: f.source?.path }))));
        }
    }
}

// ---- types ----

export interface JsDebugTraceConfig {
    logFile: string;
}

export interface JsDebugStartupSummary {
    platform: string;
    tsPath: string;
    remoteRoot: string;
    localRoot: string;
    outFiles: string[];
    /** The path js-debug will write its own wire log to, when tracing is enabled. */
    jsDebugTraceFile?: string;
}
