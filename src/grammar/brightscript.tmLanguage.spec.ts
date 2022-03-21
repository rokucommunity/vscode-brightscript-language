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

    it('handles `as Function` parameters properly', async () => {
        await testGrammar(`
             function getStyle(builderFunc as Function, processorFunc as Function) as object
            '^^^^^^^^ storage.type.function.brs
            '         ^^^^^^^ entity.name.function.brs
            '                 ^ punctuation.definition.parameters.begin.brs
            '                  ^^^^^^^^^^^ variable.parameter.brs
            '                              ^^ keyword.control.as.brs
            '                                 ^^^^^^^^  entity.name.type.brs
            '                                           ^^^^^^^^^^^^^ variable.parameter.brs
            '                                                            ^^^^^^^^ entity.name.type.brs
            '                                                                    ^ punctuation.definition.parameters.end.brs
             end function
            '^^^^^^^^^^^^ storage.type.function.brs
        `);
    });

    it('handles `anonymous functions` parameters properly', async () => {
        await testGrammar(`
            sub main()
                 callback = function(builderFunc as Function)
                '^^^^^^^^ entity.name.variable.local.brs
                '           ^^^^^^^^ storage.type.function.brs
                '                    ^^^^^^^^^^^ variable.parameter.brs
                '                                ^^ keyword.control.as.brs
                '                                   ^^^^^^^^ entity.name.type.brs
                 end function
                '^^^^^^^^^^^^ storage.type.function.brs
            end sub
        `);
    });

    it('handles various function declarations', async () => {
        await testGrammar(`
             sub write()
            '^^^ storage.type.function.brs
            '    ^^^^^ entity.name.function.brs
            '         ^ punctuation.definition.parameters.begin.brs
            '          ^ punctuation.definition.parameters.end.brs
             end sub
            '^^^^^^^ storage.type.function.brs
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
