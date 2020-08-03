import { readFileSync } from 'fs-extra';
import * as glob from 'glob';
import { expect } from 'chai';

interface IndentationRulesJSON {
    increaseIndentPattern: string;
    decreaseIndentPattern: string;
}
interface LanguageConfigurationJSON {
    indentationRules: IndentationRulesJSON;
}

describe('Language auto-indent rules', () => {
    const config: LanguageConfigurationJSON = JSON.parse(readFileSync('./language-configuration.json').toString());

    it('should keep input indentation', () => {
        const files = glob('./test/autoIndent/**/*.brs', (err, matches) => {
            if (err) {
                throw new Error('No cases found');
            }
            matches.forEach(match => {
                const expected = readFileSync(match).toString().trimRight().replace(/\r\n/g, '\n');
                const actual = reIndent(match, expected, config.indentationRules);
                expect(actual).to.equal(expected);
            });
        });
    });
});

function reIndent(fileName: string, text: string, rules: IndentationRulesJSON) {
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
                throw new Error(`Negative indentation obtained at ${fileName}:${index}`);
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
