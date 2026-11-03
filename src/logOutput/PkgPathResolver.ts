import * as path from 'path';
import { rokuDeploy } from 'roku-deploy';
import BrightScriptFileUtils from '../BrightScriptFileUtils';
import type { BrightScriptLaunchConfiguration } from '../DebugConfigurationProvider';

/**
 * Maps `pkg:/` paths printed by the device back to the source files in the project being debugged
 */
export class PkgPathResolver {
    //add import as property so it can be mocked in tests
    private rokuDeploy = rokuDeploy;
    private fileUtils = new BrightScriptFileUtils();

    /**
     * Source file paths, keyed by their `pkg:/` path
     */
    private srcPathsByPkgPath = new Map<string, string>();

    /**
     * Rebuild the map from the files in this launch configuration
     */
    public async setLaunchConfig(launchConfig: BrightScriptLaunchConfiguration) {
        const rootDirs = launchConfig.sourceDirs ? launchConfig.sourceDirs : [launchConfig.rootDir];
        const fileLists = await Promise.all(
            rootDirs.map(rootDir => this.rokuDeploy.resolveFilesArray({ files: launchConfig.files, rootDir: rootDir }))
        );
        const outDir = launchConfig.outDir ? path.normalize(launchConfig.outDir) : undefined;

        const srcPathsByPkgPath = new Map<string, string>();
        for (const fileMap of [].concat(...fileLists)) {
            //fileMap.dest is already relative to the package root, but strip outDir just in case
            let dest = path.normalize(fileMap.dest);
            if (outDir) {
                dest = dest.replace(outDir, '');
            }
            let pkgPath = 'pkg:/' + dest;
            pkgPath = pkgPath.replace(/\\/g, '/').replace(/\/\//g, '/');
            srcPathsByPkgPath.set(pkgPath, fileMap.src);
        }
        this.srcPathsByPkgPath = srcPathsByPkgPath;
    }

    /**
     * Get the source file path for a `pkg:/` path, or undefined if it's not part of the project
     */
    public resolve(pkgPath: string): string | undefined {
        //a transpiled .brs file in the package may come from a .bs source file (or vice versa)
        return this.srcPathsByPkgPath.get(pkgPath) ?? this.srcPathsByPkgPath.get(this.fileUtils.getAlternateBrsFileName(pkgPath));
    }
}
