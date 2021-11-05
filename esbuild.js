const esbuild = require('esbuild')
const fsExtra = require('fs-extra');

class Plugin {
    constructor() {
        this.name = 'empty-loader'
    }
    setup(build) {
        build.onResolve({ filter: /^chokidar$/ }, args => ({
            path: args.path,
            namespace: 'empty-loader',
        }))
        build.onLoad({ filter: /.*/, namespace: 'empty-loader' }, () => ({
            contents: '/*chokidar is not necessary for the language server so we replaced it with an empty object to fix esbuild issues*/\nmodule.exports = {}',
        }))
    }
}

esbuild.build({
    entryPoints: {
        'extension': './src/extension.ts',
        'extension-web': './src/extension-web.ts',
        'LanguageServerRunner': './src/LanguageServerRunner.ts',
        'brighterscript': './node_modules/brighterscript/dist/index.js'
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
    format: 'cjs',
    platform: 'node',
    logLevel: 'info',
    plugins: [new Plugin()]
}).catch((e) => console.error(e));
