import * as path from 'path';
import { Cache } from 'brighterscript/dist/Cache';
import { createRegistry, parseGrammarTestCase, runGrammarTestCase } from 'vscode-tmgrammar-test/dist/src/unit/index.js';
import { getErrorResultText } from './grammerTestHelpers.spec';
import { standardizePath as s } from 'brighterscript';

const brightscriptTmlanguagePath = s`${__dirname}/../../syntaxes/brightscript.tmLanguage.json`;

describe('brightscript.tmlanguage.json', () => {
    it('bool assignment', async () => {
        await testGrammar(`
             thing = true
            '^^^^^ entity.name.variable.local.brs
            '      ^ keyword.operator.brs
            '        ^^^^ constant.language.boolean.true.brs
        `);
    });
});

const registries = new Cache();
async function testGrammar(testCaseText: string) {
    testCaseText = `' SYNTAX TEST "source.brs"  +AllowMiddleLineAssertions` + testCaseText;
    const registry = registries.getOrAdd(brightscriptTmlanguagePath, () => {
        const registry = createRegistry([brightscriptTmlanguagePath]);
        return registry;
    });
    const testCase = parseGrammarTestCase(testCaseText);

    const result = await runGrammarTestCase(registry, testCase);
    if (result.length > 0) {
        const text = getErrorResultText('test.brs', testCase, result);
        throw new Error(`\nFound ${result.length} issues with grammar:\n${text}`);
    }
}
