import * as vscode from 'vscode';
import * as path from 'path';
import * as fsExtra from 'fs-extra';
import { standardizePath as s } from 'brighterscript';
import { util } from '../util';
import type { BrightScriptLaunchConfiguration } from '../DebugConfigurationProvider';

/**
 * Finds the compiled JS bundle a BrightScript debug session should attach the node debugger to,
 * and derives every path the `node` attach config needs from it (`remoteRoot`/`localRoot`,
 * `outFiles` globs, `sourceMapPathOverrides`). Split out of `extension.ts` so the (fiddly,
 * Windows-sensitive) path math has one home instead of living inline in `attachJsDebugger`.
 */
export class JsDebugTargetResolver {
    constructor(
        private log: (message: string) => void
    ) {
    }

    /**
     * Find the compiled JS bundle this session should attach the node debugger to (if any).
     * A top-level `tsPath` in launch.json wins, then the app manifest's `ts_path`, then the
     * first component library with a `tsPath` configured in launch.json.
     */
    public async resolveJsDebugTarget(configuration: BrightScriptLaunchConfiguration): Promise<JsDebugTarget | undefined> {
        const appTsPath = configuration.tsPath ?? util.getTsPath(configuration.rootDir);
        if (appTsPath) {
            const workspaceFolders = vscode.workspace.workspaceFolders || [];
            //use the stagingDir if provided, otherwise default to what we think it will probably be (hasn't changed in years...)
            const stagingDir = configuration.stagingDir ?? configuration.stagingFolderPath ?? `${workspaceFolders[0].uri.fsPath}/out/.roku-deploy-staging`;
            return { tsPath: appTsPath, rootDir: configuration.rootDir, stagingDir: stagingDir };
        }

        for (const library of configuration.componentLibraries ?? []) {
            if (!library.tsPath) {
                continue;
            }
            //roku-debug stages each component library in its own folder at `${outDir}/component-libraries/<outFile minus extension>`,
            //where outFile may contain `${var}` placeholders resolved from the library's manifest. Recreate that path here.
            const manifestValues = await util.convertManifestToObject(path.join(library.rootDir, 'manifest')) ?? {};
            const outFileName = library.outFile.replace(/\$\{([\w\d_]+)\}/g, (wholeMatch, name) => (manifestValues[name] ?? wholeMatch).trim());
            const stagingDir = s`${configuration.outDir}/component-libraries/${path.basename(outFileName, path.extname(outFileName))}`;
            return { tsPath: library.tsPath, rootDir: library.rootDir, stagingDir: stagingDir };
        }
    }

    /**
     * Derive every path `attachJsDebugger`'s node attach config needs from a resolved target.
     *
     * `tsPath` is a DEVICE path (e.g. `pkg:/source/compiled/main.js`), so it is always posix.
     * Never run it through the platform-native `path` helpers: on Windows `path.normalize`
     * rewrites it to `\source\compiled`, which matches nothing the device reports back.
     */
    public resolveTargetPaths(target: JsDebugTarget): JsDebugTargetPaths {
        const tsPath = target.tsPath.replace(/\s*(?:lib)?pkg:/, '');
        //something like /source/compiled
        const remoteRoot = path.posix.dirname(tsPath.replace(/\\/g, '/'));

        //Find where the compiled bundle ACTUALLY lives on disk. `resolveJsDebugTarget` falls back
        //to `${workspaceFolder}/out/.roku-deploy-staging` when launch.json doesn't set `stagingDir`,
        //and projects that build elsewhere have no staging dir at all. A localRoot pointing at a
        //nonexistent dir means js-debug never finds the bundle's adjacent `.js.map`, so breakpoints
        //in .ts/.tsx never bind (while `debugger;` statements still work - those are driven from
        //the runtime side and need no sourcemap lookup).
        const bundleFileName = path.posix.basename(tsPath.replace(/\\/g, '/'));
        const localRootCandidates = [
            //explicit/derived staging dir (correct for roku-deploy staged projects)
            path.resolve(target.stagingDir, `.${remoteRoot}`),
            //the project's build output, mirroring the device layout
            path.resolve(target.rootDir, `.${remoteRoot}`)
        ];
        //prefer the first candidate that actually contains the bundle; fall back to the staging guess
        const localRoot = localRootCandidates.find(
            candidate => fsExtra.existsSync(path.join(candidate, bundleFileName))
        ) ?? localRootCandidates[0];
        //js-debug matches globs and sourcemap overrides with forward slashes on every platform
        const localRootPosix = localRoot.replace(/\\/g, '/');
        const outFiles = [`${localRootPosix}/*.js`];

        //The sourcemap's relative `sources` (`../../../../examples/.../app.tsx`) are resolved by
        //js-debug against the script's DEVICE url, so once the `..` segments collapse they land on
        //driveless roots like `/examples/...` with no local counterpart - and vscode opens a
        //PHANTOM tab for `\examples\...\app.tsx` instead of the user's real file. Map each
        //top-level workspace dir by name to re-anchor them. Depth-independent on purpose: the map
        //on the device is built relative to the project's own output dir, which sits at a different
        //depth than the staging copy, so any `../` count computed locally can be wrong.
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        const sourcesRoot = workspaceFolders[0]?.uri.fsPath ?? target.rootDir;
        const sourcesRootPosix = sourcesRoot.replace(/\\/g, '/');
        const workspaceDirOverrides: Record<string, string> = {};
        try {
            for (const entry of fsExtra.readdirSync(sourcesRoot, { withFileTypes: true })) {
                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    workspaceDirOverrides[`/${entry.name}/*`] = `${sourcesRootPosix}/${entry.name}/*`;
                    workspaceDirOverrides[`file:///${entry.name}/*`] = `${sourcesRootPosix}/${entry.name}/*`;
                }
            }
        } catch (e) {
            this.log(`Failed to enumerate top-level dirs of '${sourcesRoot}' for sourcemap overrides: ${e?.message ?? e}`);
        }

        //rsg-sdk sourcemaps carry plain relative paths, so js-debug's scheme-based defaults
        //(webpack:///, meteor://, turbopack://) are deliberately omitted; restate them here
        //(supplying this key disables them) if a scheme-emitting bundler ever feeds this path.
        //const sourceMapPathOverrides = { ...getDefaultSourceMapPathOverrides(target.rootDir), ...workspaceDirOverrides };
        const sourceMapPathOverrides: Record<string, string> = {
            ...workspaceDirOverrides
        };

        return {
            tsPath: tsPath,
            rootDir: target.rootDir,
            stagingDir: target.stagingDir,
            remoteRoot: remoteRoot,
            localRoot: localRoot,
            localRootCandidates: localRootCandidates,
            outFiles: outFiles,
            sourceMapPathOverrides: sourceMapPathOverrides
        };
    }
}

/**
 * js-debug's own default `sourceMapPathOverrides` (ported verbatim from the `dm()` helper in the
 * shipped `ms-vscode.js-debug` extension's bundled `extension.js`), keyed by the same `cwd` value
 * js-debug substitutes them with.
 */
export function getDefaultSourceMapPathOverrides(cwd: string): Record<string, string> {
    return {
        'webpack:///./~/*': `${cwd}/node_modules/*`,
        'webpack:////*': '/*',
        'webpack://@?:*/?:*/*': `${cwd}/*`,
        'webpack://?:*/*': `${cwd}/*`,
        'webpack:///([a-z]):/(.+)': '$1:/$2',
        'meteor://💻app/*': `${cwd}/*`,
        'turbopack://[project]/*': '${workspaceFolder}/*',
        'turbopack:///[project]/*': '${workspaceFolder}/*'
    };
}

// ---- types ----

export interface JsDebugTarget {
    /**
     * Device path to the compiled JS bundle (a `ts_path`-style value, e.g. 'pkg:/source/compiled/main.js')
     */
    tsPath: string;
    /**
     * rootDir of the project the bundle was built from (the app's rootDir, or the component library's)
     */
    rootDir: string;
    /**
     * The staging directory the debugger copied this project's files into (where the staged .js and .map files live)
     */
    stagingDir: string;
}

export interface JsDebugTargetPaths {
    /** `target.tsPath` with any leading `pkg:`/`libpkg:` prefix stripped. */
    tsPath: string;
    rootDir: string;
    stagingDir: string;
    /** Posix directory of `tsPath`, e.g. `/source/compiled`. */
    remoteRoot: string;
    /** The candidate from `localRootCandidates` that was selected (contains the bundle, or the first candidate as a fallback guess). */
    localRoot: string;
    /** Every local directory probed for the compiled bundle, staging dir first. */
    localRootCandidates: string[];
    /** Posix glob(s) matching the compiled JS, for the node attach config's `outFiles`. */
    outFiles: string[];
    /** js-debug's own defaults plus a remap for each top-level workspace directory. */
    sourceMapPathOverrides: Record<string, string>;
}
