/* tslint:disable:no-unused-expression */
/* tslint:disable:no-var-requires */
import { assert, expect } from 'chai';
import * as sinonImport from 'sinon';

let sinon: sinonImport.SinonSandbox;
let c: any;
let Module = require('module');

import { vscode } from './mockVscode.spec';

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

import { BrightScriptDebugConfigurationProvider } from './DebugConfigurationProvider';
import { WorkspaceFolder } from 'vscode';
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
        var folder: WorkspaceFolder;
        beforeEach(() => {
            folder = <any>{
                uri: { fsPath: '/some/project' }
            };
            sinon.stub(configProvider.util, 'fileExists').returns(Promise.resolve(true));
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
            expect(config.password).to.equal('${env:ROKU_PASSWORD}');
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

        it('uses the default packagePort and remotePort', async () => {
            let config = await configProvider.resolveDebugConfiguration(folder, <any>{
                host: '127.0.0.1',
                password: 'password'
            });
            expect(config.packagePort).to.equal(80);
            expect(config.remotePort).to.equal(8060);
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
