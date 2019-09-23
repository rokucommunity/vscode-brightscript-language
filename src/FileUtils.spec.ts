// tslint:disable: no-unused-expression
import { expect } from 'chai';
import * as path from 'path';
import * as sinonActual from 'sinon';
let sinon = sinonActual.createSandbox();

import { fileUtils } from './FileUtils';

describe.only('FileUtils', () => {
    afterEach(() => {
        sinon.restore();
    });

    describe('getAllRelativePaths', () => {
        //basic test to get code coverage...we don't need to test the glob code too much here...
        it('works', () => {
            expect(fileUtils.getAllRelativePaths(path.join(__dirname, '..', 'images'))).to.contain(path.join('icon.png'));
        });
    });

    describe('removeFileTruncation', () => {
        it('does not replace when the `...` character is missing', () => {
            expect(fileUtils.removeFileTruncation('project1/main.brs')).to.equal('project1/main.brs');
        });
    });

    describe('pathEndsWith', () => {
        it('accepts same path', () => {
            expect(fileUtils.pathEndsWith('project1/main.brs', 'project1/main.brs')).to.be.true;
        });

        it('rejects contained path not found at end', () => {
            expect(fileUtils.pathEndsWith('project1/main.brs.map', 'project1/main.brs')).to.be.false;
        });

        it('rejects non-similar path', () => {
            expect(fileUtils.pathEndsWith('project1/main.brs.map', 'project2/lib.brs')).to.be.false;
        });
    });

    describe('findPartialFileInDirectory', () => {
        beforeEach(() => {
            sinon.stub(fileUtils, 'getAllRelativePaths').returns([
                'source/main.brs',
                'source/lib1/lib.brs',
                'source/lib2/lib.brs'
            ]);
        });

        it('returns first result when multiple matches are found', () => {
            let stub = sinon.stub(console, 'warn').returns(undefined);

            expect(fileUtils.findPartialFileInDirectory('...lib.brs', 'SomeAppDir')).to.equal('source/lib1/lib.brs');

            //a warning should be logged to the console about the fact that there are multiple matches
            expect(stub.getCalls()).to.be.lengthOf(1);
        });

        it('returns undefined when no results found', () => {
            expect(fileUtils.findPartialFileInDirectory('...promise.brs', 'SomeAppDir')).to.be.undefined;
        });
    });
});
