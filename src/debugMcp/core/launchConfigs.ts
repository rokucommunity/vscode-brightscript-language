/** Lists every named configuration and compound across the sources. `fields` are extra configuration keys to report, as an integration declares them. */
export function listLaunchConfigs(sources: LaunchSource[], fields: string[] = []): LaunchConfigSummary[] {
    const summaries: LaunchConfigSummary[] = [];
    for (const source of sources) {
        const folder = source.folderName ?? null;
        for (const configuration of source.configurations) {
            if (typeof configuration?.name === 'string') {
                summaries.push({
                    name: configuration.name,
                    kind: 'configuration',
                    type: configuration.type,
                    request: configuration.request,
                    folder: folder,
                    ...Object.fromEntries(fields.filter((field) => configuration[field] !== undefined).map((field) => [field, configuration[field]]))
                });
            }
        }
        for (const compound of source.compounds) {
            if (typeof compound?.name === 'string') {
                summaries.push({ name: compound.name, kind: 'compound', folder: folder, configurations: compound.configurations });
            }
        }
    }
    return summaries;
}

/**
 * Finds the configuration or compound to start. With overrides, returns the named configuration
 * with the overrides shallow-merged in, to be started as an object. Only keys in `allowedOverrides`
 * (key to required value type) are accepted.
 */
export function resolveStartTarget(sources: LaunchSource[], request: { name: string; folder?: string; overrides?: Record<string, unknown> }, allowedOverrides: Record<string, string> = {}): StartTarget {
    const overrides = validateOverrides(request.overrides, allowedOverrides);
    const candidates = sources
        .filter((source) => !request.folder || source.folderName === request.folder || source.folderPath === request.folder)
        .flatMap((source) => [
            ...source.configurations.filter((entry) => entry?.name === request.name).map((entry) => ({ source: source, entry: entry, kind: 'configuration' as const })),
            ...source.compounds.filter((entry) => entry?.name === request.name).map((entry) => ({ source: source, entry: entry, kind: 'compound' as const }))
        ]);

    if (candidates.length === 0) {
        const available = listLaunchConfigs(sources).map((summary) => summary.name);
        throw new Error(`No launch configuration named '${request.name}'${request.folder ? ` in folder '${request.folder}'` : ''}. Available: ${available.length > 0 ? available.join(', ') : '(none; use list_launch_configs)'}.`);
    }
    if (candidates.length > 1) {
        const folders = candidates.map((candidate) => candidate.source.folderName ?? '(workspace)').join(', ');
        throw new Error(`Several launch configurations are named '${request.name}' (folders: ${folders}). Pass folder.`);
    }

    const [{ source, entry, kind }] = candidates;
    if (overrides && kind === 'compound') {
        throw new Error('Overrides cannot be applied to a compound launch configuration. Start a single configuration instead.');
    }
    return {
        name: request.name,
        kind: kind,
        folderName: source.folderName,
        folderPath: source.folderPath,
        configuration: overrides ? { ...entry, ...overrides } : undefined
    };
}

function validateOverrides(overrides: Record<string, unknown> | undefined, allowedOverrides: Record<string, string>): Record<string, unknown> | undefined {
    if (!overrides || Object.keys(overrides).length === 0) {
        return undefined;
    }
    for (const [key, value] of Object.entries(overrides)) {
        const expectedType = allowedOverrides[key];
        if (!expectedType) {
            throw new Error(`Override '${key}' is not allowed. Allowed overrides: ${Object.keys(allowedOverrides).join(', ') || '(none)'}.`);
        }
        if (typeof value !== expectedType) {
            throw new Error(`Override '${key}' must be a ${expectedType}.`);
        }
    }
    return overrides;
}

/**
 * Assembles launch sources from `WorkspaceConfiguration.inspect` results. Each folder contributes
 * only its own launch.json (`workspaceFolderValue`), so a single-folder workspace never lists an
 * entry twice and a folder without launch.json inherits nothing. Workspace-level entries come
 * from the .code-workspace file and exist only when one is open.
 */
export function buildLaunchSources(input: LaunchInspectInput): LaunchSource[] {
    const sources: LaunchSource[] = input.folders.map((folder) => ({
        folderName: folder.name,
        folderPath: folder.path,
        configurations: folder.configurations?.workspaceFolderValue ?? [],
        compounds: folder.compounds?.workspaceFolderValue ?? []
    }));
    if (input.hasWorkspaceFile) {
        const configurations = input.workspace?.configurations?.workspaceValue ?? [];
        const compounds = input.workspace?.compounds?.workspaceValue ?? [];
        if (configurations.length > 0 || compounds.length > 0) {
            sources.push({ configurations: configurations, compounds: compounds });
        }
    }
    return sources;
}

/** The launch configurations defined at one level (a workspace folder, or the workspace itself). */
export interface LaunchSource {
    folderName?: string;
    folderPath?: string;
    configurations: Array<Record<string, any>>;
    compounds: Array<Record<string, any>>;
}

export interface LaunchConfigSummary {
    [field: string]: unknown;
    name: string;
    kind: 'configuration' | 'compound';
    type?: string;
    request?: string;
    /** Workspace folder name, or null for workspace-level entries. */
    folder: string | null;
    /** Member configuration names, for a compound. */
    configurations?: unknown[];
}

export interface StartTarget {
    name: string;
    kind: 'configuration' | 'compound';
    folderName?: string;
    folderPath?: string;
    /** Present when overrides were applied; start this object instead of the name. */
    configuration?: Record<string, unknown>;
}

/** The relevant part of a `WorkspaceConfiguration.inspect` result. */
export interface InspectedLaunchValue {
    workspaceFolderValue?: Array<Record<string, any>>;
    workspaceValue?: Array<Record<string, any>>;
}

export interface LaunchInspectInput {
    folders: Array<{ name: string; path: string; configurations?: InspectedLaunchValue; compounds?: InspectedLaunchValue }>;
    workspace?: { configurations?: InspectedLaunchValue; compounds?: InspectedLaunchValue };
    hasWorkspaceFile: boolean;
}
