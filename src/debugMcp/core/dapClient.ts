export const MAX_VALUE_LENGTH = 500;
export const DAP_REQUEST_TIMEOUT_MS = 10000;
const MAX_VARIABLE_NODES = 300;

/** Rejects with `message` when `promise` has not settled within `timeoutMs`. */
export async function withTimeout<T>(promise: Promise<T>, message: string, timeoutMs = DAP_REQUEST_TIMEOUT_MS): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    try {
        return await Promise.race([promise, timeout]);
    } finally {
        clearTimeout(timer);
    }
}

/** `session.customRequest` that rejects instead of hanging when the adapter never answers. */
export function sendDapRequest(session: DapSession, command: string, args?: any, timeoutMs = DAP_REQUEST_TIMEOUT_MS): Promise<any> {
    return withTimeout(Promise.resolve(session.customRequest(command, args)), `The debug adapter did not answer '${command}' within ${timeoutMs / 1000}s`, timeoutMs);
}

/** Fetches up to `levels` frames of `threadId`'s stack. */
export async function fetchStackFrames(session: DapSession, threadId: number, levels: number): Promise<StackFrameInfo[]> {
    const response = await sendDapRequest(session, 'stackTrace', { threadId: threadId, startFrame: 0, levels: levels });
    return (response?.stackFrames ?? []).map((frame: any): StackFrameInfo => ({
        id: frame.id,
        name: frame.name,
        file: frame.source?.path,
        sourceName: frame.source?.path ? undefined : frame.source?.name,
        line: frame.line,
        column: frame.column
    }));
}

export async function fetchThreads(session: DapSession): Promise<Array<{ id: number; name: string }>> {
    const response = await sendDapRequest(session, 'threads');
    return response?.threads ?? [];
}

/** Stack lookup for judging a stop; without a thread id the first thread is used. */
export async function fetchStackForStop(session: DapSession, threadId: number | undefined): Promise<{ threadId?: number; frames: StackFrameInfo[] }> {
    const resolvedThreadId = threadId ?? (await fetchThreads(session))[0]?.id;
    if (resolvedThreadId === undefined) {
        return { frames: [] };
    }
    return { threadId: resolvedThreadId, frames: await fetchStackFrames(session, resolvedThreadId, 5) };
}

/** Reads the scopes of a frame, expanding the variables of each scope that `shouldExpand` accepts. */
export async function fetchScopes(session: DapSession, frameId: number, options: VariableOptions & { shouldExpand: (scope: { name: string; expensive: boolean }, index: number, allScopes: Array<{ name: string }>) => boolean }): Promise<ScopeInfo[]> {
    const response = await sendDapRequest(session, 'scopes', { frameId: frameId });
    const budget = { remaining: MAX_VARIABLE_NODES };
    const scopes: ScopeInfo[] = [];
    for (const [index, scope] of (response?.scopes ?? []).entries()) {
        const expensive = scope.expensive === true;
        const info: ScopeInfo = { name: scope.name, variablesReference: scope.variablesReference, expensive: expensive };
        if (options.shouldExpand({ name: scope.name, expensive: expensive }, index, response.scopes)) {
            Object.assign(info, await fetchVariables(session, scope.variablesReference, options, budget));
        } else if (expensive) {
            info.notExpanded = true;
            info.hint = `Expensive scope; pass scope: "${scope.name}" to expand it.`;
        }
        scopes.push(info);
    }
    return scopes;
}

/** Reads the children of `variablesReference`, nesting expandable children up to `maxDepth` levels. */
export async function fetchVariables(session: DapSession, variablesReference: number, options: VariableOptions, budget = { remaining: MAX_VARIABLE_NODES }, depth = 1): Promise<{ variables: VariableInfo[]; totalVariables: number; truncated: boolean }> {
    const response = await sendDapRequest(session, 'variables', { variablesReference: variablesReference });
    const all: any[] = response?.variables ?? [];
    const limited = all.slice(0, options.maxItems);
    let truncated = all.length > limited.length;
    const variables: VariableInfo[] = [];
    for (const variable of limited) {
        if (budget.remaining <= 0) {
            truncated = true;
            break;
        }
        budget.remaining--;
        const info = describeVariable(variable);
        if (variable.variablesReference > 0 && depth < options.maxDepth) {
            const children = await fetchVariables(session, variable.variablesReference, options, budget, depth + 1);
            info.children = children.variables;
            if (children.truncated) {
                info.childrenTruncated = true;
            }
        }
        variables.push(info);
    }
    return { variables: variables, totalVariables: all.length, truncated: truncated };
}

export async function evaluateExpression(session: DapSession, options: { expression: string; frameId?: number; context: string }): Promise<EvaluateInfo> {
    const response = await sendDapRequest(session, 'evaluate', { expression: options.expression, frameId: options.frameId, context: options.context });
    const result = truncateValue(String(response?.result ?? ''));
    return {
        result: result.value,
        resultTruncated: result.truncated || undefined,
        type: response?.type,
        variablesReference: response?.variablesReference ?? 0
    };
}

export function formatFrameLocation(frame: StackFrameInfo): string {
    return `${frame.file ?? frame.sourceName ?? '(no source)'}:${frame.line}:${frame.name}`;
}

export function truncateValue(value: string): { value: string; truncated: boolean } {
    if (value.length <= MAX_VALUE_LENGTH) {
        return { value: value, truncated: false };
    }
    return { value: value.slice(0, MAX_VALUE_LENGTH), truncated: true };
}

function describeVariable(variable: any): VariableInfo {
    const value = truncateValue(String(variable.value ?? ''));
    return {
        name: variable.name,
        value: value.value,
        valueTruncated: value.truncated || undefined,
        type: variable.type,
        variablesReference: variable.variablesReference ?? 0,
        namedVariables: variable.namedVariables,
        indexedVariables: variable.indexedVariables
    };
}

/** The part of `vscode.DebugSession` the DAP helpers use. */
export interface DapSession {
    customRequest(command: string, args?: any): Thenable<any>;
}

export interface StackFrameInfo {
    id: number;
    name: string;
    /** Local path of the frame's source, when the adapter reports one. */
    file?: string;
    sourceName?: string;
    /** 1-based. */
    line: number;
    /** 1-based. */
    column: number;
}

export interface VariableOptions {
    maxDepth: number;
    maxItems: number;
}

export interface VariableInfo {
    name: string;
    value: string;
    valueTruncated?: boolean;
    type?: string;
    /** Non-zero when the value can be expanded with get_variables. */
    variablesReference: number;
    namedVariables?: number;
    indexedVariables?: number;
    children?: VariableInfo[];
    childrenTruncated?: boolean;
}

export interface ScopeInfo {
    name: string;
    variablesReference: number;
    expensive: boolean;
    notExpanded?: boolean;
    hint?: string;
    variables?: VariableInfo[];
    totalVariables?: number;
    truncated?: boolean;
}

export interface EvaluateInfo {
    result: string;
    resultTruncated?: boolean;
    type?: string;
    variablesReference: number;
}
