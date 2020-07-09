/* tslint:disable:no-unused-expression */
/* tslint:disable:no-var-requires */
import * as brighterscript from 'brighterscript';
import { assert, expect } from 'chai';
import * as path from 'path';
import { createSandbox } from 'sinon';
import { WorkspaceFolder } from 'vscode';
import Uri from 'vscode-uri';

import { BrightScriptDebugConfigurationProvider } from './DebugConfigurationProvider';
import { vscode } from './mockVscode.spec';
import { standardizePath as s } from 'brighterscript';
import * as fsExtra from 'fs-extra';
import { config } from 'process';

let sinon = createSandbox();
let c: any;
let Module = require('module');
let cwd = s`${path.dirname(__dirname)}`;
const rootDir = s`${cwd}/rootDir`;

let commandsMock;

//override the "require" call to mock certain items
const { require: oldRequire } = Module.prototype;
Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

let configProvider: BrightScriptDebugConfigurationProvider;

beforeEach(() => {
    let context = {
        workspaceState: {
            update: () => { return Promise.resolve(); }
        }
    };

    let activeDeviceManager = {
        getActiveDevices: () => []
    };
    configProvider = new BrightScriptDebugConfigurationProvider(<any>context, activeDeviceManager);
    c = configProvider;
});
afterEach(() => {
    sinon.restore();
});

describe('BrightScriptConfigurationProvider', () => {
    describe('resolveDebugConfiguration', () => {
        let folder: WorkspaceFolder;
        let existingConfigDefaults;
        beforeEach(() => {
            folder = <any>{
                uri: Uri.parse('file:/some/project')
            };
            sinon.stub(configProvider.util, 'fileExists').returns(Promise.resolve(true));

            const configDefaults = (configProvider as any).configDefaults;
            existingConfigDefaults = {
                ...configDefaults
            };

            // Override any properties that would cause a prompt if not overridden
            configDefaults.host = '192.168.1.100';
            configDefaults.password = 'aaaa';
        });

        afterEach(() => {
            (configProvider as any).configDefaults = existingConfigDefaults;
        });

        it('handles loading declared values from .env files', async () => {
            let stub = sinon.stub(configProvider.fsExtra, 'readFile').callsFake((filePath: string) => {
                //should load env file from proper place
                expect(s`${filePath}`).to.equal(s`/some/project/.env`);
                return Promise.resolve(Buffer.from('ROKU_PASSWORD=pass1234'));
            });
            sinon.stub(configProvider, 'getBrsConfig').returns(Promise.resolve({}));
            let config = await configProvider.resolveDebugConfiguration(folder, <any>{
                host: '127.0.0.1',
                type: 'brightscript',
                envFile: '${workspaceFolder}/.env',
                password: '${env:ROKU_PASSWORD}',
                enableDebuggerAutoRecovery: false,
                stopDebuggerOnAppExit: true
            });
            expect(config.password).to.equal('pass1234');
            expect(stub.called).to.be.true;
        });

        it('handles missing values from .env files', async () => {
            let stub = sinon.stub(configProvider.fsExtra, 'readFile').callsFake((filePath: string) => {
                //should load env file from proper place
                expect(filePath).to.equal('/some/project/.env');
                return Promise.resolve(Buffer.from('USERNAME=bob'));
            });
            sinon.stub(configProvider, 'getBrsConfig').returns(Promise.resolve({}));
            let config = await configProvider.resolveDebugConfiguration(<any>{ uri: { fsPath: '/some/project' } }, <any>{
                host: '127.0.0.1',
                type: 'brightscript',
                envFile: '${workspaceFolder}/.env',
                password: '${env:ROKU_PASSWORD}'
            });
            expect(config.password).to.equal((configProvider as any).configDefaults.password);
            expect(stub.called).to.be.true;
        });

        it('throws on missing .env file', async () => {
            sinon.restore();
            sinon.stub(configProvider.util, 'fileExists').returns(Promise.resolve(false));
            sinon.stub(configProvider, 'getBrsConfig').returns(Promise.resolve({}));

            try {
                let config = await configProvider.resolveDebugConfiguration(folder, <any>{
                    host: '127.0.0.1',
                    type: 'brightscript',
                    envFile: '${workspaceFolder}/.env',
                    password: '${env:ROKU_PASSWORD}'
                });
                assert.fail('Should have thrown exception');
            } catch (e) {
                expect(e.message).to.contain('Cannot find .env');
            }
        });

        it('handles non ${workspaceFolder} replacements', async () => {
            sinon.stub(configProvider, 'getBrsConfig').returns(Promise.resolve({}));
            let stub = sinon.stub(configProvider.fsExtra, 'readFile').callsFake((filePath: string) => {
                //should load env file from proper place
                expect(filePath).to.equal('/some/project/.env');
                return Promise.resolve(Buffer.from('ROKU_PASSWORD=pass1234'));
            });
            let config = await configProvider.resolveDebugConfiguration(folder, <any>{
                host: '127.0.0.1',
                type: 'brightscript',
                envFile: '/some/project/.env',
                password: '${env:ROKU_PASSWORD}'
            });
            expect(config.password).to.equal('pass1234');
            expect(stub.called).to.be.true;
        });

        it('uses the default values if not provided', async () => {
            const config = await configProvider.resolveDebugConfiguration(folder, <any>{});
            const configDefaults = (configProvider as any).configDefaults;
            for (const key in configDefaults) {
                if (key === 'outDir') {
                    expect(
                        path.normalize(config[key])
                    ).to.equal(
                        path.normalize(`${folder.uri.path}/out/`)
                    );
                } else {
                    expect(config[key], `Expected "${key}" to match the default`).to.equal(configDefaults[key]);
                }
            }
        });

        it('allows for overriding packagePort and remotePort', async () => {
            let config = await configProvider.resolveDebugConfiguration(folder, <any>{
                host: '127.0.0.1',
                password: 'password',
                packagePort: 1234,
                remotePort: 5678
            });
            expect(config.packagePort).to.equal(1234);
            expect(config.remotePort).to.equal(5678);
        });
    });

    describe('processLogfilePath', () => {
        let tmpPath = `${rootDir}/.tmp`;
        beforeEach(() => {
            try { fsExtra.emptyDirSync(tmpPath); } catch (e) { }
        });
        afterEach(() => {
            try { fsExtra.emptyDirSync(tmpPath); } catch (e) { }
        });
        let workspaceFolder = <any>{
            uri: { fsPath: tmpPath }
        };
        it('does nothing when prop is falsey', () => {
            expect(configProvider.processLogfilePath(undefined, undefined)).not.to.be.ok;
            expect(configProvider.processLogfilePath(undefined, <any>{}).logfilePath).not.to.be.ok;
            expect(configProvider.processLogfilePath(undefined, <any>{ logfilePath: null }).logfilePath).not.to.be.ok;
            expect(configProvider.processLogfilePath(undefined, <any>{ logfilePath: '' }).logfilePath).not.to.be.ok;
            //it trims all whitespace too
            expect(configProvider.processLogfilePath(undefined, <any>{ logfilePath: ' \n\t' }).logfilePath.trim()).not.to.be.ok;
        });

        it('replaces workspaceFolder', () => {
            expect(configProvider.processLogfilePath(workspaceFolder, <any>{
                logfilePath: '${workspaceFolder}/logfile.log'
            }).logfilePath).to.equal(s`${tmpPath}/logfile.log`);
        });

        it('should create the directory path and file', () => {
            configProvider.processLogfilePath(workspaceFolder, <any>{
                logfilePath: s`${tmpPath}/a/b/c/brs.log`
            });
            expect(fsExtra.pathExistsSync(s`${tmpPath}/a/b/c/brs.log`)).to.be.true;
        });

        it('should not delete the files in the log folder if it already exists', () => {
            fsExtra.writeFileSync(`${tmpPath}/test.txt`, '');
            configProvider.processLogfilePath(workspaceFolder, <any>{
                logfilePath: s`${tmpPath}/brs.log`
            });
            expect(fsExtra.pathExistsSync(s`${tmpPath}/test.txt`)).to.be.true;
        });

        it('should not re-create the logfile if it already exists', () => {
            fsExtra.writeFileSync(`${tmpPath}/brs.log`, 'test contents');
            configProvider.processLogfilePath(workspaceFolder, <any>{
                logfilePath: s`${tmpPath}/brs.log`
            });
            expect(fsExtra.readFileSync(`${tmpPath}/brs.log`).toString()).equals('test contents');
        });

        it('throws when creating the directory path and file when invalid characters are encountered', () => {
            try {
                configProvider.processLogfilePath(workspaceFolder, <any>{
                    logfilePath: s`${tmpPath}/ZZZ/brs.log`.replace('ZZZ', '<>')
                });
                expect(true, 'Should have thrown').to.be.false;
            } catch (e) {
                expect(true, 'Successfully threw').to.be.true;
            }
        });
    });

    describe('processEnvFile', () => {
        let folder = {
            uri: {
                fsPath: process.cwd()
            }
        };
        it('does nothing if .envFile is not specified', async () => {
            let config = await c.processEnvFile(folder, {
                rootDir: '${env:ROOT_DIR}'
            });
            expect(config.rootDir).to.equal('${env:ROOT_DIR}');
        });

        it('throws exception when .env file does not exist', async () => {
            let stub = sinon.stub(configProvider.util, 'fileExists').returns(Promise.resolve(false));
            let threw = false;
            try {
                await c.processEnvFile(folder, {
                    envFile: '${workspaceFolder}/.env'
                });
            } catch (e) {
                threw = true;
            }
            expect(threw).to.be.true;
        });

        it('replaces ${workspaceFolder} in .envFile path', async () => {
            let stub = sinon.stub(configProvider.util, 'fileExists').returns(Promise.resolve(false));
            try {
                await c.processEnvFile(folder, {
                    envFile: '${workspaceFolder}/.env'
                });
            } catch (e) { }
            expect(stub.callCount).to.equal(1);
            expect(stub.getCalls()[0].args[0]).to.equal(folder.uri.fsPath + '/.env');
        });

        it('replaces same env value multiple times in a config', async () => {
            sinon.stub(configProvider.util, 'fileExists').returns(Promise.resolve(true));
            sinon.stub(c.fsExtra, 'readFile').returns(Promise.resolve(`
                PASSWORD=password
            `));
            let config = await c.processEnvFile(folder, {
                envFile: '${workspaceFolder}/.env',
                rootDir: '${env:PASSWORD}',
                stagingFolderPath: '${env:PASSWORD}'
            });

            expect(config.rootDir).to.equal('password');
            expect(config.stagingFolderPath).to.equal('password');
        });

        it('does not replace text outside of the ${} syntax', async () => {
            sinon.stub(configProvider.util, 'fileExists').returns(Promise.resolve(true));
            sinon.stub(c.fsExtra, 'readFile').returns(Promise.resolve(`
                PASSWORD=password
            `));
            let config = await c.processEnvFile(folder, {
                'envFile': '${workspaceFolder}/.env',
                //this key looks exactly like the text within the ${}, make sure it persists. (dunno why someone would do this...)
                'env:PASSWORD': '${env:PASSWORD}'
            });

            expect(config['env:PASSWORD']).to.equal('password');
        });

        it('ignores ${env:} items that are not found in the env file', async () => {
            sinon.stub(configProvider.util, 'fileExists').returns(Promise.resolve(true));
            sinon.stub(c.fsExtra, 'readFile').returns(Promise.resolve(`
                PASSWORD=password
            `));
            let config = await c.processEnvFile(folder, {
                envFile: '${workspaceFolder}/.env',
                rootDir: '${env:NOT_PASSWORD}'
            });

            expect(config.rootDir).to.equal('${env:NOT_PASSWORD}');
        });

        it('loads env file when not using ${workspaceFolder} var', async () => {
            sinon.stub(configProvider.util, 'fileExists').returns(Promise.resolve(true));
            let stub = sinon.stub(c.fsExtra, 'readFile').returns(Promise.resolve(`
            `));
            let config = await c.processEnvFile(folder, {
                envFile: '.env'
            });
            expect(stub.getCalls()[0]?.args[0]).to.equal('.env');
        });
    });
});
