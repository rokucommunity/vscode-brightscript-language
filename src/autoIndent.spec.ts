import { readFileSync } from 'fs-extra';
import * as glob from 'glob';
import { expect } from 'chai';
import undent from 'undent';
interface IndentationRulesJSON {
    increaseIndentPattern: string;
    decreaseIndentPattern: string;
}
interface LanguageConfigurationJSON {
    indentationRules: IndentationRulesJSON;
}

describe('Language auto-indent rules', () => {
    const config: LanguageConfigurationJSON = JSON.parse(readFileSync(`${__dirname}/../language-configuration.json`).toString());

    it('indents AA literals', () => {
        expectIndentToEqual(undent``);
    });

    it('indents function with body', () => {
        expectIndentToEqual(undent`
            function autoIndent1(arg as Object) as void
                if true then
                    print "true"
                end if
            end function
        `);
    });

    it('indents for loop', () => {
        expectIndentToEqual(undent`
            for i=0 to 10
                print "i="; i
            end for

            for i=0 to 10
                print "i="; i
            endfor
        `);
    });

    it('indents anon functions', () => {
        expectIndentToEqual(undent`
            fn = sub()
                print "is fn"
            end sub

            fn = sub()
                print true
            endsub

            fn = function()
                print "is fn"
            end function

            fn = function()
                print true
            endfunction
        `);
    });

    it('indents AA literals', () => {
        expectIndentToEqual(undent`
            p = {
                x: 100
                y: 100,
                fn: sub(arg as object)
                    print "is p.fn"
                end sub
                fn2: sub(arg)
                    print "is p.fn"
                endsub
            }
        `);
    });

    it('indents if statement', () => {
        expectIndentToEqual(undent`
            if cond then
                print "has cond"; cond
                if cond2 then print "has cond2"; cond2
            else if cond2 then
                print "cond2"; cond2
            else if cond3
                print "cond2"; cond3
            else
                print "not cond"; cond
            end if
        `);
    });

    it('indents if without `then`', () => {
        expectIndentToEqual(undent`
            if(cond)
                print "has cond"; cond
                if(cond2)then print "has cond2"; cond2
            elseif (cond2) then
                print "cond2"; cond2
            elseif(cond3)then
                print "cond3"; cond3
            else
                print "not cond"; cond
            endif
        `);
    });

    it('should indent component body', () => {
        expectIndentToEqual(undent`
            component SomeComponent
                public ifaceField as string
            end component
        `);
    });

    function expectIndentToEqual(text: string, expected = text) {
        text = text.toString().trimRight().replace(/\r\n/g, '\n');
        expected = expected.toString().trimRight().replace(/\r\n/g, '\n');
        const actual = reIndent(text, config.indentationRules);
        expect(
            actual.split(/\r?\n/)
        ).to.eql(
            expected.split(/\r?\n/)
        );
    }

    function reIndent(text: string, rules: IndentationRulesJSON) {
        const reIncrease = new RegExp(rules.increaseIndentPattern);
        const reDecrease = new RegExp(rules.decreaseIndentPattern);
        const lines = text.split('\n');
        const indent = '    '; // expecting test cases to use 4 spaces for indent
        let depth = 0;
        let src = '';
        lines.forEach((line, index) => {
            const trimmed = line.trimLeft();
            if (trimmed === '') {
                src += '\n';
                return;
            }
            if (reDecrease.test(trimmed)) {
                depth--;
                if (depth < 0) {
                    throw new Error(`Negative indentation obtained at ${index}`);
                }
            }
            for (let i = 0; i < depth; i++) {
                src += indent;
            }
            src += trimmed;
            src += '\n';
            if (reIncrease.test(trimmed)) {
                depth++;
            }
        });
        return src.trimRight();
    }
});
