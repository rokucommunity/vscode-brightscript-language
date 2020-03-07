/* tslint:disable:no-unused-expression */
/* tslint:disable:no-var-requires */
import { assert, expect } from 'chai';
import * as sinonImport from 'sinon';
import { WorkspaceFolder } from 'vscode';
import * as path from 'path';
import { BrightScriptDebugConfigurationProvider } from './DebugConfigurationProvider';
import { vscode } from './mockVscode.spec';
import { fileUtils, standardizePath as s } from './debugServer/FileUtils';
import * as fsExtra from 'fs-extra';

let sinon: sinonImport.SinonSandbox;
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
    } else if (file === './BrightScriptCommands') {
        let command = { registerCommands: () => { } };
        commandsMock = sinon.mock(command);
        return { getBrightScriptCommandsInstance: () => command };
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
    sinon = sinonImport.createSandbox();
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
                uri: { fsPath: '/some/project' }
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
                expect(filePath).to.equal('/some/project/.env');
                return Promise.resolve(Buffer.from('ROKU_PASSWORD=pass1234'));
            });
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
            let config = await configProvider.resolveDebugConfiguration(folder, <any>{
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
                expect(config[key]).to.equal(configDefaults[key]);
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
});
