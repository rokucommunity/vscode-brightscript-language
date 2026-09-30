import * as assert from 'assert';
import { expect } from 'chai';
import { describeDevice, ensureTrailingSlash } from './util';

describe('util', () => {
    describe('describeDevice', () => {
        it('names devices by whichever address field they carry', () => {
            expect(describeDevice({ host: '1.1.1.1' })).to.equal('1.1.1.1');
            expect(describeDevice({ instanceUrl: 'https://rce.example.com', rceToken: 'token' })).to.equal('https://rce.example.com');
            expect(describeDevice({ id: 83, rceToken: 'token' })).to.equal('83');
            expect(describeDevice({ esn: 'RCE123', rceToken: 'token' })).to.equal('RCE123');
        });

        it('falls back to the provided label when there is no recognizable address', () => {
            expect(describeDevice(undefined)).to.equal('unknown');
            expect(describeDevice(undefined, 'the target device')).to.equal('the target device');
            expect(describeDevice({ host: '' }, 'the target device')).to.equal('the target device');
        });
    });

    describe('checkForTrailingSlash', () => {
        it('should add trailing slash when missing', () => {
            assert.equal(ensureTrailingSlash('./.tmp/findMainFunctionTests'), './.tmp/findMainFunctionTests/');
        });

        it('should not add trailing slash when present', () => {
            let unchangedStringTestValue = './.tmp/findMainFunctionTests/';
            assert.equal(ensureTrailingSlash(unchangedStringTestValue), unchangedStringTestValue);
        });
    });
});
