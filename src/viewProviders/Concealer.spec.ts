import { expect } from 'chai';
import { Concealer } from './Concealer';

describe('Concealer', () => {
    let concealer: Concealer;

    beforeEach(() => {
        concealer = new Concealer();
    });

    describe('concealObject', () => {
        it('does not conceal anything when no secret keys are provided', () => {
            expect(
                [...concealer.concealObject({ alpha: 'a', beta: 'b' }, [])]
            ).to.eql([
                ['alpha', { value: 'a', originalValue: 'a' }],
                ['beta', { value: 'b', originalValue: 'b' }]
            ]);
        });

        it('does not crash for unrecognized secret keys', () => {
            expect(
                [...concealer.concealObject({ alpha: 'a', beta: 'b' }, [undefined, '', false as unknown as string])]
            ).to.eql([
                ['alpha', { value: 'a', originalValue: 'a' }],
                ['beta', { value: 'b', originalValue: 'b' }]
            ]);
        });

        it('does not crash for undefined secret values', () => {
            expect(
                [...concealer.concealObject({ alpha: 'a', beta: undefined }, ['beta'])]
            ).to.eql([
                ['alpha', { value: 'a', originalValue: 'a' }],
                ['beta', { value: undefined, originalValue: undefined }]
            ]);
        });

        it('ignores blank and empty strings', () => {
            expect(
                [...concealer.concealObject({ alpha: 'alpha', beta: '' }, ['beta'])]
            ).to.eql([
                ['alpha', { value: 'alpha', originalValue: 'alpha' }],
                ['beta', { value: '', originalValue: '' }]
            ]);
        });

        it('conceals various value types', () => {
            //prefill the cache so we always know what it'll contain for this key
            concealer['concealCache'].set('123', 'abc');
            concealer['concealCache'].set('456', 'def');
            expect(
                [...concealer.concealObject({ alpha: '123', beta: 'beta 123 456', charlie: '456', delta: 123 }, ['alpha', 'charlie'])]
            ).to.eql([
                ['alpha', { value: 'abc', originalValue: '123' }],
                ['beta', { value: 'beta abc def', originalValue: 'beta 123 456' }],
                ['charlie', { value: 'def', originalValue: '456' }],
                ['delta', { value: 123, originalValue: 123 }]
            ]);
        });
    });
});
