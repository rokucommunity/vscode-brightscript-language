import { assert, expect } from 'chai';
import * as path from 'path';
import { createSandbox } from 'sinon';
import type { WorkspaceFolder } from 'vscode';
import Uri from 'vscode-uri';
import type { BrightScriptLaunchConfiguration } from './DebugConfigurationProvider';
import { UserInputManager } from './managers/UserInputManager';
import { BrightScriptDebugConfigurationProvider } from './DebugConfigurationProvider';
import { vscode } from './mockVscode.spec';
import { standardizePath as s } from 'brighterscript';
import * as fsExtra from 'fs-extra';
import { DeviceManager } from './deviceDiscovery/DeviceManager';
import { GlobalStateManager } from './GlobalStateManager';
import { rokuDeploy } from 'roku-deploy';
import { CredentialStore } from './managers/CredentialStore';

const sinon = createSandbox();
const Module = require('module');
const cwd = s`${path.dirname(__dirname)}`;
const tempDir = s`${cwd}/.tmp`;
const rootDir = s`${tempDir}/rootDir`;

//override the "require" call to mock certain items
const { require: oldRequire } = Module.prototype;
Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

describe('BrightScriptConfigurationProvider', () => {

    let configProvider: BrightScriptDebugConfigurationProvider;
    let folder: WorkspaceFolder;
    let userInputManager: UserInputManager;
    let deviceManager: DeviceManager;
    let credentialStore: CredentialStore;

    beforeEach(() => {
        fsExtra.emptyDirSync(tempDir);

        folder = {
            uri: Uri.file(rootDir),
            name: 'test-folder',
            index: 0
        };

        //prevent the DeviceManager from actually running
        sinon.stub(DeviceManager.prototype as any, 'initialize').callsFake(() => { });
        sinon.stub(DeviceManager.prototype as any, 'setupConfiguration').callsFake(() => { });
        sinon.stub(DeviceManager.prototype as any, 'setupWindowFocusHandling').callsFake(() => { });
        sinon.stub(DeviceManager.prototype as any, 'setupMonitors').callsFake(() => { });
        const globalStateManager = new GlobalStateManager(vscode.context);
        deviceManager = new DeviceManager(vscode.context, globalStateManager);
        userInputManager = new UserInputManager(deviceManager);
        credentialStore = new CredentialStore(vscode.context);

        configProvider = new BrightScriptDebugConfigurationProvider(
            vscode.context,
            null,
            vscode.window.createOutputChannel('Extension'),
            userInputManager,
            null, // BrightScriptCommands is not used in this test
            deviceManager,
            credentialStore
        );
    });

    afterEach(() => {
        fsExtra.emptyDirSync(tempDir);
        sinon.restore();
    });

    describe('resolveDebugConfiguration', () => {
        let existingConfigDefaults;
        beforeEach(() => {
            const configDefaults = configProvider['configDefaults'];
            existingConfigDefaults = {
                ...configDefaults
            };

            // Override any properties that would cause a prompt if not overridden
            configDefaults.host = '192.168.1.100';
            configDefaults.password = 'aaaa';
            //return an empty deviceInfo response
            sinon.stub(rokuDeploy, 'getDeviceInfo').returns(Promise.reject(new Error('Failure during test')));
            // short-circuit the password candidate validation loop so tests can focus on config resolution logic
            sinon.stub(DeviceManager.prototype, 'validateDevicePassword').resolves('ok');
        });

        afterEach(() => {
            (configProvider as any).configDefaults = existingConfigDefaults;
        });

        it('handles loading declared values from .env files', async () => {
            fsExtra.outputFileSync(`${rootDir}/.env`, 'ROKU_PASSWORD=pass1234');

            sinon.stub(configProvider, 'getBsConfig').returns({});

            let config = await configProvider.resolveDebugConfiguration(folder, <any>{
                host: '127.0.0.1',
                type: 'brightscript',
                envFile: '${workspaceFolder}/.env',
                password: '${env:ROKU_PASSWORD}',
                enableDebuggerAutoRecovery: false,
                stopDebuggerOnAppExit: true
            });
            expect(config.password).to.equal('pass1234');
        });

        it('handles missing values from .env files', async () => {
            fsExtra.outputFileSync(`${rootDir}/.env`, 'USERNAME=bob');

            sinon.stub(configProvider, 'getBsConfig').returns({});

            let config = await configProvider.resolveDebugConfiguration(folder, <any>{
                host: '127.0.0.1',
                type: 'brightscript',
                envFile: '${workspaceFolder}/.env',
                password: '${env:ROKU_PASSWORD}'
            });
            expect(config.password).to.equal((configProvider as any).configDefaults.password);
        });

        it('throws on missing .env file', async () => {
            sinon.restore();
            sinon.stub(configProvider.util, 'fileExists').returns(Promise.resolve(false));
            sinon.stub(configProvider, 'getBsConfig').returns({});

            try {
                await configProvider.resolveDebugConfiguration(folder, <any>{
                    host: '127.0.0.1',
                    type: 'brightscript',
                    envFile: '${workspaceFolder}/.env',
                    password: '${env:ROKU_PASSWORD}'
                });
                assert.fail('Should have thrown exception');
            } catch (e) {
                expect((e as Error)?.message).to.contain('Cannot find .env');
            }
        });

        it('handles non ${workspaceFolder} replacements', async () => {
            sinon.stub(configProvider, 'getBsConfig').returns({});

            fsExtra.outputFileSync(`${rootDir}/some/project/.env`, 'ROKU_PASSWORD=pass1234');

            const config = await configProvider.resolveDebugConfiguration(folder, <any>{
                host: '127.0.0.1',
                type: 'brightscript',
                envFile: `${rootDir}/some/project/.env`,
                password: '${env:ROKU_PASSWORD}'
            });
            expect(config.password).to.equal('pass1234');
        });

        it('uses the default values if not provided', async () => {
            const config = await configProvider.resolveDebugConfiguration(folder, <any>{ type: 'brightscript' });
            const configDefaults = (configProvider as any).configDefaults;
            for (const key in configDefaults) {
                if (key === 'outDir') {
                    expect(
                        s`${config[key]}`
                    ).to.equal(
                        s`${folder.uri.fsPath}/out/`
                    );
                } else {
                    expect(config[key], `Expected "${key}" to match the default`).to.deep.equal(configDefaults[key]);
                }
            }
        });

        it('allows for overriding packagePort and remotePort', async () => {
            let config = await configProvider.resolveDebugConfiguration(folder, <any>{
                type: 'brightscript',
                host: '127.0.0.1',
                password: 'password',
                packagePort: 1234,
                remotePort: 5678
            });
            expect(config.packagePort).to.equal(1234);
            expect(config.remotePort).to.equal(5678);
        });

        it('allows using a bool value for remoteConfigMode', async () => {
            async function doTest(remoteControlMode: boolean, expected: any) {
                let config = await configProvider.resolveDebugConfiguration(folder, <any>{
                    type: 'brightscript',
                    remoteControlMode: remoteControlMode
                });
                expect(config.remoteControlMode).to.deep.equal(expected);
            }
            await doTest(true, { activateOnSessionStart: true, deactivateOnSessionEnd: true });
            await doTest(false, { activateOnSessionStart: false, deactivateOnSessionEnd: false });
            await doTest(undefined, { activateOnSessionStart: false, deactivateOnSessionEnd: false });
        });

        describe('F5 with no launch.json', () => {
            it('returns undefined when no project is discovered from the active file', async () => {
                (configProvider as any).rokuProjectDiscovery = {
                    resolveDebugConfigFromActiveFile: sinon.stub().resolves(undefined)
                };

                const result = await configProvider.resolveDebugConfiguration(folder, <any>{});

                expect(result).to.be.undefined;
            });

            it('returns undefined when rokuProjectDiscovery is not set', async () => {
                (configProvider as any).rokuProjectDiscovery = undefined;

                const result = await configProvider.resolveDebugConfiguration(folder, <any>{});

                expect(result).to.be.undefined;
            });

            it('processes the discovered config through the full resolution pipeline', async () => {
                const discoveredConfig = {
                    type: 'brightscript',
                    request: 'launch',
                    host: '192.168.1.200',
                    password: 'secret',
                    rootDir: '/project/out'
                };
                (configProvider as any).rokuProjectDiscovery = {
                    resolveDebugConfigFromActiveFile: sinon.stub().resolves(discoveredConfig)
                };

                const result = await configProvider.resolveDebugConfiguration(folder, <any>{});

                expect(result).to.not.be.undefined;
                expect(result.host).to.equal('192.168.1.200');
                expect(result.password).to.equal('secret');
            });
        });
    });

    describe('processLogfilePath', () => {
        let tmpPath = `${rootDir}/.tmp`;
        beforeEach(() => {
            try {
                fsExtra.emptyDirSync(tmpPath);
            } catch (e) { }
        });
        afterEach(() => {
            try {
                fsExtra.emptyDirSync(tmpPath);
            } catch (e) { }
        });
        let workspaceFolder = <any>{
            uri: { fsPath: tmpPath }
        };
        it('does nothing when prop is falsey', async () => {
            expect(await configProvider.processLogfilePath(undefined, undefined)).not.to.be.ok;
            expect((await configProvider.processLogfilePath(undefined, <any>{})).logfilePath).not.to.be.ok;
            expect((await configProvider.processLogfilePath(undefined, <any>{ logfilePath: null })).logfilePath).not.to.be.ok;
            expect((await configProvider.processLogfilePath(undefined, <any>{ logfilePath: '' })).logfilePath).not.to.be.ok;
            //it trims all whitespace too
            expect((await configProvider.processLogfilePath(undefined, <any>{ logfilePath: ' \n\t' })).logfilePath.trim()).not.to.be.ok;
        });

        it('replaces workspaceFolder', async () => {
            const value = await configProvider.processLogfilePath(workspaceFolder, <any>{
                logfilePath: '${workspaceFolder}/logfile.log'
            });
            expect(value.logfilePath).to.equal(s`${tmpPath}/logfile.log`);
        });

        it('should create the directory path and file', async () => {
            await configProvider.processLogfilePath(workspaceFolder, <any>{
                logfilePath: s`${tmpPath}/a/b/c/brs.log`
            });
            expect(fsExtra.pathExistsSync(s`${tmpPath}/a/b/c/brs.log`)).to.be.true;
        });

        it('should not delete the files in the log folder if it already exists', async () => {
            fsExtra.writeFileSync(`${tmpPath}/test.txt`, '');
            await configProvider.processLogfilePath(workspaceFolder, <any>{
                logfilePath: s`${tmpPath}/brs.log`
            });
            expect(fsExtra.pathExistsSync(s`${tmpPath}/test.txt`)).to.be.true;
        });

        it('should not re-create the logfile if it already exists', async () => {
            fsExtra.writeFileSync(`${tmpPath}/brs.log`, 'test contents');
            await configProvider.processLogfilePath(workspaceFolder, <any>{
                logfilePath: s`${tmpPath}/brs.log`
            });
            expect(fsExtra.readFileSync(`${tmpPath}/brs.log`).toString()).equals('test contents');
        });

        it('throws when creating the directory path and file when invalid characters are encountered', async () => {
            try {
                await configProvider.processLogfilePath(workspaceFolder, <any>{
                    logfilePath: s`${tmpPath}/ZZZ/brs.log`.replace('ZZZ', '<>')
                });
                expect(true, 'Should have thrown').to.be.false;
            } catch (e) {
                expect(true, 'Successfully threw').to.be.true;
            }
        });
    });

    describe('processDapLogFilePath', () => {
        const tmpPath = s`${rootDir}/.tmp`;
        const workspaceFolder = <any>{ uri: { fsPath: tmpPath } };

        beforeEach(() => {
            fsExtra.emptyDirSync(tmpPath);
        });
        afterEach(() => {
            fsExtra.emptyDirSync(tmpPath);
        });

        it('does nothing when debugAdapterProtocolLogging is falsey', () => {
            expect(configProvider.processDapLogFilePath(undefined, <any>{}).debugAdapterProtocolLogFilePath).not.to.be.ok;
            expect(configProvider.processDapLogFilePath(undefined, <any>{ debugAdapterProtocolLogging: false }).debugAdapterProtocolLogFilePath).not.to.be.ok;
        });

        it('sets debugAdapterProtocolLogFilePath when enabled', () => {
            const result = configProvider.processDapLogFilePath(workspaceFolder, <any>{ debugAdapterProtocolLogging: true });
            expect(result.debugAdapterProtocolLogFilePath).to.include('debugAdapterProtocol.log');
            expect(result.debugAdapterProtocolLogFilePath).to.include(tmpPath);
        });

        it('prepends a timestamp', () => {
            const result = configProvider.processDapLogFilePath(workspaceFolder, <any>{ debugAdapterProtocolLogging: true });
            // ISO timestamp format: 2026-03-26T00-00-00
            expect(result.debugAdapterProtocolLogFilePath).to.match(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
        });

        it('writes to workspace logs/ folder', () => {
            const result = configProvider.processDapLogFilePath(workspaceFolder, <any>{ debugAdapterProtocolLogging: true });
            expect(result.debugAdapterProtocolLogFilePath).to.include(path.join(tmpPath, 'logs'));
        });

        it('creates the log directory', () => {
            configProvider.processDapLogFilePath(workspaceFolder, <any>{ debugAdapterProtocolLogging: true });
            expect(fsExtra.pathExistsSync(path.join(tmpPath, 'logs'))).to.be.true;
        });
    });

    describe('processEnvFile', () => {
        function processEnvFile(folder: WorkspaceFolder, config: Partial<BrightScriptLaunchConfiguration> & Record<string, any>) {
            return configProvider['processEnvFile'](folder, config as any);
        }
        it('does nothing if .envFile is not specified', async () => {
            let config = await processEnvFile(folder, {
                rootDir: '${env:ROOT_DIR}'
            });
            expect(config.rootDir).to.equal('${env:ROOT_DIR}');
        });

        it('throws exception when .env file does not exist', async () => {
            let threw = false;
            try {
                await processEnvFile(folder, {
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
                await processEnvFile(folder, {
                    envFile: '${workspaceFolder}/.env'
                });
            } catch (e) { }
            expect(stub.callCount).to.equal(1);
            expect(stub.getCalls()[0].args[0]).to.equal(folder.uri.fsPath + '/.env');
        });

        it('replaces same env value multiple times in a config', async () => {
            fsExtra.outputFileSync(`${rootDir}/.env`, `PASSWORD=password`);
            let config = await processEnvFile(folder, {
                envFile: '${workspaceFolder}/.env',
                rootDir: '${env:PASSWORD}',
                stagingDir: '${env:PASSWORD}'
            });

            expect(config.rootDir).to.equal('password');
            expect(config.stagingDir).to.equal('password');
        });

        it('does not replace text outside of the ${} syntax', async () => {
            fsExtra.outputFileSync(`${rootDir}/.env`, `PASSWORD=password`);
            const config = await processEnvFile(folder, {
                'envFile': '${workspaceFolder}/.env',
                //this key looks exactly like the text within the ${}, make sure it persists. (dunno why someone would do this...)
                'env:PASSWORD': '${env:PASSWORD}'
            });

            expect(config['env:PASSWORD']).to.equal('password');
        });

        it('ignores ${env:} items that are not found in the env file', async () => {
            fsExtra.outputFileSync(`${rootDir}/.env`, `PASSWORD=password`);
            const config = await processEnvFile(folder, {
                envFile: '${workspaceFolder}/.env',
                rootDir: '${env:NOT_PASSWORD}'
            });

            expect(config.rootDir).to.equal('${env:NOT_PASSWORD}');
        });

        it('loads env file when not using ${workspaceFolder} var', async () => {
            fsExtra.outputFileSync(`${tempDir}/.env`, `TEST_ENV_VAR=./somePath`);
            const config = await processEnvFile(folder, {
                envFile: `${tempDir}/.env`,
                rootDir: '${env:TEST_ENV_VAR}/123'
            });
            expect(config.rootDir).to.eql('./somePath/123');
        });
    });

    describe('collectPasswordCandidates', () => {
        const callCollect = (
            config: Partial<BrightScriptLaunchConfiguration>,
            result: Partial<BrightScriptLaunchConfiguration>,
            serialNumber: string | undefined
        ): Promise<string[]> => (configProvider as any).collectPasswordCandidates(config, result, serialNumber);

        it('returns an empty list when every source is empty or a variable placeholder', async () => {
            const candidates = await callCollect(
                { password: '${promptForPassword}' },
                { password: '${activeHostPassword}' },
                undefined
            );
            expect(candidates).to.deep.equal([]);
        });

        it('filters out falsy entries', async () => {
            const candidates = await callCollect(
                { password: '' },
                { password: undefined as any },
                undefined
            );
            expect(candidates).to.deep.equal([]);
        });

        it('includes the default, result, and config password in that order', async () => {
            sinon.stub(deviceManager, 'getDefaultPassword').returns('default-pw');
            const candidates = await callCollect(
                { password: 'config-pw' },
                { password: 'result-pw' },
                undefined
            );
            expect(candidates).to.deep.equal(['default-pw', 'result-pw', 'config-pw']);
        });

        it('dedupes candidates that appear in multiple sources, preserving first occurrence', async () => {
            sinon.stub(deviceManager, 'getDefaultPassword').returns('shared-pw');
            const candidates = await callCollect(
                { password: 'shared-pw' },
                { password: 'shared-pw' },
                undefined
            );
            expect(candidates).to.deep.equal(['shared-pw']);
        });

        it('trims whitespace from candidates before deduping', async () => {
            sinon.stub(deviceManager, 'getDefaultPassword').returns('  padded  ');
            const candidates = await callCollect(
                { password: 'padded' },
                { password: 'padded' },
                undefined
            );
            expect(candidates).to.deep.equal(['padded']);
        });

        it('puts the cred-store password first when a serial number is known', async () => {
            sinon.stub(deviceManager, 'getDefaultPassword').returns('default-pw');
            await credentialStore.setPassword('SN-001', 'cred-store-pw');
            const candidates = await callCollect(
                { password: 'config-pw' },
                { password: 'result-pw' },
                'SN-001'
            );
            expect(candidates).to.deep.equal(['cred-store-pw', 'default-pw', 'result-pw', 'config-pw']);
        });

        it('skips cred-store and settings-by-SN sources when the serial number is undefined', async () => {
            await credentialStore.setPassword('SN-001', 'cred-store-pw');
            const candidates = await callCollect(
                { password: 'config-pw' },
                { password: 'result-pw' },
                undefined
            );
            expect(candidates).to.not.include('cred-store-pw');
        });

        it('excludes variable placeholders even when wrapped in whitespace', async () => {
            const candidates = await callCollect(
                { password: '  ${promptForPassword}  ' },
                { password: '  ${activeHostPassword}  ' },
                undefined
            );
            expect(candidates).to.deep.equal([]);
        });
    });

    describe('processPasswordParameter', () => {
        const callProcess = (
            config: Partial<BrightScriptLaunchConfiguration>,
            result: Partial<BrightScriptLaunchConfiguration>,
            device: any
        ) => (configProvider as any).processPasswordParameter(config, result, device);

        beforeEach(() => {
            sinon.stub(deviceManager, 'getDefaultPassword').returns(undefined);
        });

        it('accepts the first candidate that validates ok and caches it to the cred store', async () => {
            sinon.stub(deviceManager, 'validateDevicePassword').resolves('ok');

            const result: any = { host: '1.2.3.4', password: 'winning-pw' };
            const returned = await callProcess({ password: '${promptForPassword}' }, result, { serialNumber: 'SN-001' });

            expect(returned.password).to.equal('winning-pw');
            expect(await credentialStore.getPassword('SN-001')).to.equal('winning-pw');
        });

        it('moves past bad-password candidates and uses the first accepted one', async () => {
            const stub = sinon.stub(deviceManager, 'validateDevicePassword') as any;
            stub.onCall(0).resolves('bad-password');
            stub.onCall(1).resolves('ok');

            // result.password (priority 4) is tried before config.password (priority 5),
            // so the first stubbed call validates 'higher-priority-pw' and rejects it.
            const result: any = { host: '1.2.3.4', password: 'higher-priority-pw' };
            const returned = await callProcess({ password: 'accepted-pw' }, result, { serialNumber: 'SN-001' });

            expect(returned.password).to.equal('accepted-pw');
            expect(stub.callCount).to.equal(2);
            expect(await credentialStore.getPassword('SN-001')).to.equal('accepted-pw');
        });

        it('throws and stops the flow on unreachable during candidate validation', async () => {
            sinon.stub(deviceManager, 'validateDevicePassword').resolves('unreachable');

            let threw: Error | undefined;
            try {
                await callProcess({ password: '${promptForPassword}' }, { host: '1.2.3.4', password: 'some-pw' }, undefined);
            } catch (error) {
                threw = error as Error;
            }
            expect(threw?.message).to.contain('unreachable');
        });

        it('prompts the user when every candidate is rejected, then accepts a typed password', async () => {
            const stub = sinon.stub(deviceManager, 'validateDevicePassword') as any;
            stub.onFirstCall().resolves('bad-password');
            stub.onSecondCall().resolves('ok');
            (sinon.stub(configProvider as any, 'openInputBox') as any).resolves('typed-pw');

            const result: any = { host: '1.2.3.4', password: 'rejected-pw' };
            const returned = await callProcess({ password: '${promptForPassword}' }, result, { serialNumber: 'SN-001' });

            expect(returned.password).to.equal('typed-pw');
            expect(await credentialStore.getPassword('SN-001')).to.equal('typed-pw');
        });

        it('throws when the user cancels (empty) the password prompt', async () => {
            sinon.stub(deviceManager, 'validateDevicePassword').resolves('bad-password');
            (sinon.stub(configProvider as any, 'openInputBox') as any).resolves('');

            let threw: Error | undefined;
            try {
                await callProcess({ password: '${promptForPassword}' }, { host: '1.2.3.4', password: 'rejected-pw' }, undefined);
            } catch (error) {
                threw = error as Error;
            }
            expect(threw?.message).to.contain('password is required');
        });

        it('throws when the typed password is also rejected', async () => {
            const stub = sinon.stub(deviceManager, 'validateDevicePassword') as any;
            stub.onFirstCall().resolves('bad-password');
            stub.onSecondCall().resolves('bad-password');
            (sinon.stub(configProvider as any, 'openInputBox') as any).resolves('still-wrong');

            let threw: Error | undefined;
            try {
                await callProcess({ password: '${promptForPassword}' }, { host: '1.2.3.4', password: 'rejected-pw' }, undefined);
            } catch (error) {
                threw = error as Error;
            }
            expect(threw?.message).to.contain('rejected');
        });

        it('does not write to the cred store when no serial number is available', async () => {
            sinon.stub(deviceManager, 'validateDevicePassword').resolves('ok');

            const result: any = { host: '1.2.3.4', password: 'winning-pw' };
            await callProcess({ password: '${promptForPassword}' }, result, undefined);

            expect(await credentialStore.getPassword('SN-001')).to.be.undefined;
        });
    });
});
