/**
 * Adapted from https://github.com/PanAeon/vscode-tmgrammar-test/blob/master/src/unit.ts to simplify grammar testing
 */
import * as chalk from 'chalk';
import { EOL } from 'os';
import type { GrammarTestCase, TestFailure } from 'vscode-tmgrammar-test/dist/src/unit/index';

let terminalWidth = 75;
const Padding = '  ';

function getSourceLine(testCase: GrammarTestCase, failure: TestFailure) {
    const line = testCase.source[failure.srcLine];
    const pos = failure.line + 1 + ': ';
    const accents = ' '.repeat(failure.start) + '^'.repeat(failure.end - failure.start);

    const termWidth = terminalWidth - pos.length - Padding.length - 5;

    const trimLeft = failure.end > termWidth ? Math.max(0, failure.start - 8) : 0;

    const line1 = line.substr(trimLeft);
    const accents1 = accents.substr(trimLeft);

    return [
        Padding + chalk.gray(pos) + line1.substr(0, termWidth),
        Padding + ' '.repeat(pos.length) + accents1.substr(0, termWidth)
    ].join(EOL);
}

function getReason(testCase: GrammarTestCase, failure: TestFailure) {
    const result = [];
    if (failure.missing && failure.missing.length > 0) {
        result.push([
            chalk.red(Padding + 'missing required scopes: ') +
            chalk.gray(failure.missing.join(' '))
        ].join(''));
    }
    if (failure.unexpected && failure.unexpected.length > 0) {
        result.push([
            chalk.red(Padding + 'prohibited scopes: ') +
            chalk.gray(failure.unexpected.join(' '))
        ].join(''));
    }
    if (failure.actual !== undefined) {
        result.push(
            chalk.red(Padding + 'actual: ') + chalk.gray(failure.actual.join(' '))
        );
    }
    return result.join(EOL);
}

function getCorrectedOffsets(
    failure: TestFailure
): { l: number; s: number; e: number } {
    return {
        l: failure.line + 1,
        s: failure.start + 1,
        e: failure.end + 1
    };
}

export function getErrorResultText(
    filename: string,
    testCase: GrammarTestCase,
    failures: TestFailure[]
): string {
    if (failures.length > 0) {
        return failures.map((failure) => {
            const { l, s, e } = getCorrectedOffsets(failure);
            return [
                `${Padding}at [${chalk.whiteBright(`${filename}:${l}:${s}:${e}`)}]:`,
                getSourceLine(testCase, failure),
                getReason(testCase, failure)
            ].join(EOL);
        }).join(EOL + EOL);
    }
}
