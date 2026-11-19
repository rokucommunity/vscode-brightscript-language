import type * as vscode from 'vscode';
import type { StackFrameInfo } from './dapClient';
import type { DapSession } from './dapClient';
import type { DebugMcpTool } from './DebugMcpServer';
import type { DebugMcpToolContext } from './toolSupport';

/**
 * What the debug MCP core knows about a debug type. An integration groups the sessions of one
 * launch, names their runtimes, and may refine which stops are reported and which runtime
 * owns a file. Sessions no integration claims get one group per session.
 */
export const DEBUG_MCP_API_VERSION = 1;
const DEFAULT_STOP_HOOK_TIMEOUT_MS = 3000;

export interface DebugIntegration {
    apiVersion: typeof DEBUG_MCP_API_VERSION;
    id: string;
    /** Debug types this integration sees. Sessions of other types never reach `classifySession`. Omit to see every session. */
    debugTypes?: string[];
    /** The runtimes a group can have. The first is the primary runtime: the one of the session that owns the group. */
    runtimes: RuntimeDescriptor[];
    /** Places a session in a group, or returns undefined when it does not belong to this integration. */
    classifySession(session: DebugSessionInfo): SessionClassification | undefined;
    /** Decides whether a `stopped` event is reported to agents. Without it every stop is reported. */
    shouldReportStop?(context: StopReportContext): StopReportDecision | Promise<StopReportDecision>;
    /** The runtime id whose adapter alone verifies breakpoints in this file, or undefined for files any runtime may handle. */
    ownsFile?(filePath: string): string | undefined;
    /** Launch configuration keys an agent may override in `start_debugging`, with the type each value must have. */
    launchOverrides?: Record<string, 'string' | 'boolean' | 'number'>;
    /** Launch configuration keys `list_launch_configs` reports for configurations. */
    launchConfigFields?: string[];
}

export interface RuntimeDescriptor {
    id: string;
    /** Completes the sentence `"<id>" is ...` in tool descriptions. */
    description: string;
}

export interface SessionClassification {
    /** Id of the session that owns the group; that session is the group's primary session. */
    groupId: string;
    /** Absent for a session that belongs to the group without being a debuggable runtime of its own. */
    runtime?: string;
}

export interface StopReportContext {
    session: DebugSessionInfo;
    runtime: string;
    groupId: string;
    /** Body of the DAP `stopped` event. */
    stop: Record<string, any>;
    /** Reads the stack of the stopped thread (the first thread when the event names none). */
    fetchStack(): Promise<{ threadId?: number; frames: StackFrameInfo[] }>;
}

/** `true` reports the stop, `false` hides it, `'entry'` reports it with reason "entry". */
export type StopReportDecision = boolean | 'entry';

export interface ToolProvider {
    apiVersion: typeof DEBUG_MCP_API_VERSION;
    id: string;
    tools: (context: DebugMcpToolContext) => DebugMcpTool[];
}

/** The part of `vscode.DebugSession` the core reads. */
export interface DebugSessionInfo extends DapSession {
    id: string;
    type: string;
    configuration?: Record<string, any>;
    parentSession?: DebugSessionInfo;
}

export interface ClassifiedSession extends SessionClassification {
    integration: DebugIntegration;
}

/**
 * Where integrations and tool providers register. Everything that is specific to a debug type
 * plugs in here; the core reads only this registry.
 */
export class DebugMcpRegistry {
    constructor(
        private readonly options: DebugMcpRegistryOptions = {}
    ) { }

    private integrations: DebugIntegration[] = [];
    private toolProviders: ToolProvider[] = [];

    public registerDebugIntegration(integration: DebugIntegration): vscode.Disposable {
        this.checkApiVersion(integration.apiVersion, `debug integration '${integration.id}'`);
        if (this.integrations.some((existing) => existing.id === integration.id)) {
            throw new Error(`A debug integration with id '${integration.id}' is already registered.`);
        }
        if (integration.runtimes.length === 0) {
            throw new Error(`Debug integration '${integration.id}' must declare at least one runtime.`);
        }
        this.integrations.push(integration);
        return { dispose: () => this.removeFrom(this.integrations, integration) };
    }

    public registerToolProvider(provider: ToolProvider): vscode.Disposable {
        this.checkApiVersion(provider.apiVersion, `tool provider '${provider.id}'`);
        if (this.toolProviders.some((existing) => existing.id === provider.id)) {
            throw new Error(`A tool provider with id '${provider.id}' is already registered.`);
        }
        this.toolProviders.push(provider);
        return { dispose: () => this.removeFrom(this.toolProviders, provider) };
    }

    /**
     * Classifies a session with the first integration that claims it. A session of a type that
     * integrations claim but none classifies belongs to no group, and so does every session of
     * an unclaimed type unless `enableDefaultIntegration` is set. A throwing integration is
     * logged and treated as not claiming the session.
     */
    public classify(session: DebugSessionInfo): ClassifiedSession | undefined {
        for (const integration of this.integrations) {
            if (integration.debugTypes && !integration.debugTypes.includes(session.type)) {
                continue;
            }
            const classification = this.guard(integration, 'classifySession', () => integration.classifySession(session), undefined);
            if (classification?.groupId) {
                return { ...classification, integration: integration };
            }
        }
        if (!this.options.enableDefaultIntegration || this.integrations.some((integration) => integration.debugTypes?.includes(session.type))) {
            return undefined;
        }
        return createDefaultClassification(session);
    }

    /**
     * Judges a stop with the integration's hook. A failing hook, or an asynchronous one that has
     * not answered within the timeout, reports the stop.
     */
    public judgeStop(integration: DebugIntegration, context: StopReportContext): StopReportDecision | Promise<StopReportDecision> {
        const decision = this.guard(integration, 'shouldReportStop', () => integration.shouldReportStop(context), true);
        if (typeof decision !== 'object') {
            return decision;
        }
        return new Promise<StopReportDecision>((resolve) => {
            const timer = setTimeout(() => {
                this.logError(`debug integration '${integration.id}': shouldReportStop did not answer in time; reporting the stop`);
                resolve(true);
            }, this.options.stopHookTimeoutMs ?? DEFAULT_STOP_HOOK_TIMEOUT_MS);
            void decision.then(resolve, (error) => {
                this.logError(`debug integration '${integration.id}': shouldReportStop failed: ${(error as Error)?.message}`);
                resolve(true);
            }).finally(() => clearTimeout(timer));
        });
    }

    /** The runtimes declared by registered integrations, without duplicates. */
    public getDeclaredRuntimes(): RuntimeDescriptor[] {
        const runtimes = new Map<string, RuntimeDescriptor>();
        for (const integration of this.integrations) {
            for (const runtime of integration.runtimes) {
                if (!runtimes.has(runtime.id)) {
                    runtimes.set(runtime.id, runtime);
                }
            }
        }
        return [...runtimes.values()];
    }

    /** The runtime that alone verifies breakpoints in `filePath`, as reported by the first integration that owns it. A throwing integration is logged and gives no answer. */
    public ownsFile(filePath: string): string | undefined {
        for (const integration of this.integrations) {
            const runtime = integration.ownsFile ? this.guard(integration, 'ownsFile', () => integration.ownsFile(filePath), undefined) : undefined;
            if (runtime) {
                return runtime;
            }
        }
        return undefined;
    }

    /** Launch overrides allowed by the registered integrations. */
    public getLaunchOverrides(): Record<string, 'string' | 'boolean' | 'number'> {
        return Object.assign({}, ...this.integrations.map((integration) => integration.launchOverrides ?? {}));
    }

    public getLaunchConfigFields(): string[] {
        return [...new Set(this.integrations.flatMap((integration) => integration.launchConfigFields ?? []))];
    }

    public logError(message: string): void {
        this.options.log?.(message);
    }

    public createProviderTools(context: DebugMcpToolContext): DebugMcpTool[] {
        return this.toolProviders.flatMap((provider) => provider.tools(context));
    }

    private checkApiVersion(apiVersion: number, description: string): void {
        if (apiVersion !== DEBUG_MCP_API_VERSION) {
            throw new Error(`The ${description} uses API version ${apiVersion}; this debugger supports version ${DEBUG_MCP_API_VERSION}.`);
        }
    }

    private guard<T>(integration: DebugIntegration, hook: string, action: () => T, fallback: T): T {
        try {
            return action();
        } catch (error) {
            this.logError(`debug integration '${integration.id}': ${hook} failed: ${(error as Error)?.message}`);
            return fallback;
        }
    }

    private removeFrom<T>(items: T[], item: T): void {
        const index = items.indexOf(item);
        if (index >= 0) {
            items.splice(index, 1);
        }
    }
}

/** One group per launch: sessions are grouped under the root of their parent chain, with their debug type as runtime. */
function createDefaultClassification(session: DebugSessionInfo): ClassifiedSession {
    let root = session;
    while (root.parentSession) {
        root = root.parentSession;
    }
    return {
        groupId: root.id,
        runtime: session.type,
        integration: {
            apiVersion: DEBUG_MCP_API_VERSION,
            id: 'default',
            runtimes: [{ id: root.type, description: `the ${root.type} debug session` }],
            classifySession: () => undefined
        }
    };
}

export interface DebugMcpRegistryOptions {
    log?: (message: string) => void;
    /** Group and track sessions of types no integration claims, one group per launch. Off by default. */
    enableDefaultIntegration?: boolean;
    /** How long an asynchronous `shouldReportStop` may take before the stop is reported. Default 3000. */
    stopHookTimeoutMs?: number;
}
