import * as path from 'path';

/**
 * Contents of the launcher that external MCP clients execute. It runs the stable bridge copy
 * with the VS Code executable that installed it as plain Node, so a client config keeps working
 * after VS Code moves or updates, because the launcher is rewritten on every activation.
 */
export function buildLauncherScript(options: LauncherOptions): string {
    if (options.platform === 'win32') {
        const lines = [
            '@echo off',
            'set ELECTRON_RUN_AS_NODE=1',
            ...Object.entries(options.environment ?? {}).map(([name, value]) => `set "${name}=${escapeBatchValue(value)}"`),
            `"${escapeBatchValue(options.executablePath)}" "${escapeBatchValue(options.bridgePath)}" %* & exit /b`
        ];
        return lines.join('\r\n') + '\r\n';
    }
    const lines = [
        '#!/bin/sh',
        'ELECTRON_RUN_AS_NODE=1',
        'export ELECTRON_RUN_AS_NODE',
        ...Object.entries(options.environment ?? {}).flatMap(([name, value]) => [`${name}=${quoteForShell(value)}`, `export ${name}`]),
        `exec ${quoteForShell(options.executablePath)} ${quoteForShell(options.bridgePath)} "$@"`
    ];
    return lines.join('\n') + '\n';
}

export function getLauncherFileName(platform: NodeJS.Platform = process.platform): string {
    return platform === 'win32' ? 'bridge.cmd' : 'bridge';
}

export function getLauncherPath(debugMcpHome: string, platform: NodeJS.Platform = process.platform): string {
    const platformPath = platform === 'win32' ? path.win32 : path.posix;
    return platformPath.join(debugMcpHome, getLauncherFileName(platform));
}

/** Single-quotes a value for `sh`, so spaces, `$` and embedded single quotes are literal. */
export function quoteForShell(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Batch files expand `%` even inside quotes; doubling it keeps it literal. */
function escapeBatchValue(value: string): string {
    return value.replace(/%/g, '%%');
}

export interface LauncherOptions {
    platform: NodeJS.Platform;
    executablePath: string;
    bridgePath: string;
    /** Variables exported to the bridge, e.g. where the debug MCP home is and how the product is named. */
    environment?: Record<string, string>;
}
