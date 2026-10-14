import type { FocusedStackItem } from './host';

export const UI_COMMANDS: Record<ExecutionCommand, string> = {
    continue: 'workbench.action.debug.continue',
    next: 'workbench.action.debug.stepOver',
    stepIn: 'workbench.action.debug.stepInto',
    stepOut: 'workbench.action.debug.stepOut',
    pause: 'workbench.action.debug.pause'
};

export const UI_NOTE = 'This thread is not the one focused in VS Code, so its Debug UI may keep showing the previous pause until the next stop.';
export const UI_COMMAND_FALLBACK_NOTE = 'VS Code did not send the request, so the request was sent directly and its Debug UI may keep showing the previous pause until the next stop.';
/** How long a VS Code command may take to produce the debug request before the request is sent directly. */
export const UI_COMMAND_REQUEST_WAIT_MS = 1000;

/**
 * Chooses how to run an execution command. VS Code only updates its UI for requests it sends
 * itself, so the matching VS Code command is used when the stack item the user has focused is
 * exactly the target session and thread. Anything else (including no focused item) goes
 * straight to the adapter.
 */
export function chooseExecutionPath(input: {
    sessionId: string;
    threadId: number;
    focused: FocusedStackItem | undefined;
}): 'ui-command' | 'request' {
    const focused = input.focused;
    return focused && focused.sessionId === input.sessionId && focused.threadId === input.threadId ? 'ui-command' : 'request';
}

/** The identifier VS Code's debug commands accept to act on one thread, matching `Thread.getId()`. */
export function toThreadCommandTarget(sessionId: string, threadId: number): { sessionId: string; threadId: string } {
    return { sessionId: sessionId, threadId: `thread:${sessionId}:${threadId}` };
}

export type ExecutionCommand = 'continue' | 'next' | 'stepIn' | 'stepOut' | 'pause';
