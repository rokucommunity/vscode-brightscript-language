# BrightScript Language docs

The source for the [docs site](https://rokucommunity.github.io/vscode-brightscript-language/), built with [Docusaurus](https://docusaurus.io/). This folder holds both the pages (plain markdown) and the site tooling that renders them. This README documents the tooling and isn't a page on the site.

## Running locally
From the repo root:

```bash
npm run docs         # dev server with live reload, at http://localhost:3000/vscode-brightscript-language/
npm run build-docs   # the full site, into docs/build
```

Both commands run `npm install` in this folder first, so there's no separate install step. To preview the full build like production, run `npm run serve` in this folder after `build-docs`.

Search ([docusaurus-search-local](https://github.com/easyops-cn/docusaurus-search-local)) is indexed from the built pages. `npm run docs` builds that index in the background (about 30 seconds), at startup and again a few seconds after you stop editing a page, and reloads the page each time it's ready.

## Writing docs
- Add or edit a `.md` file in this folder. Regular GitHub-flavored markdown works, and the first `# heading` becomes the page title.
- Link to other pages with relative links like `[RALE](debugging/rale.md)`, same as on GitHub. Broken links fail the build.
- GitHub alerts (`> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`) render as callout boxes on the site.
- Code blocks are highlighted at build time by [Shiki](https://shiki.style) with VS Code's Light+/Dark+ themes. BrightScript blocks use this extension's own TextMate grammar ([`syntaxes/brightscript.tmLanguage.json`](../syntaxes/brightscript.tmLanguage.json)).
- Code blocks support the same options as Docusaurus: `title="launch.json"`, line ranges like `{2,4-6}`, and `showLineNumbers`. You can also highlight a single line with a `[!code highlight]` comment at the end of it.
- [`sidebar.json`](sidebar.json) controls the sidebar, which is also the order of the **Previous** / **Next** buttons. Its entries are pages (like the introduction, at the top) or categories of pages, and each page's `file` is its path within this folder. A page shows its own `# heading` in the sidebar unless you give it a `label`. The home page is [`index.md`](index.md). `npm run docs` and `npm run build-docs` add new pages to it with a best guess for where they belong (move them if the guess is wrong). A page with nothing in common with the others goes under "Uncategorized". CI fails if a page is missing from it, or if anything is still under "Uncategorized".
- The tooling lives next to the pages, so these aren't pages: this README, `src/`, `static/`, `scripts/`, `node_modules/`, `build/` and any dot folder (see `excludedPaths` in [`sidebar.mjs`](sidebar.mjs)).

## Deploying
[`.github/workflows/docs.yml`](../.github/workflows/docs.yml) builds the site and deploys it to GitHub Pages on every push to `master`. Pull requests are checked by the docs build in the main CI job.
