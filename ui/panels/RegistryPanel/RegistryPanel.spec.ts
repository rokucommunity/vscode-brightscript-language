import { expect } from 'chai';
import { registryPanel } from './RegistryPanel';

describe('RegistryPanel', () => {
    describe('formatValues', () => {
        it('should convert json into an object with the correct correct values', () => {
            const input = {
                a: '{"b": 1}'
            };
            const result = registryPanel.formatValues(input);
            expect(result.a.b).to.equal(1);
        });

        it('should correctly handle multiple levels', () => {
            const input = {
                a: {
                    b: '{"c": 1}'
                }
            };
            const result = registryPanel.formatValues(input);
            expect(result.a.b.c).to.equal(1);
        });

        it('should return the incoming value if not JSON', () => {
            const input = {
                a: {
                    b: 1
                }
            };
            const result = registryPanel.formatValues(input);
            expect(result.a.b).to.equal(input.a.b);
        });
    });
});
