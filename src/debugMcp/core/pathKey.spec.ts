import { expect } from 'chai';
import { toPathKey } from './pathKey';

describe('toPathKey', () => {
    it('ignores case on win32 and darwin, including the drive letter', () => {
        expect(toPathKey('C:\\Work\\App\\Main.brs', 'win32')).to.equal(toPathKey('c:/work/app/main.brs', 'win32'));
        expect(toPathKey('/Work/App/Main.brs', 'darwin')).to.equal(toPathKey('/work/app/main.brs', 'darwin'));
    });

    it('keeps case on linux but normalizes the drive letter', () => {
        expect(toPathKey('/work/App/main.brs', 'linux')).not.to.equal(toPathKey('/work/app/main.brs', 'linux'));
        expect(toPathKey('C:/x/y.brs', 'linux')).to.equal('c:/x/y.brs');
    });

    it('normalizes redundant segments', () => {
        expect(toPathKey('/a/b/../c/./d.brs', 'linux')).to.equal('/a/c/d.brs');
    });
});
