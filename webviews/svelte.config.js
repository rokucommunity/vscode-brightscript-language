import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
    // Consult https://svelte.dev/docs#compile-time-svelte-preprocess
    // for more information about preprocessors
    preprocess: vitePreprocess(),
    compilerOptions: {
        // Keep Svelte-4-style `new Component({ target })` bootstrap in main.ts working under Svelte 5
        compatibility: { componentApi: 4 }
    },
    onwarn: (warning, handler) => {
        if (warning.code.startsWith('a11y-')) {
            return;
        }
        handler(warning);
    }
};
