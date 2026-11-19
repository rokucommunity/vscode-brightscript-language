/**
 * Identity of a VS Code window that survives Reload Window and extension host restarts (the
 * pid does not). A multi-root workspace is identified by its workspace file, otherwise by its
 * sorted folder paths. A window with no folder has nothing durable to key on, so it falls back
 * to its pid and is reported as unstable. The editor's URI scheme (vscode, vscode-insiders,
 * cursor, ...) prefixes the id so the same folder open in two editors stays distinguishable.
 */
export function deriveWindowId(input: WindowIdInput): WindowIdentity {
    const prefix = input.uriScheme ? `${input.uriScheme}:` : '';
    if (input.workspaceFile) {
        return { windowId: prefix + input.workspaceFile, stable: true };
    }
    if (input.workspaceFolders.length > 0) {
        return { windowId: prefix + [...input.workspaceFolders].sort().join('|'), stable: true };
    }
    return { windowId: `pid:${input.pid}`, stable: false };
}

export interface WindowIdInput {
    /** Path of the opened `.code-workspace` file, when the window has one. */
    workspaceFile?: string;
    workspaceFolders: string[];
    /** `vscode.env.uriScheme`. */
    uriScheme?: string;
    pid: number;
}

export interface WindowIdentity {
    windowId: string;
    /** False when the id is the pid, which changes whenever the extension host restarts. */
    stable: boolean;
}
