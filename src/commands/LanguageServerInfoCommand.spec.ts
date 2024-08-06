import * as fsExtra from 'fs-extra';
import { standardizePath as s } from 'brighterscript';
import { LanguageServerInfoCommand } from './LanguageServerInfoCommand';
import { expect } from 'chai';
import { createSandbox } from 'sinon';
import * as resolve from 'resolve';

const sinon = createSandbox();

const cwd = s`${__dirname}../../../`;
const tempDir = s`${cwd}/.tmp`;
const embeddedBscVersion = require('brighterscript/package.json').version;

describe('LanguageServerInfoCommand', () => {
    let command: LanguageServerInfoCommand;
    beforeEach(() => {
        sinon.restore();
        fsExtra.ensureDirSync(tempDir);
        command = new LanguageServerInfoCommand();
        const orig = resolve.sync.bind(resolve) as typeof resolve['sync'];
        sinon.stub(resolve, 'sync').callsFake((moduleName: string, options?: any) => {
            return orig(moduleName, {
                ...options ?? {},
                packageIterator: (request, start, getPackageCandidates, opts) => {
                    const candidates = getPackageCandidates();
                    const filtered = candidates.filter(candidate => s(candidate).startsWith(tempDir));
                    return filtered;
                }
            });
        });
    });

    afterEach(() => {
        sinon.restore();
        fsExtra.removeSync(tempDir);
    });

    describe('getBscVersionsFromNpm', function() {
        this.timeout(20_000);
        it('returns a list of versions', async () => {
            const results = await command['getBscVersionsFromNpm']();
            // `results` is entire list of all bsc versions, live from npm. so we obviously can't make a test that ensure they're all correct.
            // so just check that certain values are sorted correctly
            expect(results.map(x => x.version).filter(x => x.startsWith('0.64'))).to.eql([
                '0.64.4',
                '0.64.3',
                '0.64.2',
                '0.64.1',
                '0.64.0'
            ]);
        });
    });

    describe('discoverBrighterScriptVersions', () => {
        function writePackage(version: string) {
            fsExtra.outputJsonSync(s`${tempDir}/package.json`, {
                name: 'vscode-tests',
                private: true,
                dependencies: {
                    brighterscript: version
                }
            });
            fsExtra.outputFileSync(s`${tempDir}/node_modules/brighterscript/dist/index.js`, '');
            fsExtra.outputJsonSync(s`${tempDir}/node_modules/brighterscript/package.json`, {
                name: 'brighterscript',
                version: version,
                main: 'dist/index.js',
                dependencies: {}
            });
        }
        it('finds embedded version when node_modules is not present', () => {
            expect(
                command['discoverBrighterScriptVersions']([tempDir])
            ).to.eql([{
                label: `Use VSCode's version`,
                description: embeddedBscVersion
            }]);
        });

        it('finds embedded version when node_modules is present but brighterscript is not available', () => {
            fsExtra.outputJsonSync(s`${tempDir}/package.json`, {
                name: 'vscode-tests',
                private: true,
                dependencies: {}
            });
            fsExtra.outputJsonSync(s`${tempDir}/node_modules/is-number/package.json`, {
                name: 'is-number',
                dependencies: {}
            });
            expect(
                command['discoverBrighterScriptVersions']([tempDir])
            ).to.eql([{
                label: `Use VSCode's version`,
                description: embeddedBscVersion
            }]);
        });

        it('finds brighterscript version from node_modules', () => {
            writePackage('1.2.3');
            expect(
                command['discoverBrighterScriptVersions']([tempDir])
            ).to.eql([{
                label: `Use VSCode's version`,
                description: embeddedBscVersion
            }, {
                label: `Use Workspace Version`,
                description: '1.2.3',
                detail: 'node_modules/brighterscript'
            }]);
        });

        it('does not cache brighterscript version from node_modules in subsequent calls', () => {
            writePackage('1.2.3');
            expect(
                command['discoverBrighterScriptVersions']([tempDir])
            ).to.eql([{
                label: `Use VSCode's version`,
                description: embeddedBscVersion
            }, {
                label: `Use Workspace Version`,
                description: '1.2.3',
                detail: 'node_modules/brighterscript'
            }]);

            writePackage('2.3.4');
            expect(
                command['discoverBrighterScriptVersions']([tempDir])
            ).to.eql([{
                label: `Use VSCode's version`,
                description: embeddedBscVersion
            }, {
                label: `Use Workspace Version`,
                description: '2.3.4',
                detail: 'node_modules/brighterscript'
            }]);
        });

        it('excludes value when module is deleted since last time', () => {
            writePackage('1.2.3');
            expect(
                command['discoverBrighterScriptVersions']([tempDir])
            ).to.eql([{
                label: `Use VSCode's version`,
                description: embeddedBscVersion
            }, {
                label: `Use Workspace Version`,
                description: '1.2.3',
                detail: 'node_modules/brighterscript'
            }]);

            fsExtra.removeSync(`${tempDir}/node_modules`);
            expect(
                command['discoverBrighterScriptVersions']([tempDir])
            ).to.eql([{
                label: `Use VSCode's version`,
                description: embeddedBscVersion
            }]);
        });
    });
});
