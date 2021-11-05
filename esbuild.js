const esbuild = require('esbuild')

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
    entryPoints: ['./src/index.ts', './src/LanguageServerRunner.ts'],
    bundle: true,
    sourcemap: true,
    watch: process.argv.includes('--watch'),
    minify: true,
    outdir: 'dist',
    define: {
        EMBEDDED_BRIGHTERSCRIPT_PATH: '"dist/index.js"',
        EMBEDDED_BRIGHTERSCRIPT_VERSION: `"${require('brighterscript/package.json').version}"`
    },
    external: [
        'vscode'
    ],
    format: 'cjs',
    platform: 'node',
    logLevel: 'info',
    plugins: [
        plugin
    ]
}).catch((e) => console.error(e));