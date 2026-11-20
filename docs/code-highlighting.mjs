/**
 * Syntax highlighting for code blocks, done at build time with Shiki (https://shiki.style).
 *
 * Shiki uses the same TextMate grammars and themes as VS Code, so BrightScript code looks exactly like it does in this
 * extension: it uses this repo's own grammar (syntaxes/brightscript.tmLanguage.json).
 *
 * Supported code block options (same syntax as docusaurus):
 *   ```brightscript title="source/main.brs"      a title bar above the code
 *   ```brightscript {2,4-6}                      highlight lines 2 and 4 through 6
 *   ```brightscript showLineNumbers              line numbers
 *   print "hi" ' [!code highlight]               highlight a single line from a comment in the code
 */
import fs from 'node:fs';
import path from 'node:path';
import rehypeShiki from '@shikijs/rehype';
import { transformerMetaHighlight, transformerNotationHighlight } from '@shikijs/transformers';
import { repoDir } from './config.mjs';

export const grammarPath = path.join(repoDir, 'syntaxes', 'brightscript.tmLanguage.json');

/**
 * All the text in a hast node
 */
function toText(node) {
    if (node.type === 'text') {
        return node.value;
    }
    return (node.children ?? []).map(toText).join('');
}

/**
 * Docusaurus-style code block options that shiki doesn't handle on its own
 * @type {import('shiki').ShikiTransformer}
 */
const transformerDocusaurusMeta = {
    name: 'docusaurus-meta',
    pre(node) {
        //the code for the copy button: the rendered text, so it doesn't include `[!code ...]` comments (which shiki already removed)
        node.properties['data-code'] = toText(node);

        const meta = this.options.meta?.__raw ?? '';
        const title = /\btitle=(["'])(.*?)\1/.exec(meta)?.[2];
        if (title) {
            node.properties['data-title'] = title;
        }
        if (/\bshowLineNumbers\b/.test(meta)) {
            this.addClassToHast(node, 'line-numbers');
        }
    }
};

/**
 * The rehype plugin (and its options) that highlights every code block in the docs
 * @returns {[typeof rehypeShiki, import('@shikijs/rehype').RehypeShikiOptions]}
 */
export function getRehypeCodeHighlighting() {
    const brightscriptGrammar = JSON.parse(fs.readFileSync(grammarPath, 'utf8'));

    return [rehypeShiki, {
        //VS Code's default themes. Dark mode swaps to the `--shiki-dark` colors (see custom.css)
        themes: {
            light: 'light-plus',
            dark: 'dark-plus'
        },
        langs: [
            {
                ...brightscriptGrammar,
                name: 'brightscript',
                //the docs use all sorts of names for brightscript code blocks (and shiki is case sensitive)
                aliases: ['brighterscript', 'BrightScript', 'BrighterScript', 'brs', 'bs', 'vb']
            },
            'typescript',
            'javascript',
            'json',
            'jsonc',
            'bash',
            'shell',
            'powershell',
            'xml',
            'ini',
            'dotenv'
        ],
        fallbackLanguage: 'text',
        transformers: [
            transformerMetaHighlight(),
            transformerNotationHighlight({ matchAlgorithm: 'v3' }),
            transformerDocusaurusMeta
        ]
    }];
}
