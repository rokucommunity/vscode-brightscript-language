import { standardizePath as s } from 'brighterscript';
import * as fsExtra from 'fs-extra';

/**
 * Injects the Solid Devtools on-device bridge into a staged RSG/TypeScript app bundle.
 *
 * Runs EXTENSION-SIDE, driven by roku-debug's `processStagingDir` reverse request
 * (sent after all projects are staged and before they're packaged) — so the bridge,
 * the wire protocol, AND the injection logic all live in this repo and version
 * together; roku-debug carries nothing devtools-specific. The surgical edit:
 *
 *  1. PREPEND the bridge IIFE (dist/solidDevtools/bridge.js, built by `build-bridge`)
 *     to the staged TS bundle (the manifest `ts_path` target). It defines
 *     `globalThis.__SDT` (incl. `__connect`) and touches nothing else.
 *  2. INSERT a one-line `__SDT.__connect({hooks:DevHooks,...})` call immediately
 *     after solid-js's dev `DevHooks` declaration. Dev builds are not
 *     identifier-minified, so `DevHooks` + the hoisted `getOwner`/`untrack`/
 *     `createRoot`/`getListener` functions are addressable by name in that scope.
 *     The call runs during solid's module init — before any app module creates
 *     owners/signals — so boot-time state is captured.
 *  3. PAD THE SOURCE MAP: the prepend adds K lines, so prepend K `;` to the sibling
 *     `.map`'s `mappings` (the same-line insert in step 2 needs no map change).
 *
 * Failure policy: this must NEVER break a launch. Any miss (no ts_path, no bundle,
 * no marker, unreadable bridge) just skips the injection entirely and reports a
 * reason. A missing DevHooks marker means solid's PRODUCTION build was bundled
 * (rsg-sdk emits dev hooks only when `solidDevMode: true` in roku-config.ts) — the
 * bridge would have nothing to attach to, so nothing is injected and the reported
 * reason tells the user to set `solidDevMode: true`.
 *
 * Types (DevtoolsBridgeInjectionOptions / ...Result) are declared at the bottom.
 */

/**
 * Matches solid-js's dev `DevHooks` hooks object in the bundle, e.g.
 *   var DevHooks={afterUpdate:null,afterCreateOwner:null,afterCreateSignal:null,afterRegisterGraph:null};
 * The declaration keyword is OPTIONAL: the SDK's block-scoping lowering (for Hermes)
 * hoists the `var`/`let`/`const` to the top of its scope and leaves a bare assignment
 *   ...;ExecCount=0;DevHooks={afterUpdate:null,...};
 * at the original init site — so we anchor on the captured name + the hook-property
 * shape, NOT the keyword (a `\b` keeps us from capturing out of a larger identifier).
 * The name is captured because esbuild renames on collision (solid-js/store's own hooks
 * object becomes `DevHooks2`); requiring BOTH afterCreateOwner and afterCreateSignal in
 * the literal guarantees we match solid-js core's hooks, not store's `{onStoreNodeUpdate}`.
 */
const DEV_HOOKS_REGEX = /(?:(?:var|let|const)\s+)?\b(DevHooks\w*)\s*=\s*\{[^{}]*afterCreateOwner[^{}]*afterCreateSignal[^{}]*\}\s*;/;

/** Marker present in the extension-built bridge — used as the double-injection guard */
const BRIDGE_SENTINEL = '__sdtBridge';

/**
 * Build the one-line connect statement. Every identifier is typeof-guarded and the whole
 * statement is try/caught so a renamed/missing identifier in some future solid version
 * degrades to a "couldn't connect" status instead of crashing the app's module init.
 */
export function buildConnectStatement(devHooksVarName: string) {
    const fn = (name: string) => `${name}:typeof ${name}==='function'?${name}:void 0`;
    return 'try{globalThis.__SDT&&globalThis.__SDT.__connect({' +
        `hooks:${devHooksVarName},` +
        `${fn('getOwner')},` +
        `${fn('untrack')},` +
        `${fn('createRoot')},` +
        `${fn('getListener')},` +
        '$PROXY:typeof $PROXY==="undefined"?void 0:$PROXY,' +
        //solid's own update-cycle counter (declared right before DevHooks, bumped once
        //per runUpdates batch) — lets the bridge answer "did anything change?" without
        //installing any hook on the update path. -1 = unavailable (bridge falls back).
        'getExecCount:function(){return typeof ExecCount==="number"?ExecCount:-1}' +
        '});}catch(e){try{console.log("[SDT] devtools connect failed: "+e);}catch(e2){}}';
}

/**
 * Read the staged manifest and return the `ts_path` value as a staging-relative path
 * (e.g. `source/compiled/index.js`), or undefined when absent/not a TS app.
 */
async function getTsBundlePath(stagingDir: string): Promise<string | undefined> {
    const manifestPath = s`${stagingDir}/manifest`;
    if (!await fsExtra.pathExists(manifestPath)) {
        return undefined;
    }
    const manifest = await fsExtra.readFile(manifestPath, 'utf8');
    const match = /^[ \t]*ts_path[ \t]*=[ \t]*(.+?)[ \t\r]*$/m.exec(manifest);
    if (!match) {
        return undefined;
    }
    //strip the `pkg:/` scheme (and any leading slash) to make it staging-relative
    return match[1].replace(/^pkg:/i, '').replace(/^[/\\]+/, '');
}

/**
 * Inject the devtools bridge into the staged TS bundle. Resolves with what happened —
 * never rejects (a failed injection must not break the launch).
 */
export async function injectDevtoolsBridge(options: DevtoolsBridgeInjectionOptions): Promise<DevtoolsBridgeInjectionResult> {
    const log = options.log ?? ((message: string) => console.log(message));
    const skip = (reason: string): DevtoolsBridgeInjectionResult => {
        log(`Skipping devtools bridge injection: ${reason}`);
        return { injected: false, connected: false, reason: reason };
    };
    try {
        if (!options.devtoolsBridgePath || !await fsExtra.pathExists(options.devtoolsBridgePath)) {
            //not a normal skip: the extension is missing its own bridge bundle
            const result = skip(`devtoolsBridgePath not found: '${options.devtoolsBridgePath}'`);
            log('Run `npm run build-bridge` to rebuild it');
            return { ...result, bridgeBundleMissing: true };
        }
        const tsBundleRelativePath = await getTsBundlePath(options.stagingDir);
        if (!tsBundleRelativePath) {
            return skip(`manifest has no ts_path (not a TS/RSG app): '${s`${options.stagingDir}/manifest`}'`);
        }
        const bundlePath = s`${options.stagingDir}/${tsBundleRelativePath}`;
        if (!await fsExtra.pathExists(bundlePath)) {
            return skip(`staged ts_path bundle not found: '${bundlePath}'`);
        }
        const bundleBytes = await fsExtra.readFile(bundlePath);
        //production builds precompile the ts_path target to Hermes bytecode — prepending
        //JS text to that would corrupt it. NUL bytes never appear this early in JS source.
        if (bundleBytes.subarray(0, 512).includes(0)) {
            return skip(`staged ts_path bundle is not JS text (Hermes bytecode? production build?): '${bundlePath}'`);
        }
        const bundle = bundleBytes.toString('utf8');
        if (bundle.includes(BRIDGE_SENTINEL)) {
            return skip(`bundle already contains the bridge: '${bundlePath}'`);
        }
        let bridgeCode = await fsExtra.readFile(options.devtoolsBridgePath, 'utf8');
        if (!bridgeCode.endsWith('\n')) {
            bridgeCode += '\n';
        }

        //insert the connect call immediately after the DevHooks declaration (same line, so
        //the source map needs no change for this edit)
        const markerMatch = DEV_HOOKS_REGEX.exec(bundle);
        //No DevHooks marker means solid's PRODUCTION build was bundled (rsg-sdk only emits
        //dev hooks when `solidDevMode: true` in roku-config.ts, which selects solid's DEV
        //build). The bridge has nothing to attach to, so injecting it would ship ~1100 lines
        //of dead code to the device for no benefit. Bail instead — the devtools panel reports
        //this reason so the user knows to set `solidDevMode: true`.
        if (!markerMatch) {
            return skip(`solid DevHooks not found in '${bundlePath}' — not a solid dev build (set \`solidDevMode: true\` in roku-config.ts to enable the devtools)`);
        }
        const insertAt = markerMatch.index + markerMatch[0].length;
        //prepend the bridge IIFE and insert the connect call after the DevHooks declaration
        const newBundle = bridgeCode +
            bundle.slice(0, insertAt) + buildConnectStatement(markerMatch[1]) + bundle.slice(insertAt);
        await fsExtra.writeFile(bundlePath, newBundle);

        //pad the source map for the prepended lines so original mappings stay valid
        const prependedLineCount = bridgeCode.split('\n').length - 1;
        const mapPath = `${bundlePath}.map`;
        if (await fsExtra.pathExists(mapPath)) {
            const map = await fsExtra.readJson(mapPath);
            if (typeof map.mappings === 'string') {
                map.mappings = ';'.repeat(prependedLineCount) + map.mappings;
                await fsExtra.writeJson(mapPath, map);
            }
        }

        log(`Devtools bridge injected into '${bundlePath}' (+${prependedLineCount} lines, connect inserted after '${markerMatch[1]}')`);
        return {
            injected: true,
            connected: true,
            reason: undefined
        };
    } catch (e) {
        log(`Devtools bridge injection failed: ${(e as Error)?.stack ?? String(e)}`);
        return { injected: false, connected: false, reason: `error: ${(e as Error)?.message ?? String(e)}` };
    }
}

// ---- types -------------------------------------------------------------------

export interface DevtoolsBridgeInjectionOptions {
    /** The staged project folder (after staging, before packaging) */
    stagingDir: string;
    /** Absolute path to the extension-built bridge JS (a self-contained IIFE) */
    devtoolsBridgePath: string;
    /** Where to log progress/skips (defaults to console.log) */
    log?: (message: string) => void;
}

export interface DevtoolsBridgeInjectionResult {
    /** true when the bridge was prepended to the staged bundle */
    injected: boolean;
    /** true when the solid `__connect(...)` call was also inserted (false = bridge-only, won't connect) */
    connected: boolean;
    /** why injection (or the connect insert) was skipped */
    reason?: string;
    /** true when the extension's own bridge bundle is missing — a broken build, not a normal skip */
    bridgeBundleMissing?: boolean;
}
