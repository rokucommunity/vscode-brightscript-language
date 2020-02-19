/* tslint:disable:no-unused-expression */
/* tslint:disable:no-var-requires */
import * as brighterscript from 'brighterscript';
import { assert, expect } from 'chai';
import * as path from 'path';
import * as sinonImport from 'sinon';
import { WorkspaceFolder } from 'vscode';
import Uri from 'vscode-uri';

import { BrightScriptDebugConfigurationProvider } from './DebugConfigurationProvider';
import { vscode } from './mockVscode.spec';

let sinon: sinonImport.SinonSandbox;
let c: any;
let Module = require('module');

let commandsMock;
let n = brighterscript.util.standardizePath.bind(brighterscript.util);

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
                expect(n(filePath)).to.equal(n('/some/project/.env'));
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
});
