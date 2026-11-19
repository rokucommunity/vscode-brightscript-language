import type { DebugMcpTool, ToolNeeds } from './DebugMcpServer';
import { describeGroup } from './toolSupport';
import type { DebugMcpToolContext } from './toolSupport';

/** `providerTools` are listed in the tool summary by what they need. */
export function createStatusTools(context: DebugMcpToolContext, providerTools: () => DebugMcpTool[] = () => []): DebugMcpTool[] {
    const providerToolNames = (needs: ToolNeeds) => providerTools().filter((tool) => (tool.needs ?? 'session') === needs).map((tool) => tool.name);
    return [
        {
            name: 'get_status',
            description: 'Reports the connected VS Code window (name and workspace folders), the debugger extension version, whether a debug session is active, and which tools need what. Call this first. list_windows and select_window come from the bridge; the rest of the tool list is fixed, so no tools appear or disappear when a session starts. Use list_launch_configs and start_debugging to begin.',
            inputSchema: { type: 'object', properties: {} },
            handler: () => ({
                windowName: context.getWindowName?.() ?? null,
                workspaceFolders: context.getWorkspaceFolders(),
                extensionVersion: context.extensionVersion,
                debugSessionActive: context.sessions.groups.length > 0,
                tools: {
                    note: 'list_windows and select_window come from the bridge; otherwise this tool list is fixed and no tools appear later. Tools differ only in what state they need.',
                    needsOnlyVsCodeWindow: ['get_status', 'list_launch_configs', 'start_debugging', 'list_breakpoints', 'set_breakpoints', 'remove_breakpoints', 'list_debug_sessions', ...providerToolNames('window')],
                    needsActiveSession: ['stop_debugging', 'restart_debugging', 'get_debug_state', 'wait_for_stop', 'pause', 'get_debug_output', ...providerToolNames('session')],
                    needsPausedRuntime: ['get_stack_trace', 'get_variables', 'evaluate', 'continue', 'step_over', 'step_into', 'step_out', ...providerToolNames('pausedRuntime')]
                }
            })
        },
        {
            name: 'list_debug_sessions',
            description: 'Lists the live debug sessions in groups. Each group is one launch: a primary session plus the sessions attached to it, each with the runtime it debugs (null when it only belongs to the group). Also identifies the active group.',
            inputSchema: { type: 'object', properties: {} },
            handler: () => {
                const activeGroup = context.sessions.activeGroup;
                return {
                    groups: context.sessions.groups.map((group) => describeGroup(group)),
                    activeGroupId: activeGroup?.id ?? null
                };
            }
        }
    ];
}
