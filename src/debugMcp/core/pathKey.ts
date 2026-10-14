import * as path from 'path';

/**
 * Comparable form of a file path: separators and `..` normalized, and lower-cased where the
 * file system is case-insensitive (win32, darwin) so drive letter case never matters.
 */
export function toPathKey(filePath: string, platform: NodeJS.Platform = process.platform): string {
    const normalized = path.normalize(filePath).replace(/\\/g, '/').replace(/\/+$/, '');
    if (platform === 'win32' || platform === 'darwin') {
        return normalized.toLowerCase();
    }
    return normalized.replace(/^[A-Za-z]:/, (drive) => drive.toLowerCase());
}
