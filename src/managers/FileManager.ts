import * as fsExtra from 'fs-extra';

export class FileManager {
    /**
     * Determine if a file exists
     * @param filePath
     */
    public fileExists(filePath: string) {
        return new Promise((resolve) => {
            fsExtra.exists(filePath, resolve);
        });
    }

    /**
     * Reads the the manifest file and converts to a javascript object skipping empty lines and comments
     * @param path location of the manifest file
     */
    public async convertManifestToObject(path: string): Promise<Record<string, string> | undefined> {
        if (await this.fileExists(path) === false) {
            return undefined;
        } else {
            let fileContents = (await fsExtra.readFile(path)).toString();
            let manifestLines = fileContents.split('\n');

            let manifestValues = {};
            for (const line of manifestLines) {
                let match;
                // eslint-disable-next-line no-cond-assign
                if (match = /(\w+)=(.+)/.exec(line)) {
                    manifestValues[match[1]] = match[2];
                }
            }

            return manifestValues;
        }
    }

    /**
     * Read the `ts_path` manifest entry from a built app's `rootDir`, which identifies a
     * TypeScript/JS (Solid) app and points at the compiled JS bundle. Returns undefined when the
     * manifest is missing (e.g. the app hasn't been built yet) or has no `ts_path` (a
     * BrightScript-only app). Kept synchronous so non-async callers (like `onDidStartDebugSession`)
     * can use it directly.
     */
    public getTsPath(rootDir: string): string | undefined {
        if (!rootDir) {
            return undefined;
        }
        //strip any trailing slash(es) so we don't produce `rootDir//manifest`
        const manifestPath = `${rootDir.replace(/[\\/]+$/, '')}/manifest`;
        if (!fsExtra.existsSync(manifestPath)) {
            return undefined;
        }
        const contents = fsExtra.readFileSync(manifestPath).toString();
        // https://regex101.com/r/qgLxGh/1
        const match = /ts_path[ \t]*=[ \t]*(.*)?(?=[\r?\n]|$)/ig.exec(contents);
        return match?.[1]?.trim() || undefined;
    }
}

export const fileManager = new FileManager();
