import { expect } from 'chai';
import * as path from 'path';
import { createSandbox } from 'sinon';
import { PkgPathResolver } from './PkgPathResolver';
const sinon = createSandbox();

describe('PkgPathResolver', () => {
    let resolver: PkgPathResolver;

    beforeEach(() => {
        resolver = new PkgPathResolver();
    });

    afterEach(() => {
        sinon.restore();
    });

    it('resolves pkg paths to their source files', async () => {
        sinon.stub(resolver['rokuDeploy'], 'resolveFilesArray').resolves([{
            src: path.normalize('C:/project/manifest'),
            dest: path.normalize('C:/project/out/manifest')
        }, {
            src: path.normalize('C:/project/source/main.brs'),
            dest: path.normalize('C:/project/out/source/main.brs')
        }]);

        await resolver.setLaunchConfig(<any>{
            rootDir: path.normalize('C:/project'),
            outDir: path.normalize('C:/project/out')
        });

        expect(resolver.resolve('pkg:/manifest')).to.equal(path.normalize('C:/project/manifest'));
        expect(resolver.resolve('pkg:/source/main.brs')).to.equal(path.normalize('C:/project/source/main.brs'));
        expect(resolver.resolve('pkg:/source/other.brs')).to.be.undefined;
    });

    it('works without an outDir', async () => {
        sinon.stub(resolver['rokuDeploy'], 'resolveFilesArray').resolves([{
            src: path.normalize('C:/project/source/main.brs'),
            dest: path.normalize('source/main.brs')
        }]);

        await resolver.setLaunchConfig(<any>{ rootDir: path.normalize('C:/project') });

        expect(resolver.resolve('pkg:/source/main.brs')).to.equal(path.normalize('C:/project/source/main.brs'));
    });

    it('falls back to the alternate .bs/.brs file', async () => {
        sinon.stub(resolver['rokuDeploy'], 'resolveFilesArray').resolves([{
            src: path.normalize('C:/project/source/main.bs'),
            dest: path.normalize('source/main.bs')
        }]);

        await resolver.setLaunchConfig(<any>{ rootDir: path.normalize('C:/project') });

        expect(resolver.resolve('pkg:/source/main.brs')).to.equal(path.normalize('C:/project/source/main.bs'));
    });

    it('includes the files from every sourceDir', async () => {
        sinon.stub(resolver['rokuDeploy'], 'resolveFilesArray').callsFake((options: any) => {
            return Promise.resolve([{
                src: path.join(options.rootDir, 'source', `${path.basename(options.rootDir)}.brs`),
                dest: path.normalize(`source/${path.basename(options.rootDir)}.brs`)
            }]);
        });

        await resolver.setLaunchConfig(<any>{ sourceDirs: [path.normalize('C:/a'), path.normalize('C:/b')] });

        expect(resolver.resolve('pkg:/source/a.brs')).to.equal(path.normalize('C:/a/source/a.brs'));
        expect(resolver.resolve('pkg:/source/b.brs')).to.equal(path.normalize('C:/b/source/b.brs'));
    });

    it('replaces the previous launch config files', async () => {
        const stub = sinon.stub(resolver['rokuDeploy'], 'resolveFilesArray');
        stub.onFirstCall().resolves([{ src: path.normalize('C:/project/source/old.brs'), dest: path.normalize('source/old.brs') }]);
        stub.onSecondCall().resolves([{ src: path.normalize('C:/project/source/new.brs'), dest: path.normalize('source/new.brs') }]);

        await resolver.setLaunchConfig(<any>{ rootDir: path.normalize('C:/project') });
        await resolver.setLaunchConfig(<any>{ rootDir: path.normalize('C:/project') });

        expect(resolver.resolve('pkg:/source/old.brs')).to.be.undefined;
        expect(resolver.resolve('pkg:/source/new.brs')).to.equal(path.normalize('C:/project/source/new.brs'));
    });
});
