import { vscode } from '../mockVscode.spec';
import type { PackageCatalogPackageInfo } from './LocalPackageManager';
import { LocalPackageManager } from './LocalPackageManager';
import { standardizePath as s } from 'brighterscript';
import * as fsExtra from 'fs-extra';
import { expect } from 'chai';
import { util } from '../util';
import * as dayjs from 'dayjs';
import * as md5 from 'md5';
import { createSandbox } from 'sinon';
const sinon = createSandbox();

const cwd = s`${__dirname}/../../`;
const tempDir = s`${cwd}/.tmp`;

describe.only('LocalPackageManager', () => {

    const packageUrl = 'https://github.com/rokucommunity/brighterscript/releases/download/v0.0.0-packages/brighterscript-0.67.5-lsp-refactor.20240806164122.tgz';

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

        it('actually works with real npm package', async () => {
            //remove the mock npm install
            sinon.restore();

            await manager.install('is-odd', '1.0.0');
            expect(fsExtra.pathExistsSync(`${storageDir}/is-odd/1.0.0/node_modules/is-odd/package.json`)).to.be.true;
        });

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

        // it('installs packages from a URL', async () => {
        //     const url = 'https://github.com/rokucommunity/brighterscript/releases/download/v0.0.0-packages/brighterscript-0.67.5-lsp-refactor.20240806164122.tgz';
        //     await manager.install('brighterscript', url);
        //     const info = manager['getPackageInfo']('brighterscript', url);
        //     expect(
        //         fsExtra.pathExistsSync(info.packageDir)
        //     ).to.be.true;
        // });
    });

    describe('getPackageInfo', () => {
        it('transforms URLs into a filesystem-safe name', () => {
            const info = manager['getPackageInfo']('brighterscript', packageUrl);
            expect(
                info.versionDirName
            ).to.match(/^[a-z0-9_]+$/i);
        });
    });

    describe('remove', () => {
        it('removes a specific package version', async () => {
            await Promise.all([
                manager.install('is-odd', '1.0.0'),
                manager.install('is-odd', '2.0.0'),
                manager.install('is-even', '1.0.0')
            ]);

            await manager.uninstall('is-odd', '2.0.0');

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
            await manager.uninstall('is-odd', '1.0.0');
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

            await manager.deletePackagesNotUsedSince(yesterday);

            //package was not deleted
            expect(
                manager.isInstalled('is-odd', '1.0.0')
            ).to.be.true;

            await manager.setUsage('is-odd', '1.0.0', now);

            await manager.deletePackagesNotUsedSince(littleAfterNow);
            //package was deleted because it was not used since the cutoff date
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

    describe('getVersionDirName', () => {
        it('fetches the catalog when not supplied', async () => {
            expect(
                await manager['getVersionDirName']('brighterscript', '1.0.0')
            ).to.eql('1.0.0');
        });

        it('creates a hash', async () => {
            expect(
                await manager['getVersionDirName']('brighterscript', packageUrl)
            ).to.eql(md5(packageUrl));
        });

        it('uses a pre-existing hash when available', async () => {
            const packageUrl2 = `${packageUrl}2`;
            //need to do some hackery here to force a hash to already exist (since hash collisions are hard to reproduce...)
            await manager.install('brighterscript', packageUrl2);

            await manager['withCatalog']((catalog) => {
                //override the hash to be the hash of `packageUrl`
                catalog.packages['brighterscript'][packageUrl2].versionDirName = md5(packageUrl);
            });

            //ask for the dir name, it should come back with the hash of the packageUrl
            expect(
                await manager['getVersionDirName']('brighterscript', packageUrl2)
            ).to.eql(md5(packageUrl));

            //now ask for the dir name, it should come with a number appended to it since that hash already exists
            expect(
                await manager['getVersionDirName']('brighterscript', packageUrl)
            ).to.eql(`${md5(packageUrl)}-1`);
        });
    });

    describe('parseVersionInfo', () => {
        it('returns undefined for bad values', () => {
            expect(
                manager['parseVersionInfo'](undefined, process.cwd())
            ).to.be.undefined;

            expect(
                manager['parseVersionInfo'](null, process.cwd())
            ).to.be.undefined;

            expect(
                manager['parseVersionInfo']('', process.cwd())
            ).to.be.undefined;

            expect(
                manager['parseVersionInfo'](' ', process.cwd())
            ).to.be.undefined;
        });
        it('detects valid semver versions', () => {
            expect(
                manager['parseVersionInfo']('1.0.0', process.cwd())
            ).to.eql({
                value: '1.0.0',
                type: 'semver-exact'
            });

            expect(
                manager['parseVersionInfo']('1.0.0-alpha.2', process.cwd())
            ).to.eql({
                value: '1.0.0-alpha.2',
                type: 'semver-exact'
            });
        });

        it('detects valid semver version ranges', () => {
            expect(
                manager['parseVersionInfo']('~1.0.0', process.cwd())
            ).to.eql({
                value: '~1.0.0',
                type: 'semver-range'
            });

            expect(
                manager['parseVersionInfo']('^1.0.0', process.cwd())
            ).to.eql({
                value: '^1.0.0',
                type: 'semver-range'
            });

            expect(
                manager['parseVersionInfo']('1.2.x', process.cwd())
            ).to.eql({
                value: '1.2.x',
                type: 'semver-range'
            });

            expect(
                manager['parseVersionInfo']('1.2.0 || >=1.2.2 <1.3.0', process.cwd())
            ).to.eql({
                value: '1.2.0 || >=1.2.2 <1.3.0',
                type: 'semver-range'
            });
        });

        it('detects valid dist tags', () => {
            expect(
                manager['parseVersionInfo']('@next', process.cwd())
            ).to.eql({
                value: '@next',
                type: 'dist-tag'
            });
        });

        it('detects valid URLs', () => {
            expect(
                manager['parseVersionInfo']('https://github.com', process.cwd())
            ).to.eql({
                value: 'https://github.com',
                type: 'url'
            });

            expect(
                manager['parseVersionInfo'](packageUrl, process.cwd())
            ).to.eql({
                value: packageUrl,
                type: 'url'
            });
        });

        it('detects paths to tgz', () => {
            expect(
                manager['parseVersionInfo']('./something.tgz', process.cwd())
            ).to.eql({
                value: './something.tgz',
                type: 'tgz-path'
            });

            expect(
                manager['parseVersionInfo'](s`${tempDir}/thing.tgz`, process.cwd())
            ).to.eql({
                value: s`${tempDir}/thing.tgz`,
                type: 'tgz-path'
            });
        });

        it('detects paths to directories', () => {
            expect(
                manager['parseVersionInfo']('./something', s`${process.cwd()}`)
            ).to.eql({
                value: s`${process.cwd()}/something`,
                type: 'dir'
            });

            expect(
                manager['parseVersionInfo']('./something', cwd)
            ).to.eql({
                value: s`${cwd}/something`,
                type: 'dir'
            });

            expect(
                manager['parseVersionInfo'](s`${tempDir}/thing`, process.cwd())
            ).to.eql({
                value: s`${tempDir}/thing`,
                type: 'dir'
            });
        });
    });
});
