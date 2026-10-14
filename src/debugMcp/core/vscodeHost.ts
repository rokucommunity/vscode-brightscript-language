import * as fs from 'fs';
import * as vscode from 'vscode';
import type { DebugMcpHost, DebugMcpSetting, FocusedStackItem, HostBreakpoint, HostBreakpointRequest } from './host';
import { buildLaunchSources } from './launchConfigs';

const SEARCH_EXCLUDE = '**/{node_modules,.git,out,dist}/**';
const MAX_SEARCH_RESULTS = 20;

/** `settingsSection` is the configuration section holding the `confirmLaunch` and `confirmEvaluate` settings. */
export function createVscodeHost(options: { settingsSection: string }): DebugMcpHost {
    return {
        getWorkspaceFolders: () => (vscode.workspace.workspaceFolders ?? []).map((folder) => ({ name: folder.name, path: folder.uri.fsPath })),

        getLaunchSources: () => {
            const workspaceLaunch = vscode.workspace.getConfiguration('launch');
            return buildLaunchSources({
                folders: (vscode.workspace.workspaceFolders ?? []).map((folder) => {
                    const launch = vscode.workspace.getConfiguration('launch', folder.uri);
                    return {
                        name: folder.name,
                        path: folder.uri.fsPath,
                        configurations: launch.inspect<any[]>('configurations'),
                        compounds: launch.inspect<any[]>('compounds')
                    };
                }),
                workspace: { configurations: workspaceLaunch.inspect<any[]>('configurations'), compounds: workspaceLaunch.inspect<any[]>('compounds') },
                hasWorkspaceFile: !!vscode.workspace.workspaceFile
            });
        },

        startDebugging: async (folderPath, nameOrConfiguration) => {
            const folder = folderPath ? vscode.workspace.workspaceFolders?.find((candidate) => candidate.uri.fsPath === folderPath) : undefined;
            return vscode.debug.startDebugging(folder, nameOrConfiguration as any);
        },

        stopDebugging: async (session) => {
            await vscode.debug.stopDebugging(session as vscode.DebugSession);
        },

        confirm: async (message, detail) => {
            const choice = await vscode.window.showWarningMessage(message, { modal: true, detail: detail }, 'Allow');
            return choice === 'Allow';
        },

        getSetting: (name: DebugMcpSetting) => vscode.workspace.getConfiguration(options.settingsSection).get<boolean>(name, false),

        fileExists: (filePath) => fs.existsSync(filePath),

        findFilesBySuffix: async (relativePath) => {
            const uris = await vscode.workspace.findFiles(`**/${relativePath}`, SEARCH_EXCLUDE, MAX_SEARCH_RESULTS);
            return uris.map((uri) => uri.fsPath);
        },

        listBreakpoints: () => vscode.debug.breakpoints
            .filter((breakpoint): breakpoint is vscode.SourceBreakpoint => breakpoint instanceof vscode.SourceBreakpoint)
            .map((breakpoint) => describeBreakpoint(breakpoint)),

        addBreakpoints: (requests: HostBreakpointRequest[]) => {
            const created = requests.map((request) => new vscode.SourceBreakpoint(
                new vscode.Location(vscode.Uri.file(request.file), new vscode.Position(request.line - 1, request.column ? request.column - 1 : 0)),
                true,
                request.condition,
                request.hitCondition,
                request.logMessage
            ));
            vscode.debug.addBreakpoints(created);
            return created.map((breakpoint) => describeBreakpoint(breakpoint));
        },

        removeBreakpoints: (ids) => {
            const idSet = new Set(ids);
            vscode.debug.removeBreakpoints(vscode.debug.breakpoints.filter((breakpoint) => idSet.has(breakpoint.id)));
        },

        executeCommand: async (command, target) => {
            //debug commands take (ignored, { sessionId, threadId }) and otherwise fall back to VS Code's own focus
            await vscode.commands.executeCommand(command, undefined, target);
        },

        getFocusedStackItem: (): FocusedStackItem | undefined => {
            //activeStackItem needs VS Code 1.90; engines allows older versions
            const item = (vscode.debug as any).activeStackItem;
            if (!item?.session) {
                return undefined;
            }
            return { sessionId: item.session.id, threadId: item.threadId, frameId: item.frameId };
        }
    };
}

function describeBreakpoint(breakpoint: vscode.SourceBreakpoint): HostBreakpoint {
    const position = breakpoint.location.range.start;
    return {
        id: breakpoint.id,
        file: breakpoint.location.uri.fsPath,
        line: position.line + 1,
        column: position.character > 0 ? position.character + 1 : undefined,
        enabled: breakpoint.enabled,
        condition: breakpoint.condition,
        hitCondition: breakpoint.hitCondition,
        logMessage: breakpoint.logMessage
    };
}
