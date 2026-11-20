/**
 * Settings shared by docusaurus.config.js and scripts/site.mjs.
 *
 * The docs folder is both the markdown and the Docusaurus site that renders it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

//realpath.native gives the path's true casing. On Windows, a lowercase drive letter (`c:\` vs `C:\`, i.e. from VS Code's terminal)
//otherwise makes webpack load some modules twice and spew "multiple modules with names that only differ in casing" warnings
export const websiteDir = fs.realpathSync.native(path.dirname(fileURLToPath(import.meta.url)));
export const repoDir = path.resolve(websiteDir, '..');

/**
 * Where the site is hosted. If we move to a custom domain, change these to that domain and `/`, and add a `static/CNAME` file.
 */
export const siteUrl = 'https://rokucommunity.github.io';
export const baseUrl = '/vscode-brightscript-language/';

/**
 * The markdown to build (the same folder as the site tooling. See `excludedPaths` in sidebar.mjs)
 */
export const docsDir = websiteDir;

/**
 * Whether broken links fail the build. Turned off for the dev server's background search index build, so a link you're in the
 * middle of fixing doesn't block search
 */
export const strictLinks = process.env.DOCS_STRICT_LINKS !== 'false';

/**
 * The branch that "Edit this page" links point to
 */
export const editBranch = 'master';
