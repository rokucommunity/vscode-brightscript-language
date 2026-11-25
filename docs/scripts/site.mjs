/**
 * Builds and runs the docs site.
 *
 *   node scripts/site.mjs start   dev server, with a search index that's rebuilt in the background as you edit
 *   node scripts/site.mjs build   the full site, into docs/build
 *   node scripts/site.mjs serve   serve that build locally, like production
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { docsDir, repoDir, websiteDir } from '../config.mjs';
import { syncSidebarFile, otherCategoryLabel, isExcluded } from '../sidebar.mjs';
import { syncReferencePages } from './reference.mjs';

const buildDir = path.join(websiteDir, 'build');
//`npm run docs`: files that change while the dev server runs (pages.json, search-index.json), served next to the live docs.
//The dev server reloads the page when they change
const devLiveDir = path.join(websiteDir, '.dev', 'live');

const docusaurusBin = path.join(websiteDir, 'node_modules', '@docusaurus', 'core', 'bin', 'docusaurus.mjs');

/**
 * Run docusaurus, streaming its output, and throw if it fails
 */
function docusaurus(args, env = {}) {
    const result = spawnSync(process.execPath, [docusaurusBin, ...args], { cwd: websiteDir, stdio: 'inherit', env: { ...process.env, ...env } });
    if (result.status !== 0) {
        throw new Error(`docusaurus ${args[0]} exited with code ${result.status}`);
    }
}

/**
 * Like `docusaurus()`, but without blocking (so other work, like the background search index build, can finish meanwhile)
 */
function docusaurusAsync(args, env = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [docusaurusBin, ...args], { cwd: websiteDir, stdio: 'inherit', env: { ...process.env, ...env } });
        child.on('error', reject);
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`docusaurus ${args[0]} exited with code ${code}`))));
    });
}

/**
 * Make a separate docusaurus site folder that uses THIS site's config, src/, static/ and node_modules/ (via links).
 * Building from it gives that build its own .docusaurus/ folder, so it can run while the dev server is running without
 * tripping over each other's generated files.
 */
function createLinkedSiteDir(siteDir) {
    const linkNames = ['src', 'static', 'node_modules'];
    //remove the links themselves first, so deleting the folder can never reach through them into the real folders
    for (const name of linkNames) {
        const linkPath = path.join(siteDir, name);
        if (fs.lstatSync(linkPath, { throwIfNoEntry: false })?.isSymbolicLink()) {
            //(junctions on windows are removed like folders, symlinks everywhere else like files)
            if (process.platform === 'win32') {
                fs.rmdirSync(linkPath);
            } else {
                fs.unlinkSync(linkPath);
            }
        }
    }
    fs.rmSync(siteDir, { recursive: true, force: true });
    fs.mkdirSync(siteDir, { recursive: true });
    for (const name of linkNames) {
        //(junctions, since they don't need admin rights on windows)
        fs.symlinkSync(path.join(websiteDir, name), path.join(siteDir, name), 'junction');
    }
    fs.copyFileSync(path.join(websiteDir, 'package.json'), path.join(siteDir, 'package.json'));
    return siteDir;
}

/**
 * The search index is built from the rendered pages, which the dev server never writes. So for `npm run docs`, build the
 * site in the background and hand its search index to the dev server (which reloads the page when it lands).
 * It rebuilds a few seconds after you stop editing docs/, so search keeps up with your edits.
 */
function keepSearchIndexUpToDate() {
    const siteDir = createLinkedSiteDir(path.join(websiteDir, '.dev', 'search-site'));
    const outDir = path.join(siteDir, 'build');
    const logPath = path.join(siteDir, 'build.log');

    let running;
    let rerunWhenDone = false;
    const build = () => {
        if (running) {
            //one at a time: build again once this one finishes, so the index ends up with the newest edits
            rerunWhenDone = true;
            return;
        }
        const startedAt = Date.now();
        const log = fs.openSync(logPath, 'w');
        running = spawn(process.execPath, [docusaurusBin, 'build', siteDir, '--config', path.join(websiteDir, 'docusaurus.config.js'), '--out-dir', outDir], {
            cwd: websiteDir,
            stdio: ['ignore', log, log],
            //(a broken link you're in the middle of fixing shouldn't block search)
            env: { ...process.env, DOCS_STRICT_LINKS: 'false' }
        });
        running.on('exit', (code) => {
            fs.closeSync(log);
            running = undefined;
            const indexPath = path.join(outDir, 'search-index.json');
            if (code !== 0 || !fs.existsSync(indexPath)) {
                console.warn(`[site] WARNING: couldn't build the search index, so search won't be up to date in the dev server. See ${logPath}`);
            } else {
                fs.mkdirSync(devLiveDir, { recursive: true });
                fs.copyFileSync(indexPath, path.join(devLiveDir, 'search-index.json'));
                console.log(`[site] search index updated (${Math.round((Date.now() - startedAt) / 1000)}s, ${describeFileSize(indexPath)})`);
            }
            if (rerunWhenDone) {
                rerunWhenDone = false;
                build();
            }
        });
    };

    console.log('[site] building the search index in the background (the page reloads when it\'s ready)...');
    build();

    let timer;
    fs.watch(docsDir, { recursive: true }, (event, fileName) => {
        //only page edits (the tooling's own output, like this build, lives in the same folder)
        const relativePath = fileName?.replace(/\\/g, '/');
        if (!relativePath || isExcluded(relativePath) || !/(\.mdx?|sidebar\.json)$/i.test(relativePath)) {
            return;
        }
        clearTimeout(timer);
        timer = setTimeout(build, 3000);
    });
}

/**
 * Make sure every page in docs/ is in docs/sidebar.json (see sidebar.mjs).
 * Locally, missing pages are added with a best guess (and deleted ones removed). In CI, it fails instead, so PRs can't forget.
 */
function syncSidebar() {
    const result = syncSidebarFile(docsDir, { write: !process.env.CI });
    const sidebarPath = path.relative(repoDir, result.sidebarPath);
    if (process.env.CI) {
        const problems = [
            ...result.added.map(x => `  - "${x.file}" isn't listed`),
            ...result.removed.map(x => `  - "${x}" is listed, but that page doesn't exist`),
            //(pages that were just added to "Uncategorized" are already reported as not listed)
            ...result.other.filter(x => !result.added.some(y => y.file === x)).map(x => `  - "${x}" is in the "${otherCategoryLabel}" category. Move it to a real one`)
        ];
        if (problems.length > 0) {
            throw new Error(`${sidebarPath} is out of date:\n${problems.join('\n')}\nRun \`npm run docs\` or \`npm run build-docs\` locally (they update ${sidebarPath} for you), move any new pages to the right category, and commit it.`);
        }
        return;
    }
    for (const placement of result.added) {
        console.log(`[site] added "${placement.file}" to ${sidebarPath} under "${placement.category}" (${placement.reason}). Move it if that's not the right spot.`);
    }
    for (const file of result.other) {
        console.warn(`[site] WARNING: "${file}" is in the "${otherCategoryLabel}" category of ${sidebarPath}. Move it to a real category before you open a PR (CI fails until you do).`);
    }
    for (const file of result.removed) {
        console.log(`[site] removed "${file}" from ${sidebarPath}, since that page no longer exists`);
    }
}

/**
 * Regenerate the reference pages from package.json (see scripts/reference.mjs).
 * Locally, they're rewritten. In CI, it fails instead if they're out of date (or a setting has no description).
 */
function syncReference() {
    const result = syncReferencePages({ write: !process.env.CI });
    if (process.env.CI) {
        const problems = [
            ...result.outOfDate.map(x => `  - docs/${x} is out of date with package.json`),
            ...result.problems.map(x => `  - ${x}`)
        ];
        if (problems.length > 0) {
            throw new Error(`The reference docs need attention:\n${problems.join('\n')}\nRun \`npm run build-docs\` locally (it regenerates them for you), fix anything above, and commit the result.`);
        }
        return;
    }
    for (const file of result.outOfDate) {
        console.log(`[site] regenerated docs/${file} from package.json`);
    }
    for (const problem of result.problems) {
        console.warn(`[site] WARNING: ${problem} (CI fails until this is fixed)`);
    }
}

/**
 * A file's size, and its gzipped size (what browsers actually download from GitHub Pages), i.e. `660 KB, 140 KB gzipped`
 */
function describeFileSize(filePath) {
    const contents = fs.readFileSync(filePath);
    const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
    return `${kb(contents.length)}, ${kb(zlib.gzipSync(contents).length)} gzipped`;
}

const [command, ...rest] = process.argv.slice(2);
try {
    if (command === 'start') {
        syncReference();
        syncSidebar();
        fs.rmSync(devLiveDir, { recursive: true, force: true });
        fs.mkdirSync(devLiveDir, { recursive: true });
        //an empty search index until the real one is built, so search finds nothing instead of loading the dev server's html page as json
        fs.writeFileSync(path.join(devLiveDir, 'search-index.json'), '[]');
        keepSearchIndexUpToDate();
        //docusaurus.config.js serves this folder next to the live docs
        await docusaurusAsync(['start', ...rest], { DOCS_DEV_LIVE_DIR: devLiveDir });
    } else if (command === 'build') {
        syncReference();
        syncSidebar();
        fs.rmSync(buildDir, { recursive: true, force: true });
        docusaurus(['build', '--out-dir', buildDir, ...rest]);
        console.log(`\n[site] built the site into ${buildDir}`);
    } else if (command === 'serve') {
        docusaurus(['serve', '--dir', buildDir, ...rest]);
    } else {
        throw new Error(`Unknown command "${command}". Expected "start", "build" or "serve"`);
    }
} catch (e) {
    console.error(`\n[site] ERROR: ${e.message}`);
    process.exit(1);
}
