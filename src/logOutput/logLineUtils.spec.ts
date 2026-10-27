import { expect } from 'chai';
import { annotateErrorCodes, findFileReference, getFilenameWithoutExtension } from './logLineUtils';

describe('logLineUtils', () => {
    describe('annotateErrorCodes', () => {
        it('leaves text without error codes alone', () => {
            expect(annotateErrorCodes('hello world')).to.equal('hello world');
        });

        it('describes a known error code', () => {
            expect(annotateErrorCodes('Crashed: &hF4 in main')).to.equal('Crashed: &hF4 (ERR_RO2: member function not found in object or interface)  in main');
        });

        it('describes every occurrence of an error code', () => {
            expect(annotateErrorCodes('&h14 then &h14')).to.equal('&h14 (ERR_DIV_ZERO: divide by zero error)  then &h14 (ERR_DIV_ZERO: divide by zero error) ');
        });

        it('leaves unknown codes alone', () => {
            expect(annotateErrorCodes('value &h99')).to.equal('value &h99');
        });
    });

    describe('findFileReference', () => {
        it('returns undefined when there is no reference', () => {
            expect(findFileReference('just some text')).to.be.undefined;
        });

        it('finds a pkg reference with a line and column', () => {
            expect(findFileReference('error at pkg:/components/KeyLogTester.brs(24:0) [INFO] retrieving')).to.eql({
                index: 9,
                length: 'pkg:/components/KeyLogTester.brs(24:0)'.length,
                path: 'pkg:/components/KeyLogTester.brs',
                isFilePath: false,
                lineNumber: 24,
                extension: '.brs',
                filename: 'KeyLogTester'
            });
        });

        it('finds a file reference with a colon line number', () => {
            const reference = findFileReference('file:///project/source/main.bs:12 hello');
            expect(reference.path).to.equal('/project/source/main.bs');
            expect(reference.isFilePath).to.be.true;
            expect(reference.lineNumber).to.equal(12);
            expect(reference.extension).to.equal('.bs');
            expect(reference.filename).to.equal('main');
        });

        it('finds a file reference with a parenthesized line number', () => {
            const reference = findFileReference('file:///project/source/main.brs(7)');
            expect(reference.path).to.equal('/project/source/main.brs');
            expect(reference.lineNumber).to.equal(7);
        });

        it('finds "at line N of file" references', () => {
            const reference = findFileReference('BRIGHTSCRIPT: WARNING: something at line 31 of file pkg:/components/Scene.xml');
            expect(reference.path).to.equal('pkg:/components/Scene.xml');
            expect(reference.lineNumber).to.equal(31);
            expect(reference.extension).to.equal('.xml');
        });
    });

    describe('getFilenameWithoutExtension', () => {
        it('strips the folder and known extensions', () => {
            expect(getFilenameWithoutExtension('pkg:/source/main.brs')).to.equal('main');
            expect(getFilenameWithoutExtension('pkg:/source/main.BS')).to.equal('main');
            expect(getFilenameWithoutExtension('pkg:/components/Scene.xml')).to.equal('Scene');
            expect(getFilenameWithoutExtension('manifest')).to.equal('manifest');
        });
    });
});
