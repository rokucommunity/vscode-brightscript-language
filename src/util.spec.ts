import { expect } from 'chai';

import { util } from './util';

describe('util', () => {
    describe('removeTrailingNewline', () => {
        it('works', () => {
            expect(util.removeTrailingNewline('\r\n')).to.equal('');
            expect(util.removeTrailingNewline('\n')).to.equal('');
            expect(util.removeTrailingNewline('\r\n\r\n')).to.equal('\r\n');
        });
    });
});
