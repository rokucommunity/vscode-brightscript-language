import type { LaunchSource } from './launchConfigs';

/** The VS Code operations the tools need, kept behind one interface so tool logic stays testable. */
export interface DebugMcpHost {
    getWorkspaceFolders(): Array<{ name: string; path: string }>;
    getLaunchSources(): LaunchSource[];
    /** Starts a configuration by name, or an explicit configuration object, in the folder at `folderPath` (or the workspace when omitted). Resolves true once VS Code started it. */
    startDebugging(folderPath: string | undefined, nameOrConfiguration: string | Record<string, unknown>): Promise<boolean>;
    stopDebugging(session: unknown): Promise<void>;
    /** Shows a modal prompt; true only when the user allowed it. */
    confirm(message: string, detail?: string): Promise<boolean>;
    getSetting(name: DebugMcpSetting): boolean;
    fileExists(filePath: string): boolean;
    findFilesBySuffix(relativePath: string): Promise<string[]>;
    listBreakpoints(): HostBreakpoint[];
    addBreakpoints(requests: HostBreakpointRequest[]): HostBreakpoint[];
    removeBreakpoints(ids: string[]): void;
    /** The thread or frame selected in VS Code's Call Stack, when the running VS Code exposes it. */
    getFocusedStackItem(): FocusedStackItem | undefined;
    /** Runs a VS Code debug command on one thread, so VS Code itself sends the request and updates its UI. `threadId` uses VS Code's `thread:<sessionId>:<threadId>` form. */
    executeCommand(command: string, target: { sessionId: string; threadId: string }): Promise<void>;
}

export type DebugMcpSetting = 'confirmLaunch' | 'confirmEvaluate';

export interface HostBreakpoint {
    id: string;
    file: string;
    /** 1-based. */
    line: number;
    /** 1-based. */
    column?: number;
    enabled: boolean;
    condition?: string;
    hitCondition?: string;
    logMessage?: string;
}

export interface HostBreakpointRequest {
    file: string;
    line: number;
    column?: number;
    condition?: string;
    hitCondition?: string;
    logMessage?: string;
}

export interface FocusedStackItem {
    sessionId: string;
    threadId?: number;
    frameId?: number;
}
