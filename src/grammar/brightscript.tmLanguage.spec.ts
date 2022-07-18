import * as path from 'path';
import { Cache } from 'brighterscript/dist/Cache';
import { createRegistry, parseGrammarTestCase, runGrammarTestCase } from 'vscode-tmgrammar-test/dist/src/unit/index.js';
import { getErrorResultText } from './grammerTestHelpers.spec';
import { standardizePath as s } from 'brighterscript';

const brightscriptTmlanguagePath = s`${__dirname}/../../syntaxes/brightscript.tmLanguage.json`;

describe('brightscript.tmlanguage.json', () => {
    it('allows 0+ space after import keyword', async () => {
        await testGrammar(`
             import"something.brs"
            '      ^^^^^^^^^^^^^^^ string.quoted.double.brs
            '^^^^^^ keyword.control.import.brs
             import "something.brs"
            '       ^^^^^^^^^^^^^^^ string.quoted.double.brs
            '^^^^^^ keyword.control.import.brs
             import    "something.brs"
            '          ^^^^^^^^^^^^^^^ string.quoted.double.brs
            '^^^^^^ keyword.control.import.brs
        `);
    });

    it('matches functions and properties in a chain', async () => {
        await testGrammar(`
             m.a().beta().c.delta = true
            '               ^^^^^ variable.other.object.property.brs
            '             ^ variable.other.object.property.brs
            '      ^^^^ entity.name.function.brs
            '  ^ entity.name.function.brs
            '^ keyword.other.this.brs
        `);
    });

    it('colors the const keyword', async () => {
        await testGrammar(`
             const API_KEY = true
            '                ^^^^ constant.language.boolean.true.brs
            '              ^ keyword.operator.brs
            '      ^^^^^^^ entity.name.variable.local.brs
            '^^^^^ storage.type.brs
            namespace Name.Space
                 const API_URL = "u/r/l"
                '                ^^^^^^^ string.quoted.double.brs
                '              ^ keyword.operator.brs
                '      ^^^^^^^ entity.name.variable.local.brs
                '^^^^^ storage.type.brs
            end namespace
        `);
    });

    it('bool assignment', async () => {
        await testGrammar(`
             thing = true
            '        ^^^^ constant.language.boolean.true.brs
            '      ^ keyword.operator.brs
            '^^^^^ entity.name.variable.local.brs
        `);
    });

    it('component statements', async () => {
        await testGrammar(`
             component MyButton
            '          ^^^^^^^^ entity.name.type.component.brs
            '^^^^^^^^^ storage.type.component.brs
             end component
            '^^^^^^^^^^^^^ storage.type.component.brs

             component MyButton extends Button
            '                           ^^^^^^ entity.name.type.component.brs
            '                   ^^^^^^^ storage.modifier.extends.brs
            '          ^^^^^^^^ entity.name.type.component.brs
            '^^^^^^^^^ storage.type.component.brs
             end component

             component "MyButton" extends "Button"
            '                             ^^^^^^^^ string.quoted.double.brs
            '                     ^^^^^^^ storage.modifier.extends.brs
            '          ^^^^^^^^^^ string.quoted.double.brs
            '^^^^^^^^^ storage.type.component.brs
             end component
        `);
    });

    it('highlights regex literals', async () => {
        await testGrammar(`
             /test(?>something)(?|asdf)/gmixsuXUAJ
            '                           ^^^^^^^^^^ string.regexp.brs keyword.other.brs
            '                          ^ string.regexp.brs punctuation.definition.string.end.brs
            '                         ^ meta.group.assertion.regexp
            '                     ^^^^ meta.group.assertion.regexp
            '                   ^^ meta.assertion.look-behind.regexp
            '                  ^ meta.group.assertion.regexp
            '                 ^ meta.group.regexp
            '        ^^^^^^^^^ string.regexp.brs meta.group.regexp
            '      ^^ punctuation.definition.group.no-capture.regexp
            '     ^ meta.group.regexp
            '^^^^^ string.regexp.brs
        `);
    });

    it.skip('handles `as Function` parameters properly', async () => {
        await testGrammar(`
             function getStyle(builderFunc as Function, processorFunc as Function) as object
            '                                                                    ^ punctuation.definition.parameters.end.brs
            '                                                            ^^^^^^^^ entity.name.type.brs
            '                                           ^^^^^^^^^^^^^ variable.parameter.brs
            '                                 ^^^^^^^^  entity.name.type.brs
            '                              ^^ keyword.control.as.brs
            '                  ^^^^^^^^^^^ variable.parameter.brs
            '                 ^ punctuation.definition.parameters.begin.brs
            '         ^^^^^^^ entity.name.function.brs
            '^^^^^^^^ storage.type.function.brs

             end function
            '^^^^^^^^^^^^ storage.type.function.brs
        `);
    });

    it.skip('handles `anonymous functions` parameters properly', async () => {
        await testGrammar(`
            sub main()
                 callback = function(builderFunc as Function)
                '                                   ^^^^^^^^ entity.name.type.brs
                '                                ^^ keyword.control.as.brs
                '                    ^^^^^^^^^^^ variable.parameter.brs
                '           ^^^^^^^^ storage.type.function.brs
                '^^^^^^^^ entity.name.variable.local.brs

                 end function
                '^^^^^^^^^^^^ storage.type.function.brs
            end sub
        `);
    });

    it.skip('handles various function declarations', async () => {
        await testGrammar(`
             sub write()
            '          ^ punctuation.definition.parameters.end.brs
            '         ^ punctuation.definition.parameters.begin.brs
            '    ^^^^^ entity.name.function.brs
            '^^^ storage.type.function.brs

             end sub
            '^^^^^^^ storage.type.function.brs
        `);
    });

    it.skip('colorizes class fields properly', async () => {
        //TODO the properties have the wrong scope...this should get fixed when we improve the class textmate scope flow
        await testGrammar(`
            class Person
                 firstName
                '^^^^^^^^^ entity.name.variable.local.brs

                 lastName as string
                '            ^^^^^^ support.type.primitive.brs
                '         ^^ keyword.control.as.brs
                '^^^^^^^^ entity.name.variable.local.brs

                 age as integer
                '    ^^ keyword.control.as.brs
                '^^^ entity.name.variable.local.brs
            end class
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
