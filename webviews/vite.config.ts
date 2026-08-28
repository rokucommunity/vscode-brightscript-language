import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// https://vitejs.dev/config/
export default defineConfig({
    //webview pages load through a <base href> pointing at the bundle directory, so every emitted
    //asset url (script/css tags, css url() refs like the codicon font, ?url imports) must be
    //relative. The default root-absolute urls escape the base and 404 inside the webview origin.
    base: './',
    plugins: [
        svelte()
    ],
    build: {
        outDir: '../dist/webviews',
        emptyOutDir: true,
        minify: false,
        commonjsOptions: {
            //a file:-linked roku-test-automation resolves outside node_modules, escaping the default include
            include: [/node_modules/, /roku-test-automation/]
        }
    }
});
