import * as assert from 'assert';
import { expect } from 'chai';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import * as sinonActual from 'sinon';

import { util } from './util';
import { vscode } from './mockVscode.spec';
let sinon = sinonActual.createSandbox();

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
        it('should return remove the leading scheme', () => {
            assert.equal(util.removeFileScheme('g:/images/channel-poster_hd.png'), '/images/channel-poster_hd.png');
            assert.equal(util.removeFileScheme('pkg:/images/channel-poster_hd.png'), '/images/channel-poster_hd.png');
            assert.equal(util.removeFileScheme('RandomComponentLibraryName:/images/channel-poster_hd.png'), '/images/channel-poster_hd.png');
        });

        it('should should not modify the path when there is no scheme', () => {
            assert.equal(util.removeFileScheme('/images/channel-poster_hd.png'), '/images/channel-poster_hd.png');
            assert.equal(util.removeFileScheme('ages/channel-poster_hd.png'), 'ages/channel-poster_hd.png');
        });
    });

    describe('getFileScheme', () => {
        it('should return the leading scheme', () => {
            assert.equal(util.getFileScheme('pkg:/images/channel-poster_hd.png'), 'pkg:');
            assert.equal(util.getFileScheme('RandomComponentLibraryName:/images/channel-poster_hd.png'), 'randomcomponentlibraryname:');
        });

        it('should should return null when there is no scheme', () => {
            assert.equal(util.getFileScheme('/images/channel-poster_hd.png'), null);
            assert.equal(util.getFileScheme('ages/channel-poster_hd.png'), null);
        });
    });

    describe('convertManifestToObject', () => {
        let fileContents: string;
        let expectedManifestObject: Record<string, string>;
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
            `.replace(/ {4}/g, '');

            expectedManifestObject = {
                title: 'HeroGridChannel',
                subtitle: 'Roku Sample Channel App',
                'major_version': '1',
                'minor_version': '1',
                'build_version': '00001',
                'mm_icon_focus_hd': 'pkg:/images/channel-poster_hd.png',
                'mm_icon_focus_sd': 'pkg:/images/channel-poster_sd.png',
                'splash_screen_sd': 'pkg:/images/splash-screen_sd.jpg',
                'splash_screen_hd': 'pkg:/images/splash-screen_hd.jpg',
                'splash_screen_fhd': 'pkg:/images/splash-screen_fhd.jpg',
                'splash_color': '#808080',
                'splash_min_time': '0',
                'ui_resolutions': 'fhd',
                'confirm_partner_button': '1',
                'bs_const': 'const=false;const2=true;const3=false'
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

    describe('concealObject', () => {
        it('does not conceal anything when no secret keys are provided', () => {
            expect(
                [...util.concealObject({ alpha: 'a', beta: 'b' }, [])]
            ).to.eql([
                ['alpha', { value: 'a', originalValue: 'a' }],
                ['beta', { value: 'b', originalValue: 'b' }]
            ]);
        });

        it('does not crash for unrecognized secret keys', () => {
            expect(
                [...util.concealObject({ alpha: 'a', beta: 'b' }, [undefined, '', false as unknown as string])]
            ).to.eql([
                ['alpha', { value: 'a', originalValue: 'a' }],
                ['beta', { value: 'b', originalValue: 'b' }]
            ]);
        });

        it('does not crash for undefined secret values', () => {
            expect(
                [...util.concealObject({ alpha: 'a', beta: undefined }, ['beta'])]
            ).to.eql([
                ['alpha', { value: 'a', originalValue: 'a' }],
                ['beta', { value: undefined, originalValue: undefined }]
            ]);
        });

        it('ignores blank and empty strings', () => {
            expect(
                [...util.concealObject({ alpha: 'alpha', beta: '' }, ['beta'])]
            ).to.eql([
                ['alpha', { value: 'alpha', originalValue: 'alpha' }],
                ['beta', { value: '', originalValue: '' }]
            ]);
        });

        it('conceals various value types', () => {
            //prefill the cache so we always know what it'll contain for this key
            util['concealCache'].set('123', 'abc');
            util['concealCache'].set('456', 'def');
            expect(
                [...util.concealObject({ alpha: '123', beta: 'beta 123 456', charlie: '456', delta: 123 }, ['alpha', 'charlie'])]
            ).to.eql([
                ['alpha', { value: 'abc', originalValue: '123' }],
                ['beta', { value: 'beta abc def', originalValue: 'beta 123 456' }],
                ['charlie', { value: 'def', originalValue: '456' }],
                ['delta', { value: 123, originalValue: 123 }]
            ]);
        });
    });

    describe('showTimedNotification', () => {
        let clock: sinonActual.SinonFakeTimers;
        let progressStub: { report: sinonActual.SinonStub };
        let withProgressStub: sinonActual.SinonStub;

        // clock.tick() is synchronous so it only fires the first setTimeout in the loop.
        // The next iteration's setTimeout isn't registered until the await microtask runs.
        // This helper ticks one interval at a time and flushes the microtask queue between each.
        async function tickMs(ms: number, intervalMs = 100) {
            const steps = ms / intervalMs;
            for (let i = 0; i < steps; i++) {
                clock.tick(intervalMs);
                await Promise.resolve();
            }
        }

        beforeEach(() => {
            clock = sinon.useFakeTimers();
            progressStub = { report: sinon.stub() };
            withProgressStub = sinon.stub(vscode.window, 'withProgress').callsFake((_options, action) => {
                return action(progressStub);
            });
        });

        it('calls withProgress with the supplied message and Notification location', async () => {
            const promise = util.showTimedNotification('Hello World');
            await tickMs(2000);
            await promise;

            expect(withProgressStub.calledOnce).to.be.true;
            expect(withProgressStub.firstCall.args[0]).to.eql({
                location: vscode.ProgressLocation.Notification,
                title: 'Hello World'
            });
        });

        it('reports progress incrementally until complete', async () => {
            const promise = util.showTimedNotification('Loading', 1000);
            await tickMs(1000);
            await promise;

            // 1000ms / 100ms interval = 10 steps
            expect(progressStub.report.callCount).to.equal(10);
            const increment = progressStub.report.firstCall.args[0].increment;
            expect(increment).to.equal(10); // 100 / 10 steps
        });

        it('uses 2000ms as the default duration', async () => {
            const promise = util.showTimedNotification('Default');
            await tickMs(2000);
            await promise;

            // 2000ms / 100ms interval = 20 steps
            expect(progressStub.report.callCount).to.equal(20);
        });

        it('resolves only after the full duration has elapsed', async () => {
            let resolved = false;
            const promise = util.showTimedNotification('Test', 500).then(() => {
                resolved = true;
            });

            await tickMs(400);
            expect(resolved).to.be.false;

            await tickMs(100);
            await promise;
            expect(resolved).to.be.true;
        });
    });

    describe('getConfigurationValueIfDefined', () => {
        it('returns undefined when not specified in the config', () => {
            expect(
                util.getConfigurationValueIfDefined('brightscript.notThere')
            ).to.be.undefined;
        });

        it('returns default value when not specified in the config', () => {
            expect(
                util.getConfigurationValueIfDefined('brightscript.notThere', true)
            ).to.eql(true);
        });

        it('returns undefined even if there is a default value globally', () => {
            sinon.stub(vscode.workspace, 'getConfiguration').returns({
                inspect: () => {
                    return {
                        defaultLanguageValue: undefined,
                        defaultValue: true,
                        globalLanguageValue: undefined,
                        globalValue: undefined,
                        workspaceFolderLanguageValue: undefined,
                        workspaceFolderValue: undefined,
                        workspaceLanguageValue: undefined,
                        workspaceValue: undefined
                    };
                }
            } as any);
            expect(
                util.getConfigurationValueIfDefined('brightscript.notThere')
            ).to.be.undefined;
        });
    });
});
