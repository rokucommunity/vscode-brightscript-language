import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
    // Consult https://svelte.dev/docs#compile-time-svelte-preprocess
    // for more information about preprocessors
    preprocess: vitePreprocess(),
    compilerOptions: {
        // Keep Svelte-4-style `new Component({ target })` bootstrap in main.ts working under Svelte 5
        compatibility: { componentApi: 4 },
        // Single source of warning suppression for vite build, svelte-check, and the VS Code svelte extension
        warningFilter: (warning) => {
            return !warning.code.startsWith('a11y_') && warning.code !== 'node_invalid_placement_ssr';
        }
    }
};
