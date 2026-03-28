import * as fs from 'fs';
import * as tm from 'vscode-textmate';
import * as oniguruma from 'vscode-oniguruma';
import { Cache } from 'brighterscript/dist/Cache';
import { parseGrammarTestCase, runGrammarTestCase } from 'vscode-tmgrammar-test/dist/src/unit/index.js';
import { getErrorResultText } from './grammerTestHelpers.spec';
import { standardizePath as s } from 'brighterscript';

const brightscriptTmLanguagePath = s`${__dirname}/../../syntaxes/brightscript.tmLanguage.json`;
const cdataTmLanguagePath = s`${__dirname}/../../syntaxes/brightscript-cdata.tmLanguage.json`;

/**
 * A minimal XML grammar stub sufficient for injection testing.
 * The real text.xml grammar is built into VS Code; for unit tests we only
 * need a grammar with the right scopeName so the injection selector
 * `L:text.xml` has something to attach to.
 */
const minimalXmlGrammar = JSON.stringify({
    name: 'XML',
    scopeName: 'text.xml',
    patterns: [
        { match: '[\\s\\S]', name: 'text.xml' }
    ],
    repository: {}
});

function createRegistryWithInjections(): tm.Registry {
    const wasmPath = require.resolve('vscode-oniguruma').replace(/main\.js$/, 'onig.wasm');
    const wasmBin = fs.readFileSync(wasmPath).buffer;
    const vscodeOnigurumaLib = oniguruma.loadWASM(wasmBin).then(() => ({
        createOnigScanner: (patterns: string[]) => new oniguruma.OnigScanner(patterns),
        createOnigString: (str: string) => new oniguruma.OnigString(str)
    }));

    const grammarIndex: Record<string, tm.IRawGrammar> = {
        'text.xml': tm.parseRawGrammar(minimalXmlGrammar, 'text.xml.json'),
        'source.brs': tm.parseRawGrammar(fs.readFileSync(brightscriptTmLanguagePath).toString(), brightscriptTmLanguagePath),
        'source.brs.embedded.xml': tm.parseRawGrammar(fs.readFileSync(cdataTmLanguagePath).toString(), cdataTmLanguagePath)
    };

    return new tm.Registry({
        onigLib: vscodeOnigurumaLib,
        loadGrammar: (scopeName) => {
            if (grammarIndex[scopeName]) {
                return Promise.resolve(grammarIndex[scopeName]);
            }
            console.warn(`grammar not found for "${scopeName}"`);
            return null;
        },
        getInjections: (scopeName) => {
            if (scopeName === 'text.xml') {
                return ['source.brs.embedded.xml'];
            }
            return [];
        }
    });
}

describe('brightscript-cdata.tmLanguage.json', () => {
    const registries = new Cache<string, tm.Registry>();

    // Uses `'` as the comment token (single char) so `^` assertions align with source columns.
    // The test grammar scope is text.xml but assertions are written as BrightScript line comments.
    async function testGrammar(testCaseText: string) {
        testCaseText = `' SYNTAX TEST "text.xml" +AllowMiddleLineAssertions` + testCaseText;
        const registry = registries.getOrAdd('cdata', createRegistryWithInjections);
        const testCase = parseGrammarTestCase(testCaseText);
        const result = await runGrammarTestCase(registry, testCase);
        if (result.length > 0) {
            const text = getErrorResultText('test.xml', testCase, result);
            throw new Error(`\nFound ${result.length} issues with grammar:\n${text}`);
        }
    }

    it('marks CDATA begin delimiter with punctuation scope', async () => {
        // <![CDATA[ starts at col 0; `'` at col -1 is impossible, so assert on inner chars (col 1+)
        await testGrammar(`
 <![CDATA[
 '^^^^^^^^^ punctuation.definition.string.begin.xml
 sub init()
 end sub
 ]]>
        `);
    });

    it('marks CDATA end delimiter with punctuation scope', async () => {
        await testGrammar(`
 <![CDATA[
 sub init()
 end sub
 ]]>
 '^^^ punctuation.definition.string.end.xml
        `);
    });

    it('applies meta.embedded.block.brs scope to CDATA content', async () => {
        await testGrammar(`
 <![CDATA[
 sub init()
 '^^^^^^^^^ meta.embedded.block.brs
 end sub
 '^^^^^^^ meta.embedded.block.brs
 ]]>
        `);
    });

    it('colors sub/end sub keywords inside CDATA', async () => {
        await testGrammar(`
 <![CDATA[
 sub doSomething()
'^^^ keyword.declaration.function.brs
 end sub
'^^^^^^^ keyword.declaration.function.brs
 ]]>
        `);
    });

    it('colors function/end function keywords inside CDATA', async () => {
        await testGrammar(`
 <![CDATA[
 function getValue() as string
 '^^^^^^^ keyword.declaration.function.brs
 end function
 '^^^^^^^^^^^ keyword.declaration.function.brs
 ]]>
        `);
    });

    it('colors string literals inside CDATA', async () => {
        await testGrammar(`
 <![CDATA[
 x = "hello"
 '    ^^^^^^^ string.quoted.double.brs
 ]]>
        `);
    });

    it('colors numeric literals inside CDATA', async () => {
        await testGrammar(`
 <![CDATA[
 x = 42
 '    ^^ constant.numeric.brs
 ]]>
        `);
    });

    it('colors line comments inside CDATA', async () => {
        await testGrammar(`
 <![CDATA[
 x = 1 ' this is a comment
 '     '^^^^^^^^^^^^^^^^^^^^ comment.line.apostrophe.brs
 ]]>
        `);
    });

    it('does not apply BrightScript scopes outside CDATA', async () => {
        await testGrammar(`
 <component name="MyScene" extends="Scene">
 '</component>
 '  ^^^^^^^^^ - keyword.declaration.function.brs
        `);
    });
});
