import type { PackageCatalogPackageInfo } from './LocalPackageManager';
import { LocalPackageManager } from './LocalPackageManager';
import { standardizePath as s } from 'brighterscript';
import * as fsExtra from 'fs-extra';
import { expect } from 'chai';
import { util } from '../util';
import * as dayjs from 'dayjs';
import { vscode } from '../mockVscode.spec';
import * as lodash from 'lodash';
import { createSandbox } from 'sinon';
const sinon = createSandbox();

const cwd = s`${__dirname}/../../`;
const tempDir = s`${cwd}/.tmp`;

describe.only('LocalPackageManager', () => {

    const storageDir = s`${tempDir}/storage`;
    let manager: LocalPackageManager;

    beforeEach(() => {
        manager = new LocalPackageManager(storageDir, vscode.context);

        fsExtra.emptyDirSync(storageDir);
        sinon.restore();

        //mock the npm install command to speed up the tests
        sinon.stub(util, 'spawnNpmAsync').callsFake(async (args: string[], options) => {
            let spawnCwd = s`${options.cwd?.toString()}`;
            if (args[0] !== 'install' || !spawnCwd.startsWith(storageDir)) {
                throw new Error(`Invalid cwd: ${spawnCwd}`);
            }

            //get the dependency name
            const packageName = Object.keys(
                fsExtra.readJsonSync(`${spawnCwd}/package.json`).dependencies
            )[0];
            await fsExtra.outputJson(s`${spawnCwd}/node_modules/${packageName}/package.json`, {});
        });
    });

    afterEach(() => {
        fsExtra.removeSync(storageDir);
        sinon.restore();
    });

    function expectCatalogEquals(expectedCatalog: { packages: Record<string, Record<string, Partial<PackageCatalogPackageInfo>>> }) {
        const catalog = fsExtra.readJsonSync(manager['catalogPath']);
        //remove the `lastUpdated` property because it's not deterministic
        for (let packageName in catalog.packages) {
            for (let version in catalog.packages[packageName]) {
                delete catalog.packages[packageName][version].installDate;
            }
        }
        expect(catalog).to.eql(expectedCatalog);
    }

    describe('install', function() {
        this.timeout(10_000);

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

        it('installs multiple versions at the same time', async () => {
            await Promise.all([
                manager.install('is-odd', '1.0.0'),
                manager.install('is-odd', '2.0.0'),
                manager.install('is-even', '1.0.0')
            ]);
            expectCatalogEquals({
                packages: {
                    'is-odd': {
                        '1.0.0': {
                            versionDirName: '1.0.0'
                        },
                        '2.0.0': {
                            versionDirName: '2.0.0'
                        }
                    },
                    'is-even': {
                        '1.0.0': {
                            versionDirName: '1.0.0'
                        }
                    }
                }
            });

            expect(fsExtra.pathExistsSync(`${storageDir}/is-odd/1.0.0/node_modules/is-odd/package.json`)).to.be.true;
            expect(fsExtra.pathExistsSync(`${storageDir}/is-odd/2.0.0/node_modules/is-odd/package.json`)).to.be.true;
            expect(fsExtra.pathExistsSync(`${storageDir}/is-even/1.0.0/node_modules/is-even/package.json`)).to.be.true;
        });

    });

    describe('remove', () => {
        it('removes a specific package version', async () => {
            await Promise.all([
                manager.install('is-odd', '1.0.0'),
                manager.install('is-odd', '2.0.0'),
                manager.install('is-even', '1.0.0')
            ]);

            await manager.removePackageVersion('is-odd', '2.0.0');

            expect(fsExtra.pathExistsSync(`${storageDir}/is-odd/1.0.0/node_modules/is-odd/package.json`)).to.be.true;
            expect(fsExtra.pathExistsSync(`${storageDir}/is-odd/2.0.0/node_modules/is-odd/package.json`)).to.be.false;
            expect(fsExtra.pathExistsSync(`${storageDir}/is-even/1.0.0/node_modules/is-even/package.json`)).to.be.true;

            expectCatalogEquals({
                packages: {
                    'is-odd': {
                        '1.0.0': {
                            versionDirName: '1.0.0'
                        }
                    },
                    'is-even': {
                        '1.0.0': {
                            versionDirName: '1.0.0'
                        }
                    }
                }
            });

        });

        it('does not crash when removing missing package', async () => {
            await manager.removePackageVersion('is-odd', '1.0.0');
        });
    });

    describe('withCatalog', () => {
        it('loads the default catalog when not supplied', async () => {

            //install a package so the catalog is non-empty
            await manager.install('is-odd', '1.0.0');
            await manager.install('is-odd', '2.0.0');

            //ensure the catalog is populated correctly
            expect(manager['getCatalog']().packages['is-odd']['1.0.0'].versionDirName).to.eql('1.0.0');
            expect(manager['getCatalog']().packages['is-odd']['2.0.0'].versionDirName).to.eql('2.0.0');

            const spy = sinon.spy(manager as any, 'setCatalog');

            await manager['withCatalog']((catalog) => {
                //did it load the correct catalog?
                expect(catalog.packages['is-odd']['1.0.0'].versionDirName).to.eql('1.0.0');
                expect(catalog.packages['is-odd']['2.0.0'].versionDirName).to.eql('2.0.0');

                //delete the entry from the catalog
                delete catalog.packages['is-odd']['2.0.0'];
            });

            expect(manager['getCatalog']().packages['is-odd']['1.0.0'].versionDirName).to.eql('1.0.0');
            expect(manager['getCatalog']().packages['is-odd']?.['2.0.0']).to.be.undefined;

            expect(spy.called).to.be.true;
        });

        it('uses the given catalog', async () => {
            //install a package so the catalog is non-empty
            await manager.install('is-odd', '1.0.0');

            const actualCatalog = manager['getCatalog']();

            const spy = sinon.spy(manager as any, 'setCatalog');

            await manager['withCatalog']((catalog) => {
                expect(catalog).to.equal(catalog);
            }, actualCatalog);

            //when we provide a catalog, it shouldn't write to disk itself
            expect(spy.called).to.be.false;
        });

    });

    describe('removePackage', () => {
        it('removes entries from the catalog', async () => {
            await manager.install('is-odd', '1.0.0');
            await manager.removePackage('is-odd');
        });

        it('handles undefined package name', async () => {
            await manager.removePackage(undefined as string);
        });

        it('removes all packages', async () => {
            fsExtra.ensureDirSync(`${storageDir}/is-odd/1.0.0/node_modules/is-odd`);
            fsExtra.ensureDirSync(`${storageDir}/is-odd/2.0.0/node_modules/is-odd`);
            fsExtra.ensureDirSync(`${storageDir}/is-even/1.0.0/node_modules/is-even`);

            await manager.removePackage('is-odd');

            expect(fsExtra.pathExistsSync(`${storageDir}/is-odd`)).to.be.false;
            expect(fsExtra.pathExistsSync(`${storageDir}/is-even`)).to.be.true;
        });
    });

    describe('removeAll', () => {
        it('removes everything from the storage dir', async () => {
            await manager.install('is-odd', '1.0.0');

            expect(fsExtra.pathExistsSync(`${storageDir}/catalog.json`)).to.be.true;
            expect(fsExtra.pathExistsSync(`${storageDir}/is-odd`)).to.be.true;

            await manager.removeAll();

            expect(fsExtra.pathExistsSync(`${storageDir}/catalog.json`)).to.be.false;
            expect(fsExtra.pathExistsSync(`${storageDir}/is-odd`)).to.be.false;
        });
    });

    describe('usage', () => {
        it('uses a default date when not specified', async () => {
            const now = new Date();

            await manager.setUsage('is-odd', '1.0.0');

            const usage = manager['getPackageInfo']('is-odd', '1.0.0');

            expect(usage.lastUsedDate).to.be.within(now, new Date());
        });

        it('marks a package as used right now', async () => {
            await manager.install('is-odd', '1.0.0');

            const now = new Date();
            const littleAfterNow = dayjs(now).add(1, 'minute').toDate();
            const yesterday = dayjs(now).subtract(1, 'days').toDate();

            await manager.setUsage('is-odd', '1.0.0', now);

            await manager.deletePackagesOlderThan(yesterday);

            expect(
                manager.isInstalled('is-odd', '1.0.0')
            ).to.be.true;

            await manager.setUsage('is-odd', '1.0.0', now);

            await manager.deletePackagesOlderThan(littleAfterNow);
            expect(
                manager.isInstalled('is-odd', '1.0.0')
            ).to.be.false;
        });
    });

    describe('dispose', () => {
        it('works', () => {
            manager.dispose();
        });
    });
});
