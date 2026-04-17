const esbuild = require('esbuild');
const fsExtra = require('fs-extra');
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
        'vscode',
        //roku-test-automation uses __dirname to locate its JSON schema files at runtime,
        //which breaks when bundled. Keep it in node_modules so Node's module resolution works.
        'roku-test-automation'
    ],
    define: {
        // Inject the embedded brighterscript version at bundle time so
        // LanguageServerManager can display it without require.resolve()
        BSC_EMBEDDED_VERSION: JSON.stringify(bscVersion)
    },
    format: 'cjs',
    platform: 'node',
    logLevel: 'info',
    plugins: [new Plugin()]
}).catch((e) => console.error(e));
