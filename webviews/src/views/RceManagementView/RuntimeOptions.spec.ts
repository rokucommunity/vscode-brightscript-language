import { expect } from 'chai';
import { buildRuntimeOptions, formatRuntimeOption, resolveRuntimeSeconds } from './RuntimeOptions';

describe('RuntimeOptions', () => {
    describe('buildRuntimeOptions', () => {
        it('offers every preset, starting at 15 minutes, when there is no cap', () => {
            expect(buildRuntimeOptions(undefined).map(formatRuntimeOption)).to.eql(['15m', '30m', '1h', '2h', '4h', '8h', '16h', '24h', '48h']);
        });

        it('appends a non-preset cap as the top choice', () => {
            expect(buildRuntimeOptions(45 * 60).map(formatRuntimeOption)).to.eql(['15m', '30m', '45m']);
        });

        it('does not duplicate a cap that is a preset', () => {
            expect(buildRuntimeOptions(2 * 3600).map(formatRuntimeOption)).to.eql(['15m', '30m', '1h', '2h']);
        });

        it('offers only the cap when it is below the smallest preset', () => {
            expect(buildRuntimeOptions(10 * 60)).to.eql([600]);
        });

        it('appends a cap above the largest preset', () => {
            expect(buildRuntimeOptions(100 * 3600).map(formatRuntimeOption).slice(-2)).to.eql(['48h', '100h']);
        });
    });

    describe('resolveRuntimeSeconds', () => {
        it('uses the pick when it is still offered', () => {
            expect(resolveRuntimeSeconds(1800, buildRuntimeOptions(undefined))).to.equal(1800);
        });

        it('defaults to one hour when the pick is missing or no longer offered', () => {
            expect(resolveRuntimeSeconds(undefined, buildRuntimeOptions(undefined))).to.equal(3600);
            expect(resolveRuntimeSeconds(4 * 3600, buildRuntimeOptions(2 * 3600))).to.equal(3600);
        });

        it('defaults to the largest option when one hour is above the cap', () => {
            expect(resolveRuntimeSeconds(undefined, buildRuntimeOptions(45 * 60))).to.equal(45 * 60);
        });
    });

    describe('formatRuntimeOption', () => {
        it('formats minutes, hours, and mixed values', () => {
            expect(formatRuntimeOption(15 * 60)).to.equal('15m');
            expect(formatRuntimeOption(3600)).to.equal('1h');
            expect(formatRuntimeOption(5400)).to.equal('1h 30m');
        });
    });
});
