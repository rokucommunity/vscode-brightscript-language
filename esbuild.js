const esbuild = require('esbuild')
const fsExtra = require('fs-extra');

const plugin = {
    name: 'dummy-loader',
    setup(build) {
        build.onResolve({ filter: /^chokidar$/ }, args => ({
            path: args.path,
            namespace: 'dummy-loader',
        }))

        build.onLoad({ filter: /.*/, namespace: 'dummy-loader' }, () => ({
            contents: '/*chokidar is not necessary for the language server so we replaced it with an empty object to fix esbuild issues*/\nmodule.exports = {}',
        }))
    }
}

esbuild.build({
    entryPoints: ['./src/extension.ts', './src/extension-web.ts', './src/LanguageServerRunner.ts', './node_modules/brighterscript/dist/index.js'],
    bundle: true,
    sourcemap: true,
    splitting: true,
    watch: process.argv.includes('--watch'),
    minify: process.argv.includes('--minify'),
    mainFields: ['module', 'main'],
    entryNames: '[name]',
    outdir: 'dist',
    external: [
        'vscode'
    ],
    format: 'esm',
    platform: 'node',
    logLevel: 'info',
    plugins: [
        plugin
    ]
}).then(() => {
    fsExtra.outputFileSync('dist/brighterscript.js',
        fsExtra.readFileSync('dist/index.js').toString().replace('=index.js.map', '=brighterscript.js.map')
    );
    fsExtra.removeSync('dist/index.js');
    fsExtra.renameSync('dist/index.js.map', 'dist/brightscript.js.map')
}).catch((e) => console.error(e));