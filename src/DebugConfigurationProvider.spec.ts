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
let configProvider: BrightScriptDebugConfigurationProvider;

beforeEach(() => {
    let context = {
        workspaceState: {
            update: () => { return Promise.resolve(); }
        }
    };
    configProvider = new BrightScriptDebugConfigurationProvider(<any>context);
    c = configProvider;
    sinon = sinonImport.createSandbox();
});
afterEach(() => {
    sinon.restore();
});

describe('BrightScriptConfigurationProvider', () => {
    describe('resolveDebugConfiguration', () => {
        it('handles loading declared values from .env files', async () => {
            sinon.stub(configProvider.util, 'fileExists').returns(Promise.resolve(true));
            let stub = sinon.stub(configProvider.fsExtra, 'readFile').callsFake((filePath: string) => {
                //should load env file from proper place
                expect(filePath).to.equal('/some/project/.env');
                return Promise.resolve(Buffer.from('ROKU_PASSWORD=pass1234'));
            });
            sinon.stub(configProvider.util, 'getBrsConfig').returns(Promise.resolve({}));
            let config = await configProvider.resolveDebugConfiguration(<any>{ uri: { fsPath: '/some/project' } }, <any>{
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
            sinon.stub(configProvider.util, 'fileExists').returns(Promise.resolve(true));
            let stub = sinon.stub(configProvider.fsExtra, 'readFile').callsFake((filePath: string) => {
                //should load env file from proper place
                expect(filePath).to.equal('/some/project/.env');
                return Promise.resolve(Buffer.from('USERNAME=bob'));
            });
            sinon.stub(configProvider.util, 'getBrsConfig').returns(Promise.resolve({}));
            let config = await configProvider.resolveDebugConfiguration(<any>{ uri: { fsPath: '/some/project' } }, <any>{
                host: '127.0.0.1',
                type: 'brightscript',
                envFile: '${workspaceFolder}/.env',
                password: '${env:ROKU_PASSWORD}'
            });
            expect(config.password).to.equal('${env:ROKU_PASSWORD}');
            expect(stub.called).to.be.true;
        });

        it('throws on missing .env file', async () => {
            sinon.stub(configProvider.util, 'fileExists').returns(Promise.resolve(false));
            sinon.stub(configProvider.util, 'getBrsConfig').returns(Promise.resolve({}));

            try {
                let config = await configProvider.resolveDebugConfiguration(<any>{ uri: { fsPath: '/some/project' } }, <any>{
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
            sinon.stub(configProvider.util, 'fileExists').returns(Promise.resolve(true));
            sinon.stub(configProvider.util, 'getBrsConfig').returns(Promise.resolve({}));

            let stub = sinon.stub(configProvider.fsExtra, 'readFile').callsFake((filePath: string) => {
                //should load env file from proper place
                expect(filePath).to.equal('/some/project/.env');
                return Promise.resolve(Buffer.from('ROKU_PASSWORD=pass1234'));
            });
            let config = await configProvider.resolveDebugConfiguration(<any>{ uri: { fsPath: '/some/project' } }, <any>{
                host: '127.0.0.1',
                type: 'brightscript',
                envFile: '/some/project/.env',
                password: '${env:ROKU_PASSWORD}'
            });
            expect(config.password).to.equal('pass1234');
            expect(stub.called).to.be.true;
        });
    });
});
