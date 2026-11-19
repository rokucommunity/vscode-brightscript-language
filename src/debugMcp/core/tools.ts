import type { DebugMcpTool } from './DebugMcpServer';
import { createBreakpointTools } from './breakpointTools';
import { createExecutionTools } from './executionTools';
import { createInspectionTools } from './inspectionTools';
import { createLifecycleTools } from './lifecycleTools';
import { createStatusTools } from './statusTools';
import type { DebugMcpToolContext } from './toolSupport';

/** The core tools followed by the tools of every registered tool provider. A tool whose name is already taken is dropped and logged. */
export function createDebugMcpTools(context: DebugMcpToolContext): DebugMcpTool[] {
    const providerTools = context.registry.createProviderTools(context);
    //hoisted so the status tool can list provider tools once they are vetted
    let acceptedProviderTools: DebugMcpTool[] = [];
    const coreTools = [
        ...createStatusTools(context, () => acceptedProviderTools),
        ...createLifecycleTools(context),
        ...createBreakpointTools(context),
        ...createInspectionTools(context),
        ...createExecutionTools(context)
    ];
    const names = new Set(coreTools.map((tool) => tool.name));
    acceptedProviderTools = providerTools.filter((tool) => {
        if (names.has(tool.name)) {
            context.registry.logError(`debug MCP tool '${tool.name}' is defined more than once; keeping the first definition`);
            return false;
        }
        names.add(tool.name);
        return true;
    });
    return [...coreTools, ...acceptedProviderTools];
}
