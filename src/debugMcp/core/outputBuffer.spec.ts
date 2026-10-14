import { expect } from 'chai';
import { compileOutputFilter, OutputBuffer } from './outputBuffer';

describe('OutputBuffer', () => {
    it('splits events into lines and ignores a trailing newline', () => {
        const buffer = new OutputBuffer();
        buffer.append('stdout', 'one\ntwo\r\n');
        buffer.append('stderr', 'three');
        const result = buffer.read({ maxLines: 10 });
        expect(result.lines.map((line) => [line.cursor, line.category, line.text])).to.eql([[1, 'stdout', 'one'], [2, 'stdout', 'two'], [3, 'stderr', 'three']]);
        expect(result.nextCursor).to.equal(3);
    });

    it('returns the newest lines when no cursor is given', () => {
        const buffer = new OutputBuffer();
        buffer.append('stdout', 'a\nb\nc\nd\n');
        expect(buffer.read({ maxLines: 2 }).lines.map((line) => line.text)).to.eql(['c', 'd']);
    });

    it('evicts the oldest lines beyond capacity and reports dropped lines', () => {
        const buffer = new OutputBuffer(3);
        buffer.append('stdout', 'a\nb\nc\nd\ne\n');
        expect(buffer.read({ maxLines: 10 }).lines.map((line) => line.text)).to.eql(['c', 'd', 'e']);
        expect(buffer.read({ sinceCursor: 0, maxLines: 10 }).droppedLines).to.be.true;
        expect(buffer.read({ sinceCursor: 2, maxLines: 10 }).droppedLines).to.be.false;
    });

    it('reads incrementally from a cursor and pages with hasMore', () => {
        const buffer = new OutputBuffer();
        buffer.append('stdout', 'a\nb\nc\n');
        const first = buffer.read({ sinceCursor: 0, maxLines: 2 });
        expect(first.lines.map((line) => line.text)).to.eql(['a', 'b']);
        expect(first.hasMore).to.be.true;
        const second = buffer.read({ sinceCursor: first.nextCursor, maxLines: 2 });
        expect(second.lines.map((line) => line.text)).to.eql(['c']);
        expect(second.hasMore).to.be.false;
        buffer.append('stdout', 'd\n');
        expect(buffer.read({ sinceCursor: second.nextCursor, maxLines: 2 }).lines.map((line) => line.text)).to.eql(['d']);
    });

    it('applies the filter and still advances the cursor past non-matching lines', () => {
        const buffer = new OutputBuffer();
        buffer.append('stdout', 'keep 1\nskip\nkeep 2\nskip\n');
        const result = buffer.read({ sinceCursor: 0, maxLines: 10, filter: /keep/ });
        expect(result.lines.map((line) => line.text)).to.eql(['keep 1', 'keep 2']);
        expect(result.nextCursor).to.equal(4);
    });

    it('reports an empty read at the latest cursor', () => {
        const buffer = new OutputBuffer();
        buffer.append('stdout', 'a\n');
        const result = buffer.read({ sinceCursor: 1, maxLines: 10 });
        expect(result.lines).to.be.empty;
        expect(result.nextCursor).to.equal(1);
    });

    it('limits reads to the requested categories while keeping cursors shared', () => {
        const buffer = new OutputBuffer();
        buffer.append('stdout', 'device line\n');
        buffer.append('stderr', 'adapter line\n');
        buffer.append('stdout', 'second device line\n');
        expect(buffer.read({ maxLines: 10, categories: ['stdout'] }).lines.map((line) => line.cursor)).to.eql([1, 3]);
        const resumed = buffer.read({ sinceCursor: 1, maxLines: 10, categories: ['stdout'] });
        expect(resumed.lines.map((line) => line.text)).to.eql(['second device line']);
        expect(resumed.nextCursor).to.equal(3);
    });

    it('rejects an invalid filter with a clear message', () => {
        expect(() => compileOutputFilter('(')).to.throw('Invalid filter regular expression');
        expect(compileOutputFilter(undefined)).to.be.undefined;
    });
});
