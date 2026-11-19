import * as os from 'os';
import * as path from 'path';
import { DEFAULT_IDENTITY } from './identity';
import type { DebugMcpIdentity } from './identity';

/**
 * Root of everything the debug MCP feature writes to disk. Overridable through
 * the identity's home environment variable so tests never touch the real home directory. The
 * launcher hands the resolved location to the bridge.
 */
export function getDebugMcpHome(environment: NodeJS.ProcessEnv = process.env, homeDirectory = os.homedir(), identity: Pick<DebugMcpIdentity, 'homeEnvironmentVariable' | 'homeDirectorySegments'> = DEFAULT_IDENTITY): string {
    return environment[identity.homeEnvironmentVariable] || path.join(homeDirectory, ...identity.homeDirectorySegments);
}

export function getInstancesDirectory(debugMcpHome: string): string {
    return path.join(debugMcpHome, 'instances');
}

export function getSocketsDirectory(debugMcpHome: string): string {
    return path.join(debugMcpHome, 'sockets');
}

/** Stable location the compiled bridge is copied to, so client configs survive extension updates. */
export function getStableBridgePath(debugMcpHome: string): string {
    return path.join(debugMcpHome, 'bridge.js');
}
