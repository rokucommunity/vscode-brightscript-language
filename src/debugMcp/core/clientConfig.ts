import * as path from 'path';
import { getLauncherFileName, getLauncherPath } from './launcher';
import { DEFAULT_IDENTITY } from './identity';
import type { DebugMcpIdentity } from './identity';

/**
 * The single place that decides how an external MCP client launches the bridge: through the
 * launcher installed in the debug MCP home. Windows clients cannot spawn a batch file directly,
 * so it goes through `cmd /c`. `portable` is for configs committed to a repository: it refers to
 * the launcher through the user's home directory variable instead of an absolute path, unless
 * the home is overridden, since the variable form would then point at the wrong place.
 */
export function getClientLaunchCommand(debugMcpHome: string, options: ClientLaunchOptions = {}): ClientLaunchCommand {
    const platform = options.platform ?? process.platform;
    const useHomeVariable = options.portable && !options.isHomeOverridden;
    const homeDirectorySegments = (options.identity ?? DEFAULT_IDENTITY).homeDirectorySegments;
    if (platform === 'win32') {
        const launcherPath = useHomeVariable
            ? ['${USERPROFILE}', ...homeDirectorySegments, getLauncherFileName(platform)].join('\\')
            : getLauncherPath(debugMcpHome, platform);
        return { command: 'cmd', args: ['/c', launcherPath] };
    }
    return {
        command: useHomeVariable ? ['${HOME}', ...homeDirectorySegments, getLauncherFileName(platform)].join('/') : getLauncherPath(debugMcpHome, platform),
        args: []
    };
}

/** `type: "stdio"` is required by Claude Code's project config and omitted for Claude Desktop. */
export function buildServerEntry(launchCommand: ClientLaunchCommand, options: { includeType: boolean }): McpServerEntry {
    return {
        ...(options.includeType ? { type: 'stdio' as const } : {}),
        command: launchCommand.command,
        args: [...launchCommand.args]
    };
}

/**
 * Returns `existingText` (the contents of an MCP client config file, if any) with the entry
 * added under `mcpServers`. Every other key and server is preserved. Throws, rather than
 * overwriting, when the existing text is not a JSON object.
 */
export function mergeServerEntry(existingText: string | undefined, entry: McpServerEntry, serverName = DEFAULT_IDENTITY.serverName): string {
    let config: Record<string, any> = {};
    if (existingText?.trim()) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(existingText);
        } catch (error) {
            throw new Error(`Existing config is not valid JSON: ${(error as Error).message}`);
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Existing config is not a JSON object');
        }
        config = parsed;
    }
    const existingServers = config.mcpServers;
    if (existingServers !== undefined && (!existingServers || typeof existingServers !== 'object' || Array.isArray(existingServers))) {
        throw new Error('Existing config has an invalid "mcpServers" value');
    }
    config.mcpServers = { ...existingServers, [serverName]: entry };
    return JSON.stringify(config, undefined, 2) + '\n';
}

export function getClaudeDesktopConfigPath(
    homeDirectory: string,
    platform: NodeJS.Platform = process.platform,
    appDataDirectory: string | undefined = process.env.APPDATA
): string {
    if (platform === 'darwin') {
        return path.join(homeDirectory, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    }
    if (platform === 'win32') {
        return path.join(appDataDirectory ?? path.join(homeDirectory, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
    }
    return path.join(homeDirectory, '.config', 'Claude', 'claude_desktop_config.json');
}

/**
 * Arguments for `claude`, registering the entry for the current user across all projects. The
 * command is passed as plain tokens after `--` rather than as JSON, which cannot be quoted
 * reliably through the Windows command interpreter.
 */
export function buildClaudeCodeAddArgs(entry: McpServerEntry, serverName = DEFAULT_IDENTITY.serverName): string[] {
    return ['mcp', 'add', '--scope', 'user', serverName, '--', entry.command, ...entry.args];
}

export function buildClaudeCodeRemoveArgs(serverName = DEFAULT_IDENTITY.serverName): string[] {
    return ['mcp', 'remove', '--scope', 'user', serverName];
}

/** True when `value` has characters `cmd /c` may mis-handle in an unquoted or re-quoted path. */
export function hasCmdSpecialCharacters(value: string): boolean {
    return /[&<>()@^|]/.test(value);
}

/**
 * How to execute `command` with `args` without a shell on POSIX. On Windows `claude` is an npm
 * `.cmd` shim that cannot be spawned directly, so it runs via `cmd /c` with every token
 * double-quoted. Throws for tokens that cannot be quoted safely there (`%` is expanded even
 * inside quotes, and `"` cannot be escaped).
 */
export function buildCommandInvocation(command: string, args: string[], platform: NodeJS.Platform = process.platform): CommandInvocation {
    if (platform !== 'win32') {
        return { file: command, args: args, windowsVerbatimArguments: false };
    }
    const tokens = [command, ...args];
    const unsafeToken = tokens.find((token) => /["%]/.test(token));
    if (unsafeToken !== undefined) {
        throw new Error(`Cannot pass "${unsafeToken}" through the Windows command interpreter`);
    }
    const commandLine = tokens.map((token) => `"${token}"`).join(' ');
    return { file: 'cmd.exe', args: ['/d', '/s', '/c', `"${commandLine}"`], windowsVerbatimArguments: true };
}

export interface ClientLaunchOptions {
    platform?: NodeJS.Platform;
    /** Prefer a home-directory variable over an absolute path, for configs shared between machines. */
    portable?: boolean;
    /** True when the home environment variable is set, which disables the portable form. */
    isHomeOverridden?: boolean;
    /** Supplies the default home location for the portable form. */
    identity?: Pick<DebugMcpIdentity, 'homeDirectorySegments'>;
}

export interface ClientLaunchCommand {
    command: string;
    args: string[];
}

export interface CommandInvocation {
    file: string;
    args: string[];
    windowsVerbatimArguments: boolean;
}

export interface McpServerEntry {
    type?: 'stdio';
    command: string;
    args: string[];
}
