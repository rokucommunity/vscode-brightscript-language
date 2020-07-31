/* tslint:disable:no-unused-expression */
/* tslint:disable:no-var-requires */
import { assert, expect } from 'chai';
import * as path from 'path';
import * as sinonImport from 'sinon';

let Module = require('module');

import { vscode } from './mockVscode.spec';

const { require: oldRequire } = Module.prototype;

Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

import { CustomDocumentLink, LogDocumentLinkProvider } from './LogDocumentLinkProvider';

let sinon: sinonImport.SinonSandbox;
beforeEach(() => {
    sinon = sinonImport.createSandbox();
});
afterEach(() => {
    sinon.restore();
});
describe('LogDocumentLinkProvider', () => {
    let linkProvider: LogDocumentLinkProvider;
    let l: any;

    beforeEach(() => {
        linkProvider = new LogDocumentLinkProvider();
        l = linkProvider;
    });

    describe('setLaunchConfig', () => {
        it('properly generates pkg paths', async () => {
            sinon.stub(l.rokuDeploy, 'getFilePaths').returns(Promise.resolve([{
                src: path.normalize('C:/project/manifest'),
                dest: path.normalize('C:/project/out/manifest')
            }, {
                src: path.normalize('C:/project/source/main.brs'),
                dest: path.normalize('C:/project/out/source/main.brs')
            }]));

            await linkProvider.setLaunchConfig(<any>{
                rootDir: path.normalize('C:/project'),
                outDir: path.normalize('C:/project/out')
            });

            expect(linkProvider.fileMaps).to.eql({
                'pkg:/manifest': {
                    src: path.normalize('C:/project/manifest'),
                    dest: path.normalize('C:/project/out/manifest'),
                    pkgPath: 'pkg:/manifest'
                },
                'pkg:/source/main.brs': {
                    src: path.normalize('C:/project/source/main.brs'),
                    dest: path.normalize('C:/project/out/source/main.brs'),
                    pkgPath: 'pkg:/source/main.brs'
                }
            });
        });
    });
    describe('resetCustomLinks', () => {
        it('resets links', () => {
            let linkProviderMock = sinon.mock(linkProvider);
            linkProviderMock.expects('getFileMap').returns({
                src: path.normalize('C:/project/source/main.brs'),
                dest: path.normalize('C:/project/out/source/main.brs')
            });
            let link = new CustomDocumentLink(1, 10, 1, 'pkg:/full.brs(12)', 12, 'full');
            linkProvider.addCustomPkgLink(link);
            expect(linkProvider.customLinks.length).to.equal(1);
            linkProvider.resetCustomLinks();
            expect(linkProvider.customLinks.length).to.equal(0);
        });
    });

    describe('addCustomLink - pkg', () => {
        it('adds links', () => {
            let linkProviderMock = sinon.mock(linkProvider);
            linkProviderMock.expects('getFileMap').returns({
                src: path.normalize('C:/project/source/main.brs'),
                dest: path.normalize('C:/project/out/source/main.brs')
            });
            let link = new CustomDocumentLink(1, 10, 1, 'pkg:/full.brs(12)', 12, 'full.brs');
            linkProvider.addCustomPkgLink(link);
            expect(linkProvider.customLinks.length).to.equal(1);
        });
    });

    describe('addCustomLink - file', () => {
        it('adds links', () => {
            let linkProviderMock = sinon.mock(linkProvider);
            linkProviderMock.expects('getFileMap').returns({
                src: path.normalize('C:/project/source/main.brs'),
                dest: path.normalize('C:/project/out/source/main.brs')
            });
            let link = new CustomDocumentLink(1, 10, 1, 'file:///full.brs(12)', 12, 'full.brs');
            linkProvider.addCustomFileLink(link);
            expect(linkProvider.customLinks.length).to.equal(1);
        });
    });
});
