import * as path from 'path';

const MAX_LISTED_CANDIDATES = 10;

/**
 * Resolves a user-supplied file to one absolute path. Absolute paths must exist. A relative path
 * is tried against each workspace folder, then (when `findBySuffix` is given) matched against the
 * end of any file in the workspace, so a bare file name works. Zero or several matches is an error.
 */
export async function resolveWorkspaceFile(file: string, options: FileResolutionOptions): Promise<string> {
    const requested = file.trim();
    if (!requested) {
        throw new Error('A file path is required.');
    }
    if (path.isAbsolute(requested)) {
        if (!options.fileExists(requested)) {
            throw new Error(`File not found: ${requested}`);
        }
        return path.normalize(requested);
    }
    if (options.workspaceFolders.length === 0) {
        throw new Error(`Cannot resolve the relative path '${requested}' because no workspace folder is open. Pass an absolute path.`);
    }

    const relativePath = requested.replace(/\\/g, '/').replace(/^\.\//, '');
    const directMatches = unique(options.workspaceFolders.flatMap((folder) => {
        const candidates = [path.join(folder.path, relativePath)];
        if (relativePath.startsWith(`${folder.name}/`)) {
            candidates.push(path.join(folder.path, relativePath.slice(folder.name.length + 1)));
        }
        return candidates.filter((candidate) => options.fileExists(candidate));
    }));
    if (directMatches.length === 1) {
        return directMatches[0];
    }
    if (directMatches.length > 1) {
        throw ambiguous(requested, directMatches);
    }

    const suffixMatches = options.findBySuffix ? unique(await options.findBySuffix(relativePath)) : [];
    if (suffixMatches.length === 1) {
        return path.normalize(suffixMatches[0]);
    }
    if (suffixMatches.length > 1) {
        throw ambiguous(requested, suffixMatches);
    }
    throw new Error(`File not found in the workspace: ${requested}`);
}

function ambiguous(requested: string, candidates: string[]): Error {
    const listed = candidates.slice(0, MAX_LISTED_CANDIDATES).join(', ');
    const more = candidates.length > MAX_LISTED_CANDIDATES ? `, and ${candidates.length - MAX_LISTED_CANDIDATES} more` : '';
    return new Error(`'${requested}' matches several files: ${listed}${more}. Pass a longer or absolute path.`);
}

function unique(values: string[]): string[] {
    return [...new Set(values)];
}

export interface FileResolutionOptions {
    workspaceFolders: Array<{ name: string; path: string }>;
    fileExists: (filePath: string) => boolean;
    /** Absolute paths of workspace files whose path ends with the given relative path. */
    findBySuffix?: (relativePath: string) => Promise<string[]>;
}
