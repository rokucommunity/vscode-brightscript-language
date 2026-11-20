// @ts-check
import { themes as prismThemes } from 'prism-react-renderer';
import path from 'node:path';
import { docsDir, strictLinks, siteUrl, baseUrl, editBranch, websiteDir } from './config.mjs';
import { createSidebarItemsGenerator, excludedGlobs } from './sidebar.mjs';
import { getRehypeCodeHighlighting } from './code-highlighting.mjs';
import remarkGithubAlerts from './remark-github-alerts.mjs';

const repoUrl = 'https://github.com/rokucommunity/vscode-brightscript-language';
const title = 'BrightScript Language';

/**
 * See scripts/site.mjs for how the site gets built and served.
 * @type {import('@docusaurus/types').Config}
 */
const config = {
    title: title,
    tagline: 'The BrightScript and BrighterScript extension for VS Code',
    favicon: 'img/logo.png',
    url: siteUrl,
    baseUrl: baseUrl,
    trailingSlash: false,

    organizationName: 'rokucommunity',
    projectName: 'vscode-brightscript-language',

    onBrokenLinks: strictLinks ? 'throw' : 'warn',
    onBrokenAnchors: 'warn',

    markdown: {
        //treat .md files as plain CommonMark (not MDX) so regular README-style markdown just works.
        //Use a .mdx extension if a page ever needs React components.
        format: 'detect',
        hooks: {
            onBrokenMarkdownLinks: strictLinks ? 'throw' : 'warn'
        }
    },

    plugins: [
        //patches for the search plugin
        function searchFixes() {
            return {
                name: 'search-fixes',
                configureWebpack: () => ({
                    module: {
                        rules: [
                            //highlight the words that actually matched (search is fuzzy), not the ones you typed (see scripts/search-highlight-loader.cjs)
                            {
                                test: /[\\/]@easyops-cn[\\/]docusaurus-search-local[\\/]dist[\\/]client[\\/]client[\\/]theme[\\/]worker\.js$/,
                                enforce: 'pre',
                                use: [path.join(websiteDir, 'scripts', 'search-highlight-loader.cjs')]
                            },
                            //load search in the background once the page is idle, not when you first touch the search box (see scripts/search-preload-loader.cjs)
                            {
                                test: /[\\/]@easyops-cn[\\/]docusaurus-search-local[\\/]dist[\\/]client[\\/]client[\\/]theme[\\/]SearchBar[\\/]SearchBar\.jsx$/,
                                enforce: 'pre',
                                use: [path.join(websiteDir, 'scripts', 'search-preload-loader.cjs')]
                            },
                            //the plugin's generated files import modules by absolute path, sometimes with a lowercase drive letter on Windows,
                            //which makes webpack load them twice. Fix their casing (see scripts/path-casing-loader.cjs)
                            process.platform === 'win32' && {
                                test: /[\\/]\.docusaurus[\\/]@easyops-cn[\\/]docusaurus-search-local[\\/].*\.js$/,
                                enforce: 'pre',
                                use: [path.join(websiteDir, 'scripts', 'path-casing-loader.cjs')]
                            }
                        ].filter(Boolean)
                    }
                })
            };
        },
        //`npm run docs` only: serve the search index that scripts/site.mjs builds in the background
        process.env.DOCS_DEV_LIVE_DIR && function serveDevSearchIndex() {
            return {
                name: 'serve-dev-search-index',
                configureWebpack: () => ({
                    //the search plugin only searches in production builds, but scripts/site.mjs gives the dev server a real index
                    module: {
                        rules: [{
                            test: /[\\/]@easyops-cn[\\/]docusaurus-search-local[\\/]dist[\\/]client[\\/].*\.jsx?$/,
                            enforce: 'pre',
                            use: [path.join(websiteDir, 'scripts', 'search-dev-loader.cjs')]
                        }]
                    },
                    devServer: {
                        static: [
                            //reload the page when it changes (i.e. a fresh search index lands)
                            {
                                publicPath: baseUrl,
                                directory: process.env.DOCS_DEV_LIVE_DIR,
                                serveIndex: false,
                                watch: true
                            }
                        ]
                    }
                })
            };
        }
    ].filter(Boolean),

    themes: [
        //full-text search, indexed at build time (no external service). The index comes from the built pages, so
        //`npm run docs` builds it in the background (see scripts/site.mjs)
        ['@easyops-cn/docusaurus-search-local', /** @type {import('@easyops-cn/docusaurus-search-local').PluginOptions} */ ({
            hashed: true,
            docsRouteBasePath: '/',
            //(absolute, since the dev server's background index build runs from another site folder. See scripts/site.mjs)
            docsDir: docsDir,
            indexBlog: false,
            indexPages: false,
            //keep common English words like "for", "if", "and", "not" and "while" searchable: they're BrightScript keywords
            removeDefaultStopWordFilter: ['en'],
            highlightSearchTermsOnTargetPage: true,
            searchResultLimits: 10,
            searchResultContextMaxLength: 80,
            explicitSearchResultPath: true
        })]
    ],

    presets: [
        [
            'classic',
            /** @type {import('@docusaurus/preset-classic').Options} */
            ({
                docs: {
                    path: docsDir,
                    routeBasePath: '/',
                    //the docs folder is also the site tooling's folder, so skip everything that isn't a page
                    exclude: ['**/_*.{js,jsx,ts,tsx,md,mdx}', '**/_*/**', ...excludedGlobs],
                    sidebarItemsGenerator: createSidebarItemsGenerator(docsDir),
                    //must run before docusaurus' own admonitions plugin, which turns the result into admonitions
                    beforeDefaultRemarkPlugins: [remarkGithubAlerts],
                    rehypePlugins: [getRehypeCodeHighlighting()],
                    //docPath is the file's path within docs/
                    editUrl: ({ docPath }) => `${repoUrl}/edit/${editBranch}/docs/${docPath}`
                },
                blog: false,
                pages: false,
                theme: {
                    customCss: './src/css/custom.css'
                }
            })
        ]
    ],

    themeConfig:
        /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
        ({
            //for search engines and link previews (i.e. Slack). Each doc page also gets its own description from its first paragraph
            metadata: [
                { name: 'description', content: 'Documentation for the BrightScript Language extension for VS Code: debugging, language features and tooling for Roku development.' }
            ],
            colorMode: {
                defaultMode: 'light',
                respectPrefersColorScheme: true
            },
            docs: {
                sidebar: {
                    hideable: true
                }
            },
            navbar: {
                title: title,
                logo: { alt: title, src: 'img/logo.png' },
                //white text on the purple bar in both color modes (the color itself is set in custom.css)
                style: 'dark',
                items: [
                    { href: 'https://marketplace.visualstudio.com/items?itemName=RokuCommunity.brightscript', label: 'Marketplace', position: 'right' },
                    { href: repoUrl, label: 'GitHub', position: 'right' }
                ]
            },
            footer: {
                style: 'dark',
                links: [
                    {
                        title: 'Community',
                        items: [
                            { label: 'RokuCommunity', href: 'https://rokucommunity.github.io' },
                            { label: 'Issues', href: `${repoUrl}/issues` },
                            { label: 'Roku Developers Slack', href: 'https://join.slack.com/t/rokudevelopers/shared_invite/zt-4vw7rg6v-NH46oY7hTktpRIBM_zGvwA' }
                        ]
                    },
                    {
                        title: 'More',
                        items: [
                            { label: 'GitHub', href: repoUrl },
                            { label: 'VS Code Marketplace', href: 'https://marketplace.visualstudio.com/items?itemName=RokuCommunity.brightscript' },
                            { label: 'Open VSX', href: 'https://open-vsx.org/extension/RokuCommunity/brightscript' },
                            { label: 'Edit these docs', href: `${repoUrl}/tree/${editBranch}/docs` }
                        ]
                    }
                ],
                copyright: `Copyright © ${new Date().getFullYear()} RokuCommunity. Built with Docusaurus.`
            },
            //docs code blocks are highlighted by shiki (see code-highlighting.mjs). Prism only handles code in React pages
            prism: {
                theme: prismThemes.vsLight,
                darkTheme: prismThemes.vsDark
            }
        })
};

export default config;
