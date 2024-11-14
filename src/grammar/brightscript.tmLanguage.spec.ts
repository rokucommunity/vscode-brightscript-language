import { Cache } from 'brighterscript/dist/Cache';
import { createRegistry, parseGrammarTestCase, runGrammarTestCase } from 'vscode-tmgrammar-test/dist/src/unit/index.js';
import { getErrorResultText } from './grammerTestHelpers.spec';
import { standardizePath as s } from 'brighterscript';

const brightscriptTmlanguagePath = s`${__dirname}/../../syntaxes/brightscript.tmLanguage.json`;

describe('brightscript.tmlanguage.json', () => {
    it('colors numerics correctly', async () => {
        await testGrammar(`
            var = 1
           '      ^ constant.numeric.brs
           '^^^ entity.name.variable.local.brs
       `);

        await testGrammar(`
            var = 1.1
           '        ^ constant.numeric.brs
           '      ^ constant.numeric.brs
           '^^^ entity.name.variable.local.brs
       `);

        await testGrammar(`
            var = .1
           '       ^ constant.numeric.brs
           '^^^ entity.name.variable.local.brs
       `);

        await testGrammar(`
            var = 0x2
           '      ^^^ constant.numeric.brs
           '^^^ entity.name.variable.local.brs
       `);

        await testGrammar(`
            var = 1.8e+308
           '      ^^^^^^^^ constant.numeric.brs
           '^^^ entity.name.variable.local.brs
       `);

        await testGrammar(`
            var = 0x2
           '      ^^^ constant.numeric.brs
           '^^^ entity.name.variable.local.brs
       `);

        await testGrammar(`
            var = 0%
           '       ^ source.brs
           '      ^ constant.numeric.brs
           '^^^ entity.name.variable.local.brs
       `);

        await testGrammar(`
            var = 0!
           '       ^ source.brs
           '      ^ constant.numeric.brs
           '^^^ entity.name.variable.local.brs
       `);

        await testGrammar(`
            var = 0#
           '       ^ source.brs
           '      ^ constant.numeric.brs
           '^^^ entity.name.variable.local.brs
       `);

        await testGrammar(`
            var = 0&
           '       ^ source.brs
           '      ^ constant.numeric.brs
           '^^^ entity.name.variable.local.brs
       `);
    });

    it('colors m, m.top, m.global, and super correctly', async () => {
        await testGrammar(`
            super.doSomething()
           '^^^^^ keyword.other.this.brs
       `);

        await testGrammar(`
            this = m
           '       ^ keyword.other.this.brs
           '^^^^ entity.name.variable.local.brs
       `);

        await testGrammar(`
             m.global = true
            '  ^^^^^^ keyword.other.this.brs
            '^ keyword.other.this.brs
        `);

        await testGrammar(`
            m.top.visible = true
           '  ^^^ keyword.other.this.brs
           '^ keyword.other.this.brs
       `);
    });

    it('does not color `top` as a variable name', async () => {
        await testGrammar(`
            top = true
           '^^^ entity.name.variable.local.brs
        `);
    });

    it('does not color `top` when part of another variable name', async () => {
        await testGrammar(`
             m.top1 = true
            '  ^^^^ variable.other.object.property.brs
            '^ keyword.other.this.brs
        `);

        await testGrammar(`
            m.1top = true
           '  ^^^^ variable.other.object.property.brs
           '^ keyword.other.this.brs
       `);
    });

    it('colors alias statement properly', async () => {
        await testGrammar(`
             alias alpha = beta
                          '^^^^ entity.name.variable.local.brs
                        '^ keyword.operator.assignment.brs
                  '^^^^^ entity.name.variable.brs
            '^^^^^ keyword.declaration.alias.brs
        `);

        await testGrammar(`
            alias alpha=beta
                       '^^^^ entity.name.variable.local.brs
                      '^ keyword.operator.assignment.brs
                 '^^^^^ entity.name.variable.brs
           '^^^^^ keyword.declaration.alias.brs
        `);

        await testGrammar(`
           alias alpha = beta.charlie.delta
                        '^^^^ entity.name.variable.local.brs
                      '^ keyword.operator.assignment.brs
                '^^^^^ entity.name.variable.brs
          '^^^^^ keyword.declaration.alias.brs
        `);
    });

    it('colors normal conditional compile statements properly', async () => {
        await testGrammar(`
             #if true
            '^^^ keyword.preprocessor.if.brs
             #elseif false
            '^^^^^^^ keyword.preprocessor.elseif.brs
             #else
            '^^^^^ keyword.preprocessor.else.brs
             #endif
            '^^^^^^ keyword.preprocessor.endif.brs
        `);
    });

    it('colors composite keyword conditional compile statements properly', async () => {
        await testGrammar(`
             #const IS_DEV_MODE=true
            '^^^^^^ keyword.preprocessor.const.brs
             #error Something bad happened
            '^^^^^^ keyword.preprocessor.error.brs
             #if true
            '^^^ keyword.preprocessor.if.brs
             #else if false
            '^^^^^^^^ keyword.preprocessor.elseif.brs
             #else
            '^^^^^ keyword.preprocessor.else.brs
             #end if
            '^^^^^^^ keyword.preprocessor.endif.brs
        `);
    });

    it('colors leading whitespace conditional compile statements properly', async () => {
        //carrots should be shorter by 1 because \t turns into 1 char
        await testGrammar(`
             #\t const IS_DEV_MODE=true
            '^^^^^^^^ keyword.preprocessor.const.brs
             #\t error Something bad happened
            '^^^^^^^^ keyword.preprocessor.error.brs
             #\t if true
            '^^^^^ keyword.preprocessor.if.brs
             #\t else if false
            '^^^^^^^ keyword.preprocessor.elseif.brs
             #\t else
            '^^^^^^^ keyword.preprocessor.else.brs
             #\t end if
            '^^^^^^^^^ keyword.preprocessor.endif.brs
        `);
    });

    it('colors `continue for`', async () => {
        await testGrammar(`
            for i = 0 to 10
                continue for
                        '^^^ keyword.control.loop.brs
               '^^^^^^^^ keyword.control.loop.brs
            end for
        `);
    });

    it('colors `continue while`', async () => {
        await testGrammar(`
            while true
                continue while
                        '^^^^^ keyword.control.loop.brs
               '^^^^^^^^ keyword.control.loop.brs
            end for
        `);
    });

    it('colors strings correctly', async () => {
        await testGrammar(`
            print "hello world", true
                                '^^^^ constant.language.boolean.true.brs
                 '^^^^^^^^^^^^^ string.quoted.double.brs
           '^^^^^ keyword.control.brs
        `);
    });

    it('colors strings with escape-looking slash correctly', async () => {
        //FYI, the escaped backslash char makes the positions weird in this test.
        await testGrammar(`
            print "hello world\\", true
                                 '^^^^ constant.language.boolean.true.brs
                 '^^^^^^^^^^^^^^ string.quoted.double.brs
           '^^^^^ keyword.control.brs
        `);
    });

    it('uses proper color for variable named `component`', async () => {
        await testGrammar(`
            sub main()
                 for each component in []
                                   '^^ keyword.control.brs
                         '^^^^^^^^^ entity.name.variable.local.brs
                    '^^^^ keyword.control.brs
                '^^^ keyword.control.brs
                end for
            end sub
        `);
    });

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

    /**
     * @param test comment 123
     */

    it('handles comments following interface fields', async () => {
        await testGrammar(`
            interface Person
                name as string 'this is a comment
               '               ^^^^^^^^^^^^^^^^^^ punctuation.definition.comment.brs
               '        ^^^^^^ storage.type.brs
               '     ^^ keyword.control.as.brs
               '^^ variable.object.property.brs

               name as string
              '        ^^^^^^ storage.type.brs
              '     ^^ keyword.control.as.brs
              '^^ variable.object.property.brs
        `);
    });

    it('handles interface function with return type', async () => {
        await testGrammar(`
            interface Person
                sub test() as string 'this is a comment
               '                      ^^^^^^^^^^^^^^^^^ punctuation.definition.comment.brs
               '              ^^^^^^ storage.type.brs
               '           ^^ keyword.control.as.brs
               '         ^ punctuation.definition.parameters.end.brs
               '        ^ punctuation.definition.parameters.begin.brs
               '    ^^^^ entity.name.function.member.brs
               '^^^ storage.type.function.brs
        `);
    });

    describe('bsdoc', () => {
        //the grammar tester doesn't like testing standalone comments, so prefix all of the testable lines of code in this block with a single `t` identifier

        it('colorizes generic tags correctly', async () => {
            await testGrammar(`
                t'@unknownparam just comments
                '               ^^^^^^^^^^^^^ comment.block.documentation.brs
                '  ^^^^^^^^^^^^ storage.type.class.bsdoc
                ' ^ storage.type.class.bsdoc
                '^ comment.line.apostrophe.brs
            `);
        });

        /**
         * @param p1 comment one
         * @param {string} p1 comment one
         */
        it('colorizes @param without type', async () => {
            await testGrammar(`
                t'@param p1
                '        ^^ variable.other.bsdoc
                '  ^^^^^ storage.type.class.bsdoc
                ' ^ storage.type.class.bsdoc
                '^ comment.line.apostrophe.brs
            `);
        });

        it('colorizes @param', async () => {
            await testGrammar(`
                t'@param {boolean} p1
                '                  ^^ variable.other.bsdoc
                '                ^ punctuation.definition.bracket.curly.end.bsdoc
                '         ^^^^^^^ entity.name.type.instance.bsdoc
                '        ^ punctuation.definition.bracket.curly.begin.bsdoc
                '  ^^^^^ storage.type.class.bsdoc
                ' ^ storage.type.class.bsdoc
                '^ comment.line.apostrophe.brs
            `);
        });

        it('colorizes @param without name', async () => {
            await testGrammar(`
                t'@param {boolean}
                '                ^ punctuation.definition.bracket.curly.end.bsdoc
                '         ^^^^^^^ entity.name.type.instance.bsdoc
                '        ^ punctuation.definition.bracket.curly.begin.bsdoc
                '  ^^^^^ storage.type.class.bsdoc
                ' ^ storage.type.class.bsdoc
                '^ comment.line.apostrophe.brs
            `);
        });

        it('colorizes @param with comment', async () => {
            await testGrammar(`
                t'@param {boolean} p1 this is a comment
                '                     ^^^^^^^^^^^^^^^^^ comment.block.documentation.brs
                '                  ^^ variable.other.bsdoc
                '                ^ punctuation.definition.bracket.curly.end.bsdoc
                '         ^^^^^^^ entity.name.type.instance.bsdoc
                '        ^ punctuation.definition.bracket.curly.begin.bsdoc
                '  ^^^^^ storage.type.class.bsdoc
                ' ^ storage.type.class.bsdoc
                '^ comment.line.apostrophe.brs
            `);
        });

        it('colorizes @type without type', async () => {
            await testGrammar(`
                t'@type p1
                '       ^^ variable.other.bsdoc
                '  ^^^^ storage.type.class.bsdoc
                ' ^ storage.type.class.bsdoc
                '^ comment.line.apostrophe.brs
            `);
        });

        it('colorizes @param', async () => {
            await testGrammar(`
                t'@type {boolean} p1
                '                 ^^ variable.other.bsdoc
                '               ^ punctuation.definition.bracket.curly.end.bsdoc
                '        ^^^^^^^ entity.name.type.instance.bsdoc
                '       ^ punctuation.definition.bracket.curly.begin.bsdoc
                '  ^^^^ storage.type.class.bsdoc
                ' ^ storage.type.class.bsdoc
                '^ comment.line.apostrophe.brs
            `);
        });

        it('colorizes @param without name', async () => {
            await testGrammar(`
                t'@type {boolean}
                '               ^ punctuation.definition.bracket.curly.end.bsdoc
                '        ^^^^^^^ entity.name.type.instance.bsdoc
                '       ^ punctuation.definition.bracket.curly.begin.bsdoc
                '  ^^^^ storage.type.class.bsdoc
                ' ^ storage.type.class.bsdoc
                '^ comment.line.apostrophe.brs
            `);
        });

        it('colorizes @param with comment', async () => {
            await testGrammar(`
                t'@type {boolean} p1 this is a comment
                '                    ^^^^^^^^^^^^^^^^^ comment.block.documentation.brs
                '                 ^^ variable.other.bsdoc
                '               ^ punctuation.definition.bracket.curly.end.bsdoc
                '        ^^^^^^^ entity.name.type.instance.bsdoc
                '       ^ punctuation.definition.bracket.curly.begin.bsdoc
                '  ^^^^ storage.type.class.bsdoc
                ' ^ storage.type.class.bsdoc
                '^ comment.line.apostrophe.brs
            `);
        });

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
