const esbuild = require('esbuild');
const fsExtra = require('fs-extra');
const path = require('path');
const bscVersion = require('./node_modules/brighterscript/package.json').version;

class Plugin {
    constructor() {
        this.name = 'empty-loader';
    }
    setup(build) {
        build.onResolve({ filter: /^chokidar$/ }, args => ({
            path: args.path,
            namespace: 'empty-loader'
        }));
        build.onLoad({ filter: /.*/, namespace: 'empty-loader' }, () => ({
            contents: '/*chokidar is not necessary for the language server so we replaced it with an empty object to fix esbuild issues*/\nmodule.exports = {}'
        }));
    }
}

//roku-test-automation's client/dist/utils.js uses `__dirname + '/../...'` to locate
//its JSON schema files and its on-device component bundle. When bundled into
//dist/extension.js, `__dirname` becomes the extension's `dist/` folder, so those
//paths are wrong. This plugin rewrites them to point at `dist/rta/...`; a post-build
//step copies the real files into that folder.
class RtaDirnamePlugin {
    constructor() {
        this.name = 'rta-dirname-rewrite';
    }
    setup(build) {
        build.onLoad({ filter: /roku-test-automation[\\/]client[\\/]dist[\\/]utils\.js$/ }, (args) => {
            let contents = fsExtra.readFileSync(args.path, 'utf8');
            //order matters: replace longer/more-specific patterns before the generic '/../'
            contents = contents
                .replace(/__dirname \+ '\/\.\.\/\.\.\/device'/g, `__dirname + '/rta/device'`)
                .replace(/__dirname \+ '\/\.\.\/rta-config\.schema\.json'/g, `__dirname + '/rta/rta-config.schema.json'`)
                .replace(/__dirname \+ '\/\.\.\/'/g, `__dirname + '/rta/'`);
            return { contents: contents, loader: 'js' };
        });
    }
}

esbuild.build({
    entryPoints: {
        'extension': './src/extension.ts',
        'extension-web': './src/extension-web.ts',
        'LanguageServerRunner': './src/LanguageServerRunner.ts',
        'brighterscript': './node_modules/brighterscript/dist/index.js',
        //brighterscript spawns a worker thread from `${__dirname}/run.js`; bundle that entry
        //point to `dist/run.js` so the bundled brighterscript.js can locate it at runtime
        'run': './node_modules/brighterscript/dist/lsp/worker/run.js'
    },
    bundle: true,
    sourcemap: true,
    splitting: false, //enable this once esbuild supports commonjs code splitting
    treeShaking: true,
    watch: process.argv.includes('--watch'),
    minify: true, //process.argv.includes('--minify'),
    mainFields: ['module', 'main'],
    entryNames: '[name]',
    outdir: 'dist',
    external: [
        'vscode'
    ],
    define: {
        // Inject the embedded brighterscript version at bundle time so
        // LanguageServerManager can display it without require.resolve()
        BSC_EMBEDDED_VERSION: JSON.stringify(bscVersion)
    },
    format: 'cjs',
    platform: 'node',
    logLevel: 'info',
    plugins: [new Plugin(), new RtaDirnamePlugin()]
}).then(() => {
    //copy roku-test-automation's runtime data files (JSON schemas + on-device component bundle)
    //into dist/rta so the paths rewritten by RtaDirnamePlugin resolve correctly
    const rtaSrc = path.join(__dirname, 'node_modules', 'roku-test-automation');
    const rtaDst = path.join(__dirname, 'dist', 'rta');
    fsExtra.ensureDirSync(rtaDst);
    for (const file of ['requestArgs.schema.json', 'requestTypes.schema.json', 'rta-config.schema.json']) {
        fsExtra.copySync(path.join(rtaSrc, 'client', file), path.join(rtaDst, file));
    }
    fsExtra.copySync(path.join(rtaSrc, 'device'), path.join(rtaDst, 'device'));
}).catch((e) => {
    console.error(e);
    process.exit(1);
});
