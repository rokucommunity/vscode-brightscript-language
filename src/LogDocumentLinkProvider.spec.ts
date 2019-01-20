import { assert, expect } from 'chai';
import * as path from 'path';
import * as sinonImport from 'sinon';

import { LogDocumentLinkProvider } from './LogDocumentLinkProvider';

let sinon: sinonImport.SinonSandbox;
beforeEach(() => {
    sinon = sinonImport.createSandbox();
});
afterEach(() => {
    sinon.restore();
});
describe('BrightScriptFileUtils', () => {
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
});
