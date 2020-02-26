/* tslint:disable:no-unused-expression */
import * as assert from 'assert';
import { expect } from 'chai';
import * as fsExtra from 'fs-extra';
import * as getPort from 'get-port';
import * as net from 'net';
import * as path from 'path';
import * as sinonActual from 'sinon';

import { util } from './util';
let sinon = sinonActual.createSandbox();

const rootDir = path.normalize(path.dirname(__dirname));

beforeEach(() => {
    sinon.restore();
});

describe('Util', () => {

    describe('removeTrailingNewline', () => {
        it('works', () => {
            expect(util.removeTrailingNewline('\r\n')).to.equal('');
            expect(util.removeTrailingNewline('\n')).to.equal('');
            expect(util.removeTrailingNewline('\r\n\r\n')).to.equal('\r\n');
        });
    });

    describe('checkForTrailingSlash', () => {
        it('should add trailing slash when missing', () => {
            assert.equal(util.ensureTrailingSlash('./.tmp/findMainFunctionTests'), './.tmp/findMainFunctionTests/');
        });

        it('should not add trailing slash when present', () => {
            let unchangedStringTestValue = './.tmp/findMainFunctionTests/';
            assert.equal(util.ensureTrailingSlash(unchangedStringTestValue), unchangedStringTestValue);
        });
    });

    describe('fileExists', () => {
        let folder: string;
        let filePath: string;

        beforeEach(() => {
            fsExtra.emptyDirSync('./.tmp');
            folder = path.resolve('./.tmp/findMainFunctionTests/');
            fsExtra.mkdirSync(folder);

            filePath = path.resolve(`${folder}/testFile`);
        });

        afterEach(() => {
            fsExtra.emptyDirSync('./.tmp');
            fsExtra.rmdirSync('./.tmp');
        });

        it('should return true when found', async () => {
            fsExtra.writeFileSync(filePath, '# my test content');
            assert.equal((await util.fileExists(filePath)), true);
        });

        it('should return false when not found', async () => {
            assert.equal((await util.fileExists(filePath)), false);
        });
    });

    describe('removeFileScheme', () => {
        it('should return remove the leading scheme', async () => {
            assert.equal(util.removeFileScheme('g:/images/channel-poster_hd.png'), '/images/channel-poster_hd.png');
            assert.equal(util.removeFileScheme('pkg:/images/channel-poster_hd.png'), '/images/channel-poster_hd.png');
            assert.equal(util.removeFileScheme('RandomComponentLibraryName:/images/channel-poster_hd.png'), '/images/channel-poster_hd.png');
        });

        it('should should not modify the path when there is no scheme', async () => {
            assert.equal(util.removeFileScheme('/images/channel-poster_hd.png'), '/images/channel-poster_hd.png');
            assert.equal(util.removeFileScheme('ages/channel-poster_hd.png'), 'ages/channel-poster_hd.png');
        });
    });

    describe('getFileScheme', () => {
        it('should return the leading scheme', async () => {
            assert.equal(util.getFileScheme('pkg:/images/channel-poster_hd.png'), 'pkg:');
            assert.equal(util.getFileScheme('RandomComponentLibraryName:/images/channel-poster_hd.png'), 'randomcomponentlibraryname:');
        });

        it('should should return null when there is no scheme', async () => {
            assert.equal(util.getFileScheme('/images/channel-poster_hd.png'), null);
            assert.equal(util.getFileScheme('ages/channel-poster_hd.png'), null);
        });
    });

    describe('convertManifestToObject', () => {
        let fileContents: string;
        let expectedManifestObject: { [key: string]: string };
        let folder: string;
        let filePath: string;

        beforeEach(() => {
            fileContents = `# Channel Details
                title=HeroGridChannel
                subtitle=Roku Sample Channel App
                major_version=1
                minor_version=1
                build_version=00001

                # Channel Assets
                mm_icon_focus_hd=pkg:/images/channel-poster_hd.png
                mm_icon_focus_sd=pkg:/images/channel-poster_sd.png

                # Splash Screen + Loading Screen Artwork
                splash_screen_sd=pkg:/images/splash-screen_sd.jpg
                splash_screen_hd=pkg:/images/splash-screen_hd.jpg
                splash_screen_fhd=pkg:/images/splash-screen_fhd.jpg
                splash_color=#808080
                splash_min_time=0
                # Resolution
                ui_resolutions=fhd

                confirm_partner_button=1
                bs_const=const=false;const2=true;const3=false
            `.replace(/    /g, '');

            expectedManifestObject = {
                title: 'HeroGridChannel',
                subtitle: 'Roku Sample Channel App',
                major_version: '1',
                minor_version: '1',
                build_version: '00001',
                mm_icon_focus_hd: 'pkg:/images/channel-poster_hd.png',
                mm_icon_focus_sd: 'pkg:/images/channel-poster_sd.png',
                splash_screen_sd: 'pkg:/images/splash-screen_sd.jpg',
                splash_screen_hd: 'pkg:/images/splash-screen_hd.jpg',
                splash_screen_fhd: 'pkg:/images/splash-screen_fhd.jpg',
                splash_color: '#808080',
                splash_min_time: '0',
                ui_resolutions: 'fhd',
                confirm_partner_button: '1',
                bs_const: 'const=false;const2=true;const3=false'
            };

            fsExtra.emptyDirSync('./.tmp');
            folder = path.resolve('./.tmp/findMainFunctionTests/');
            fsExtra.mkdirSync(folder);

            filePath = path.resolve(`${folder}/manifest`);
        });

        afterEach(() => {
            fsExtra.emptyDirSync('./.tmp');
            fsExtra.rmdirSync('./.tmp');
        });

        it('should read the manifest and return an js object version of it', async () => {
            fsExtra.writeFileSync(filePath, fileContents);
            let manifestObject = await util.convertManifestToObject(filePath);
            assert.deepEqual(manifestObject, expectedManifestObject);
        });

        it('should return undefined when the manifest is not found', async () => {
            let manifestObject = await util.convertManifestToObject(filePath);
            assert.equal(manifestObject, undefined);
        });
    });

    describe('isPortInUse', () => {
        let otherServer: net.Server;
        let port: number;

        beforeEach(async () => {
            port = await getPort();
            otherServer = await new Promise<net.Server>((resolve, reject) => {
                const tester = net.createServer()
                    .once('listening', () => resolve(tester))
                    .listen(port);
            });
        });

        it('should detect when a port is in use', async () => {
            assert.equal(true, await util.isPortInUse(port));
        });

        it('should detect when a port is not in use', async () => {
            assert.equal(false, await util.isPortInUse(port + 1));
        });

        afterEach(async () => {
            await otherServer.close();
        });
    });

    describe('objectDiff', () => {
        let objectA;
        let objectB;

        beforeEach(() => {
            objectA = {
                a: 1,
                b: 2,
                c: 3,
                nestedLevelOne: {
                    x: 1,
                    y: 2,
                    z: 3,
                    nestedLevelTwo: {
                        w: 9,
                        q: 8,
                        r: 7
                    }
                }
            };

            objectB = {
                a: 1,
                b: 2,
                c: 3,
                nestedLevelOne: {
                    x: 1,
                    y: 2,
                    z: 3,
                    nestedLevelTwo: {
                        w: 9,
                        q: 8,
                        r: 7
                    }
                }
            };
        });

        it('should detect no changes', () => {
            assert.deepEqual(util.objectDiff(objectB, objectA), {});
        });

        it('should detect value changes', () => {
            objectB.b = '2';
            objectB.nestedLevelOne.y = 3;
            objectB.nestedLevelOne.nestedLevelTwo.q = true;
            assert.deepEqual(util.objectDiff(objectB, objectA), {
                b: '2',
                nestedLevelOne: {
                    nestedLevelTwo: {
                        q: true
                    },
                    y: 3
                }
            });
        });

        it('should handle deleted or undefined values', () => {
            delete objectA.a;
            objectB.b = '2';
            objectB.c = undefined;
            objectB.nestedLevelOne.x = null;
            objectB.nestedLevelOne.y = 3;

            assert.deepEqual(util.objectDiff(objectB, objectA), {
                a: 1,
                b: '2',
                c: undefined,
                nestedLevelOne: {
                    x: null,
                    y: 3
                }
            });
        });

        it('should not return excluded values', () => {
            objectB.b = '2';
            objectB.nestedLevelOne.y = 3;
            objectB.nestedLevelOne.nestedLevelTwo.q = true;
            assert.deepEqual(util.objectDiff(objectB, objectA, ['2']), {
                nestedLevelOne: {
                    nestedLevelTwo: {
                        q: true
                    },
                    y: 3
                }
            });
        });
    });
});
