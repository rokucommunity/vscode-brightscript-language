import { expect } from 'chai';
import { registryView } from './RokuRegistryView';

describe('RegistryView', () => {
    describe('formatValues', () => {
        it('should convert json into an object with the correct values', () => {
            const inputValue = 1;
            const input = {
                a: `{"b": ${inputValue}}`
            };
            const result = registryView.formatValues(input);
            expect(result.a.b).to.equal(inputValue);
        });

        it('should correctly handle multiple levels', () => {
            const inputValue = 1;
            const input = {
                a: {
                    b: `{"c": ${inputValue}}`
                }
            };
            const result = registryView.formatValues(input);
            expect(result.a.b.c).to.equal(inputValue);
        });

        it('should not try and convert strings that look like numbers into numbers', () => {
            const inputValue = '1';
            const input = {
                a: {
                    b: inputValue
                }
            };
            const result = registryView.formatValues(input);
            expect(result.a.b).to.equal(inputValue);
        });

        it('should not try and convert strings that look like booleans into booleans', () => {
            const inputValue = 'true';
            const input = {
                a: {
                    b: inputValue
                }
            };
            const result = registryView.formatValues(input);
            expect(result.a.b).to.equal(inputValue);
        });
    });
});
