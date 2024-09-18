import { LocalPackageManager, PackageCatalog } from './LocalPackageManager';
import { standardizePath as s } from 'brighterscript';
import * as fsExtra from 'fs-extra';
import { expect } from 'chai';
import { util } from '../util';
import { createSandbox } from 'sinon';
const sinon = createSandbox();

const cwd = s`${__dirname}/../../`;
const tempDir = s`${cwd}/.tmp`;

describe.only('LocalPackageManager', function() {
    this.timeout(10_000);
    const storageDir = s`${tempDir}/storage`;
    let manager: LocalPackageManager;

    beforeEach(() => {
        manager = new LocalPackageManager(storageDir);

        fsExtra.emptyDirSync(storageDir);
        sinon.restore();
    });

    afterEach(() => {
        fsExtra.removeSync(storageDir);
        sinon.restore();
    });

    function expectCatalogEquals(expectedCatalog: PackageCatalog) {
        const catalog = fsExtra.readJsonSync(manager['catalogPath']);
        //remove the `lastUpdated` property because it's not deterministic
        for (let packageName in catalog.packages) {
            for (let version in catalog.packages[packageName]) {
                delete catalog.packages[packageName][version].lastUpdated;
            }
        }
        expect(catalog).to.eql(expectedCatalog);
    }

    it('installs a package when missing', async () => {
        await manager.install('is-odd', '1.0.0');
        expect(fsExtra.pathExistsSync(`${storageDir}/is-odd/1.0.0/node_modules/is-odd/package.json`)).to.be.true;
    });

    it('skips install when package is already there', async () => {
        const stub = sinon.stub(util, 'spawnAsync').callsFake(() => Promise.resolve());

        fsExtra.ensureDirSync(`${storageDir}/is-odd/1.0.0/node_modules/is-odd`);
        fsExtra.outputJsonSync(`${storageDir}/is-odd/1.0.0/node_modules/is-odd/package.json`, {
            name: 'is-odd',
            customKey: 'test'
        });

        await manager.install('is-odd', '1.0.0');

        expect(
            fsExtra.readJsonSync(`${storageDir}/is-odd/1.0.0/node_modules/is-odd/package.json`).customKey
        ).to.eql('test');

        expect(stub.called).to.be.false;
    });
});
