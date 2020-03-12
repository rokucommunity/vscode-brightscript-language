import { expect } from 'chai';

import { PrintedObjectParser } from './PrintedObjectParser';

describe('PrintedObjectParser', () => {
    it('works for simple cases', () => {
        parseEquals('name: "bob"', { key: 'name', value: '"bob"' });
        parseEquals('isAlive: true', { key: 'isAlive', value: 'true' });
        parseEquals('age: 12', { key: 'age', value: '12' });
    });

    //TODO -- this one is hard
    it.skip('handles embedded quotes', () => {
        parseEquals('quote: "hello " world"', { key: 'quote', value: '"hello " world"' });
    });

    it('handles colons inside of key', () => {
        parseEquals('some : colon: true', { key: 'some : colon', value: 'true' });
        parseEquals(':some: : :colon:: true', { key: ':some: : :colon:', value: 'true' });
    });

    it('handles colons inside of key and value', () => {
        parseEquals(':: ":"', { key: ':', value: '":"' });
        parseEquals(':: <Component: roAssociativeArray>', { key: ':', value: '<Component: roAssociativeArray>' });
    });

    it('handles components', () => {
        parseEquals('value: <Component: roAssociativeArray>', { key: 'value', value: '<Component: roAssociativeArray>' });
    });

    it('supports random spaces and symbols', () => {
        parseEquals('Cat ^ & dog $: true', { key: 'Cat ^ & dog $', value: 'true' });
    });

    it('supports keys with leading spaces', () => {
        parseEquals('  count: 1', { key: '  count', value: '1' });
    });

    it('does not cause infinite loop for truncated object', () => {
        parseEquals('...', undefined);
    });
});

function parseEquals(line: string, expected: { key: string, value: string }) {
    expect(new PrintedObjectParser(`    ${line}`).result).to.eql(expected);
}
