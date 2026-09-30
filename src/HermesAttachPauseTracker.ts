import type * as vscode from 'vscode';

/**
 * Tracks the js-debug (pwa-node) child session attached to Hermes and resumes the pauses Hermes
 * makes on its own when a debugger connects, so the user doesn't have to manually continue.
 *
 * Two pauses are continued:
 *  - a pause with no source-backed stack frames (Hermes paused outside any script)
 *  - the session's FIRST stop when js-debug reports it as `step`. That is js-debug's own pause before
 *    the bundle's first statement runs (it loads the source maps there). With `inspect=1` it lands on
 *    the bundle's first line, and left paused the whole app - including the BrightScript debug port -
 *    waits on it. A real step can't be the first stop, since the user can only step once paused.
 *
 * Note Hermes doesn't report which breakpoint was hit, so js-debug labels the user's own breakpoints
 * `pause` ("Paused on debugger statement"): `pause` can never be used to recognize an attach pause.
 * Each stop is reported (reason, top frame) to the output channel for diagnosing device behavior.
 *
 * Only created when the session should not stop on entry (`continueOnAttach: true`).
 *
 * @param log verbose wire-level logging (off by default)
 * @param report one line per stop and per auto-continue, for the user-visible output channel
 */
export function createHermesAttachPauseTracker(session: vscode.DebugSession, log: (cb: () => any[]) => void = () => { }, report: (line: string) => void = () => { }): vscode.DebugAdapterTracker {
    let threadId: number | undefined;
    let hasValidStackForCurrentStop = false;
    let stopCount = 0;
    //whether the top frame of the current stop has been reported yet (VS Code may request the stack more than once per stop)
    let reportedCurrentStack = false;
    //true while the current stop is js-debug's script-entry pause and hasn't been continued yet
    let continueCurrentStop = false;

    const continueThread = (why: string) => {
        log(() => [`Automatically continuing ${why} after attach with Hermes session...`]);
        report(`auto-continued ${why}`);
        void session.customRequest('continue', { threadId: threadId });
    };

    return {
        onDidSendMessage: (message) => {
            log(() => [message.type, message.type === 'response' ? message.command : message.event, JSON.stringify(message)]);

            if (message.type === 'event' && message.event === 'stopped') {
                // Save the last threadId so we can continue it after attach. Hermes doesn't include the threadId in the stackTrace response.
                // Only update if the event body actually has a threadId — some Hermes attach pauses omit it.
                if (message.body.threadId !== undefined) {
                    threadId = message.body.threadId;
                }
                hasValidStackForCurrentStop = false;
                reportedCurrentStack = false;
                stopCount++;
                log(() => [`stopped event: reason=${message.body.reason} threadId=${threadId} (from event body: ${message.body.threadId})`]);
                report(`stop #${stopCount}: reason='${message.body.reason}' description='${message.body.description ?? ''}' threadId=${message.body.threadId ?? '(none)'}`);
                continueCurrentStop = stopCount === 1 && message.body.reason === 'step';
                if (continueCurrentStop && threadId !== undefined) {
                    continueCurrentStop = false;
                    continueThread('script-entry pause');
                }
            }

            // Fallback: if the stopped event had no threadId, grab it from the threads response (which always precedes the stackTrace request)
            if (threadId === undefined && message.type === 'response' && message.command === 'threads' && message.body.threads?.length > 0) {
                threadId = message.body.threads[0].id;
                log(() => [`set threadId from threads response fallback: ${threadId}`]);
            }

            // Automatically continue after attach if Hermes session is paused with no stack frames. These seem to be auto pauses that happen on attach.
            // VS Code may make multiple stackTrace requests per stop; once a valid (non-empty) stack is seen, don't auto-continue on a subsequent empty one.
            if (threadId !== undefined && message.type === 'response' && message.command === 'stackTrace') {
                const frames = message.body.stackFrames ?? [];
                log(() => [`stackTrace: ${frames.length} frames`, ...frames.map((f: any) => `${f.source?.path ?? f.source?.name ?? '(no source)'}:${f.line}`)]);
                if (!reportedCurrentStack) {
                    reportedCurrentStack = true;
                    const top = frames.find((f: any) => f.source?.path) ?? frames[0];
                    report(`stop #${stopCount} stack: ${frames.length} frame(s), top: ${top ? `${top.source?.path ?? top.source?.name ?? '(no source)'}:${top.line}` : '(none)'}`);
                }
                if (continueCurrentStop) {
                    //the script-entry pause arrived without a threadId; now that we have one, continue it
                    continueCurrentStop = false;
                    continueThread('script-entry pause');
                } else if (frames.some((f: any) => f.source?.path)) {
                    // At least one frame has a real source file — this is a valid user-code stop
                    hasValidStackForCurrentStop = true;
                } else if (!hasValidStackForCurrentStop) {
                    continueThread('empty-stack pause');
                }
            }
        }
    };
}
