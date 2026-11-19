import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeFileAtomic, writeFileAtomicIfChanged } from './atomicWrite';

describe('debugMcp atomicWrite', () => {
    let directory: string;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bsmcp-atomic-'));
    });

    afterEach(() => {
        fs.rmSync(directory, { recursive: true, force: true });
    });

    it('writes content with the requested mode and leaves no temp files', () => {
        const filePath = path.join(directory, 'file.json');
        writeFileAtomic(filePath, 'hello', 0o600);
        expect(fs.readFileSync(filePath, 'utf8')).to.equal('hello');
        if (process.platform !== 'win32') {
            expect(fs.statSync(filePath).mode % 0o1000).to.equal(0o600);
        }
        expect(fs.readdirSync(directory)).to.eql(['file.json']);
    });

    it('replaces existing content and keeps the existing mode when none is given', function () {
        if (process.platform === 'win32') {
            this.skip();
        }
        const filePath = path.join(directory, 'file.json');
        fs.writeFileSync(filePath, 'old', { mode: 0o640 });
        fs.chmodSync(filePath, 0o640);
        writeFileAtomic(filePath, 'new');
        expect(fs.readFileSync(filePath, 'utf8')).to.equal('new');
        expect(fs.statSync(filePath).mode % 0o1000).to.equal(0o640);
        expect(fs.readdirSync(directory)).to.eql(['file.json']);
    });

    it('applies an executable mode regardless of umask', function () {
        if (process.platform === 'win32') {
            this.skip();
        }
        const filePath = path.join(directory, 'launcher');
        writeFileAtomic(filePath, '#!/bin/sh\n', 0o755);
        expect(fs.statSync(filePath).mode % 0o1000).to.equal(0o755);
    });

    it('cleans up the temp file and keeps the original when the write fails', () => {
        const filePath = path.join(directory, 'target');
        fs.mkdirSync(filePath);
        expect(() => writeFileAtomic(filePath, 'x')).to.throw();
        expect(fs.readdirSync(directory)).to.eql(['target']);
    });

    it('rewrites only when the content differs', () => {
        const filePath = path.join(directory, 'file');
        expect(writeFileAtomicIfChanged(filePath, 'a')).to.be.true;
        const inodeBefore = fs.statSync(filePath).ino;
        expect(writeFileAtomicIfChanged(filePath, 'a')).to.be.false;
        expect(fs.statSync(filePath).ino).to.equal(inodeBefore);
        expect(writeFileAtomicIfChanged(filePath, Buffer.from('b'))).to.be.true;
        expect(fs.readFileSync(filePath, 'utf8')).to.equal('b');
    });
});
