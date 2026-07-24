import { expect, assert } from 'chai';
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
import { vscodeContextManager } from './managers/VscodeContextManager';

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
        credentialStore = new CredentialStore(vscode.context);
        userInputManager = new UserInputManager(deviceManager, credentialStore);

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
            //probing the host resolves a reachable developer device
            sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({ 'developer-enabled': 'true', 'serial-number': 'SN-TEST' } as any);
            // short-circuit the password candidate validation loop so tests can focus on config resolution logic
            sinon.stub(DeviceManager.prototype, 'validateDevicePassword').resolves('ok');
        });

        afterEach(() => {
            (configProvider as any).configDefaults = existingConfigDefaults;
        });

        it('fetches device-info for a cloud emulator device and skips host and password resolution', async () => {
            sinon.stub(configProvider, 'getBsConfig').returns({});
            const device = { instanceUrl: 'https://device.rce.roku.com/instance/abc', rceToken: 'secret' };

            const config = await configProvider.resolveDebugConfiguration(folder, <any>{
                type: 'brightscript',
                device: device,
                password: 'aaaa'
            });

            //the device option is passed through untouched for roku-debug to consume
            expect(config.device).to.eql(device);
            expect(config.password).to.equal('aaaa');
            //device-info was fetched through roku-deploy's RCE path (no LAN probe/password validation)
            expect((rokuDeploy.getDeviceInfo as any).calledWith({ device: device, timeout: DeviceManager.RCE_DEVICE_INFO_TIMEOUT_MS })).to.be.true;
            expect(config.deviceInfo).to.eql({ 'developer-enabled': 'true', 'serial-number': 'SN-TEST' });
        });

        it('uses the host from a local device config for host resolution', async () => {
            sinon.stub(configProvider, 'getBsConfig').returns({});

            const config = await configProvider.resolveDebugConfiguration(folder, <any>{
                type: 'brightscript',
                device: { host: '10.0.0.5' },
                password: 'aaaa'
            });

            //the local device config's host takes the place of the top-level host field, and normal probing happens
            expect(config.host).to.equal('10.0.0.5');
            expect((rokuDeploy.getDeviceInfo as any).called).to.be.true;
            expect(config.deviceInfo).to.exist;
        });

        it('builds the device option from the deprecated host field', async () => {
            sinon.stub(configProvider, 'getBsConfig').returns({});

            const config = await configProvider.resolveDebugConfiguration(folder, <any>{
                type: 'brightscript',
                host: '10.0.0.9',
                password: 'aaaa'
            });

            expect(config.device).to.eql({ host: '10.0.0.9' });
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

        it('does not throw on missing .env file and falls back to the process env', async () => {
            sinon.stub(configProvider.util, 'fileExists').returns(Promise.resolve(false));
            sinon.stub(configProvider, 'getBsConfig').returns({});
            sinon.stub(process, 'env').value({ ...process.env, ROKU_PASSWORD: 'pass1234' });

            const config = await configProvider.resolveDebugConfiguration(folder, <any>{
                host: '127.0.0.1',
                type: 'brightscript',
                envFile: '${workspaceFolder}/.env',
                password: '${env:ROKU_PASSWORD}'
            });
            expect(config.password).to.equal('pass1234');
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

        describe('device info', () => {
            it('attaches the raw device info from the probed device to the resolved config without a separate network request', async () => {
                sinon.stub(configProvider, 'getBsConfig').returns({});
                const deviceInfo = {
                    'serial-number': 'abc123',
                    'developer-enabled': 'true',
                    'software-version': '11.5.0'
                };
                sinon.stub(deviceManager, 'validateAndAddDevice').resolves({ ip: '1.2.3.4', deviceInfo: deviceInfo } as any);

                const config = await configProvider.resolveDebugConfiguration(folder, <any>{
                    host: '1.2.3.4',
                    type: 'brightscript',
                    password: 'aaaa'
                });

                //the raw device info should be passed straight through to the launch config
                expect(config.deviceInfo).to.eql(deviceInfo);
                //device info is reused from the probe, so no extra getDeviceInfo network request should happen
                expect((rokuDeploy.getDeviceInfo as any).called).to.be.false;
            });

            it('throws when the probed device reports developer mode disabled', async () => {
                sinon.stub(configProvider, 'getBsConfig').returns({});
                sinon.stub(deviceManager, 'validateAndAddDevice').resolves({
                    ip: '1.2.3.4',
                    deviceInfo: { 'developer-enabled': 'false' }
                } as any);

                try {
                    await configProvider.resolveDebugConfiguration(folder, <any>{
                        host: '1.2.3.4',
                        type: 'brightscript',
                        password: 'aaaa'
                    });
                    assert.fail('Should have thrown exception');
                } catch (e) {
                    expect((e as Error)?.message).to.contain('developer mode is disabled');
                }
            });

            it('throws when the probed device returns no device info', async () => {
                sinon.stub(configProvider, 'getBsConfig').returns({});
                sinon.stub(deviceManager, 'validateAndAddDevice').resolves({ ip: '1.2.3.4', deviceInfo: {} } as any);

                try {
                    await configProvider.resolveDebugConfiguration(folder, <any>{
                        host: '1.2.3.4',
                        type: 'brightscript',
                        password: 'aaaa'
                    });
                    assert.fail('Should have thrown exception');
                } catch (e) {
                    expect((e as Error)?.message).to.contain('unable to reach device');
                }
            });
        });

        describe('processHostParameter', () => {
            it('reuses the device from the picker instead of probing again', async () => {
                const deviceInfo = { 'serial-number': 'abc123', 'developer-enabled': 'true' };
                const device = { ip: '1.2.3.4', serialNumber: 'abc123', deviceInfo: deviceInfo } as any;
                //the picker resolved the host, so the device is already registered
                (configProvider as any).brightScriptCommands = { getHealthyActiveHost: sinon.stub().resolves(undefined) };
                sinon.stub(userInputManager, 'promptForHost').resolves({ host: '1.2.3.4', deviceInfo: deviceInfo, device: { host: '1.2.3.4' } });
                const getDeviceStub = sinon.stub(deviceManager, 'getDevice').returns(device);
                const validateStub = sinon.stub(deviceManager, 'validateAndAddDevice').resolves(undefined);

                const result = await (configProvider as any).processHostParameter({ host: '' });

                expect(getDeviceStub.calledWith({ ip: '1.2.3.4' })).to.be.true;
                expect(validateStub.called).to.be.false;
                expect(result.deviceInfo).to.eql(deviceInfo);
            });

            it('reuses the device from the healthy active host instead of probing again', async () => {
                const deviceInfo = { 'serial-number': 'abc123', 'developer-enabled': 'true' };
                const device = { ip: '1.2.3.4', serialNumber: 'abc123', deviceInfo: deviceInfo } as any;
                //the active-host lookup resolved the host, so the device is already registered
                (configProvider as any).brightScriptCommands = { getHealthyActiveHost: sinon.stub().resolves({ host: '1.2.3.4', deviceInfo: deviceInfo }) };
                const promptStub = sinon.stub(userInputManager, 'promptForHost');
                const getDeviceStub = sinon.stub(deviceManager, 'getDevice').returns(device);
                const validateStub = sinon.stub(deviceManager, 'validateAndAddDevice').resolves(undefined);

                const result = await (configProvider as any).processHostParameter({ host: '' });

                expect(promptStub.called).to.be.false;
                expect(getDeviceStub.calledWith({ ip: '1.2.3.4' })).to.be.true;
                expect(validateStub.called).to.be.false;
                expect(result.deviceInfo).to.eql(deviceInfo);
            });

            it('probes the host and attaches its device info when not chosen through the picker', async () => {
                const deviceInfo = { 'serial-number': 'abc123' };
                const device = { ip: '1.2.3.4', serialNumber: 'abc123', deviceInfo: deviceInfo, key: 's:abc123' } as any;
                //getDevice is also used (separately from the probe) to derive the active-device key
                const getDeviceStub = sinon.stub(deviceManager, 'getDevice').returns(undefined);
                const validateStub = sinon.stub(deviceManager, 'validateAndAddDevice').resolves(device);

                const result = await (configProvider as any).processHostParameter({ host: '1.2.3.4' });

                expect(validateStub.calledWith('1.2.3.4')).to.be.true;
                expect(getDeviceStub.calledWith({ ip: '1.2.3.4' })).to.be.true;
                expect(result.deviceInfo).to.eql(deviceInfo);
            });

            it('throws when the probe yields no device info', async () => {
                sinon.stub(deviceManager, 'validateAndAddDevice').resolves({ ip: '1.2.3.4', deviceInfo: {} } as any);

                let threw: Error | undefined;
                try {
                    await (configProvider as any).processHostParameter({ host: '1.2.3.4' });
                } catch (e) {
                    threw = e as Error;
                }
                expect(threw?.message).to.contain('unable to reach device');
            });

            it('threads a cloud emulator pick from the picker and skips the host requirement', async () => {
                const device = { instanceUrl: 'https://device.rce.roku.com/instance/abc', rceToken: 'secret' };
                (configProvider as any).brightScriptCommands = { getHealthyActiveHost: sinon.stub().resolves(undefined) };
                sinon.stub(userInputManager, 'promptForHost').resolves({
                    host: undefined,
                    deviceInfo: undefined,
                    device: device,
                    rce: { status: 'running' }
                } as any);
                //the beforeEach above already stubbed rokuDeploy.getDeviceInfo; reconfigure the same
                //stub rather than wrapping it a second time
                (rokuDeploy.getDeviceInfo as any).resolves({ 'developer-enabled': 'true' });

                const result = await (configProvider as any).processHostParameter({ host: '' });

                expect(result.device).to.eql(device);
                expect((rokuDeploy.getDeviceInfo as any).calledWith({ device: device, timeout: DeviceManager.RCE_DEVICE_INFO_TIMEOUT_MS })).to.be.true;
                expect(result.deviceInfo).to.eql({ 'developer-enabled': 'true' });
            });

            it('throws a friendly error when a picked cloud emulator device is not running', async () => {
                const device = { id: '84', rceToken: 'secret' };
                (configProvider as any).brightScriptCommands = { getHealthyActiveHost: sinon.stub().resolves(undefined) };
                sinon.stub(userInputManager, 'promptForHost').resolves({
                    host: undefined,
                    deviceInfo: undefined,
                    device: device,
                    rce: { status: 'shutdown' }
                } as any);

                let threw: Error | undefined;
                try {
                    await (configProvider as any).processHostParameter({ host: '' });
                } catch (e) {
                    threw = e as Error;
                }

                expect(threw?.message).to.contain('Cloud Emulator panel');
                //the friendly guard fires before any device-info fetch is attempted
                expect((rokuDeploy.getDeviceInfo as any).called).to.be.false;
            });

            it('throws when a config-provided cloud emulator device is unreachable', async () => {
                const device = { instanceUrl: 'https://device.rce.roku.com/instance/abc', rceToken: 'secret' };
                //the beforeEach above already stubbed rokuDeploy.getDeviceInfo; reconfigure the same
                //stub rather than wrapping it a second time
                (rokuDeploy.getDeviceInfo as any).rejects(new Error('socket hang up'));

                let threw: Error | undefined;
                try {
                    await (configProvider as any).processHostParameter({ host: '', device: device });
                } catch (e) {
                    threw = e as Error;
                }

                expect(threw?.message).to.contain('unable to reach device');
                expect(threw?.message).to.contain(device.instanceUrl);
            });

            it('throws a dev-mode error naming the Cloud Emulator panel when a config-provided cloud device has dev mode disabled', async () => {
                const device = { instanceUrl: 'https://device.rce.roku.com/instance/abc', rceToken: 'secret' };
                (rokuDeploy.getDeviceInfo as any).resolves({ 'developer-enabled': 'false' });

                let threw: Error | undefined;
                try {
                    await (configProvider as any).processHostParameter({ host: '', device: device });
                } catch (e) {
                    threw = e as Error;
                }

                expect(threw?.message).to.contain('developer mode is disabled');
                expect(threw?.message).to.contain('Cloud Emulator panel');
            });

            it('sets activeDeviceKey (and remoteHost as before) for a resolved LAN host', async () => {
                const device = { ip: '1.2.3.4', serialNumber: 'abc123', deviceInfo: { 'serial-number': 'abc123' }, key: 's:abc123' } as any;
                sinon.stub(deviceManager, 'getDevice').returns(device);
                sinon.stub(deviceManager, 'validateAndAddDevice').resolves(device);

                await (configProvider as any).processHostParameter({ host: '1.2.3.4' });

                expect(vscode.context.workspaceState.get('remoteHost')).to.equal('1.2.3.4');
                expect(vscode.context.workspaceState.get('activeDeviceKey')).to.equal('s:abc123');
            });

            it('sets activeDeviceKey and clears remoteHost/activeHost for a config-provided cloud emulator device', async () => {
                const device = { instanceUrl: 'https://device.rce.roku.com/instance/abc', rceToken: 'secret' };
                //seed stale LAN active-device state from a previous session
                await vscode.context.workspaceState.update('remoteHost', '10.0.0.5');
                const contextSetStub = sinon.stub(vscodeContextManager, 'set').resolves();
                sinon.stub(deviceManager, 'getDeviceByDeviceConfig').returns({ key: 'rce:83', rce: { id: '83', status: 'running' } } as any);

                await (configProvider as any).processHostParameter({ host: '', device: device });

                expect(vscode.context.workspaceState.get('remoteHost')).to.equal('');
                expect(vscode.context.workspaceState.get('activeDeviceKey')).to.equal('rce:83');
                expect(contextSetStub.calledWith('activeHost', '')).to.be.true;
            });

            it('clears remoteHost/activeHost for a cloud emulator pick from the picker, even when it is not running', async () => {
                const device = { id: '84', rceToken: 'secret' };
                await vscode.context.workspaceState.update('remoteHost', '10.0.0.5');
                const contextSetStub = sinon.stub(vscodeContextManager, 'set').resolves();
                (configProvider as any).brightScriptCommands = { getHealthyActiveHost: sinon.stub().resolves(undefined) };
                sinon.stub(userInputManager, 'promptForHost').resolves({
                    host: undefined,
                    deviceInfo: undefined,
                    device: device,
                    rce: { status: 'shutdown' }
                } as any);
                sinon.stub(deviceManager, 'getDeviceByDeviceConfig').returns({ key: 'rce:84', rce: { id: '84', status: 'shutdown' } } as any);

                try {
                    await (configProvider as any).processHostParameter({ host: '' });
                } catch {
                    // the friendly not-running error is expected; this test only cares about the identity writes
                }

                expect(vscode.context.workspaceState.get('remoteHost')).to.equal('');
                expect(vscode.context.workspaceState.get('activeDeviceKey')).to.equal('rce:84');
                expect(contextSetStub.calledWith('activeHost', '')).to.be.true;
            });
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

    describe('processEnvVariables', () => {
        function processEnvVariables(folder: WorkspaceFolder, config: Partial<BrightScriptLaunchConfiguration> & Record<string, any>) {
            return configProvider['processEnvVariables'](folder, config as any);
        }
        it('leaves placeholder untouched when not found in .envFile or process env', async () => {
            let config = await processEnvVariables(folder, {
                rootDir: '${env:ROOT_DIR}'
            });
            expect(config.rootDir).to.equal('${env:ROOT_DIR}');
        });

        it('reads from process.env when no .envFile is specified', async () => {
            sinon.stub(process, 'env').value({ ...process.env, SOME_PROCESS_VAR: 'processValue' });
            let config = await processEnvVariables(folder, {
                rootDir: '${env:SOME_PROCESS_VAR}'
            });
            expect(config.rootDir).to.equal('processValue');
        });

        it('does not mutate process.env', async () => {
            fsExtra.outputFileSync(`${rootDir}/.env`, `SOME_ENV_FILE_VAR=envFileValue`);
            const envBefore = { ...process.env };
            await processEnvVariables(folder, {
                envFile: '${workspaceFolder}/.env',
                rootDir: '${env:SOME_ENV_FILE_VAR}'
            });
            expect(process.env).to.eql(envBefore);
            expect(process.env).to.not.have.property('SOME_ENV_FILE_VAR');
        });

        it('.envFile values override process.env values', async () => {
            sinon.stub(process, 'env').value({ ...process.env, SHARED_VAR: 'processValue' });
            fsExtra.outputFileSync(`${rootDir}/.env`, `SHARED_VAR=envFileValue`);
            const config = await processEnvVariables(folder, {
                envFile: '${workspaceFolder}/.env',
                rootDir: '${env:SHARED_VAR}'
            });
            expect(config.rootDir).to.equal('envFileValue');
        });

        it('does not throw when .env file does not exist', async () => {
            let threw = false;
            try {
                await processEnvVariables(folder, {
                    envFile: '${workspaceFolder}/.env'
                });
            } catch (e) {
                threw = true;
            }
            expect(threw).to.be.false;
        });

        it('falls back to process.env when the specified .env file does not exist', async () => {
            sinon.stub(process, 'env').value({ ...process.env, FALLBACK_VAR: 'fallbackValue' });
            const config = await processEnvVariables(folder, {
                envFile: '${workspaceFolder}/.env',
                rootDir: '${env:FALLBACK_VAR}'
            });
            expect(config.rootDir).to.equal('fallbackValue');
        });

        it('replaces ${workspaceFolder} in .envFile path', async () => {
            let stub = sinon.stub(configProvider.util, 'fileExists').returns(Promise.resolve(false));
            try {
                await processEnvVariables(folder, {
                    envFile: '${workspaceFolder}/.env'
                });
            } catch (e) { }
            expect(stub.callCount).to.equal(1);
            expect(stub.getCalls()[0].args[0]).to.equal(folder.uri.fsPath + '/.env');
        });

        it('replaces same env value multiple times in a config', async () => {
            fsExtra.outputFileSync(`${rootDir}/.env`, `PASSWORD=password`);
            let config = await processEnvVariables(folder, {
                envFile: '${workspaceFolder}/.env',
                rootDir: '${env:PASSWORD}',
                stagingDir: '${env:PASSWORD}'
            });

            expect(config.rootDir).to.equal('password');
            expect(config.stagingDir).to.equal('password');
        });

        it('does not replace text outside of the ${} syntax', async () => {
            fsExtra.outputFileSync(`${rootDir}/.env`, `PASSWORD=password`);
            const config = await processEnvVariables(folder, {
                'envFile': '${workspaceFolder}/.env',
                //this key looks exactly like the text within the ${}, make sure it persists. (dunno why someone would do this...)
                'env:PASSWORD': '${env:PASSWORD}'
            });

            expect(config['env:PASSWORD']).to.equal('password');
        });

        it('ignores ${env:} items that are not found in the env file', async () => {
            fsExtra.outputFileSync(`${rootDir}/.env`, `PASSWORD=password`);
            const config = await processEnvVariables(folder, {
                envFile: '${workspaceFolder}/.env',
                rootDir: '${env:NOT_PASSWORD}'
            });

            expect(config.rootDir).to.equal('${env:NOT_PASSWORD}');
        });

        it('loads env file when not using ${workspaceFolder} var', async () => {
            fsExtra.outputFileSync(`${tempDir}/.env`, `TEST_ENV_VAR=./somePath`);
            const config = await processEnvVariables(folder, {
                envFile: `${tempDir}/.env`,
                rootDir: '${env:TEST_ENV_VAR}/123'
            });
            expect(config.rootDir).to.eql('./somePath/123');
        });
    });

    describe('processPasswordParameter', () => {
        const callProcess = (
            config: Partial<BrightScriptLaunchConfiguration>,
            result: Partial<BrightScriptLaunchConfiguration>,
            device: any
        ) => {
            //processPasswordParameter now reads the serial number from result.deviceInfo instead of a device arg
            if (device?.serialNumber) {
                (result as any).deviceInfo = { 'serial-number': device.serialNumber };
            }
            return (configProvider as any).processPasswordParameter(config, result);
        };

        /**
         * Register the given serial number in `brightscript.devices[]` user settings
         * so `acceptPassword`'s cred-store write is gated open. Tests that assert a
         * password lands in the cred store need to call this first; otherwise the
         * gate skips the cred-store write by design.
         */
        const adoptSerial = (serialNumber: string) => {
            const existing: any[] = (vscode.workspace as any)._configuration?.['brightscript.devices'] ?? [];
            if (!existing.some(entry => entry.serialNumber === serialNumber)) {
                (vscode.workspace as any)._configuration = (vscode.workspace as any)._configuration ?? {};
                (vscode.workspace as any)._configuration['brightscript.devices'] = [
                    ...existing,
                    { serialNumber: serialNumber, host: '0.0.0.0' }
                ];
            }
        };

        beforeEach(() => {
            sinon.stub(deviceManager, 'getDefaultPassword').returns(undefined);
        });

        afterEach(() => {
            delete (vscode.workspace as any)._configuration?.['brightscript.devices'];
        });

        it('accepts the first candidate that validates ok and refreshes the existing cred-store entry', async () => {
            await credentialStore.setPassword('SN-001', 'winning-pw');
            sinon.stub(deviceManager, 'validateDevicePassword').resolves('ok');

            const result: any = { host: '1.2.3.4', password: 'unused' };
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
            (sinon.stub(userInputManager as any, 'promptForDevicePassword') as any).resolves('typed-pw');

            const result: any = { host: '1.2.3.4', password: 'rejected-pw' };
            const returned = await callProcess({ password: '${promptForPassword}' }, result, { serialNumber: 'SN-001' });

            expect(returned.password).to.equal('typed-pw');
        });

        it('throws when the user cancels (empty) the password prompt', async () => {
            sinon.stub(deviceManager, 'validateDevicePassword').resolves('bad-password');
            (sinon.stub(userInputManager as any, 'promptForDevicePassword') as any).resolves(undefined);

            let threw: Error | undefined;
            try {
                await callProcess({ password: '${promptForPassword}' }, { host: '1.2.3.4', password: 'rejected-pw' }, undefined);
            } catch (error) {
                threw = error as Error;
            }
            expect(threw?.message).to.contain('password is required');
        });

        it('re-prompts after a rejected typed password and terminates when the user cancels', async () => {
            const validateStub = sinon.stub(deviceManager, 'validateDevicePassword') as any;
            validateStub.onCall(0).resolves('bad-password'); // first candidate
            validateStub.onCall(1).resolves('bad-password'); // first typed attempt
            const promptStub = sinon.stub(userInputManager as any, 'promptForDevicePassword') as any;
            promptStub.onCall(0).resolves('still-wrong');
            promptStub.onCall(1).resolves(undefined); // user cancels the retry

            let threw: Error | undefined;
            try {
                await callProcess({ password: '${promptForPassword}' }, { host: '1.2.3.4', password: 'rejected-pw' }, undefined);
            } catch (error) {
                threw = error as Error;
            }
            expect(threw?.message).to.contain('password is required');
            expect(promptStub.callCount).to.equal(2);
            expect(validateStub.callCount).to.equal(2);
        });

        it('accepts a retried password that validates ok after an earlier rejection', async () => {
            const validateStub = sinon.stub(deviceManager, 'validateDevicePassword') as any;
            validateStub.onCall(0).resolves('bad-password'); // first candidate
            validateStub.onCall(1).resolves('bad-password'); // first typed attempt
            validateStub.onCall(2).resolves('ok'); // second typed attempt
            const promptStub = sinon.stub(userInputManager as any, 'promptForDevicePassword') as any;
            promptStub.onCall(0).resolves('first-try');
            promptStub.onCall(1).resolves('correct-pw');

            const result: any = { host: '1.2.3.4', password: 'rejected-pw' };
            const returned = await callProcess({ password: '${promptForPassword}' }, result, { serialNumber: 'SN-001' });

            expect(returned.password).to.equal('correct-pw');
            expect(promptStub.callCount).to.equal(2);
        });

        it('does not write to the cred store when no serial number is available', async () => {
            sinon.stub(deviceManager, 'validateDevicePassword').resolves('ok');

            const result: any = { host: '1.2.3.4', password: 'winning-pw' };
            await callProcess({ password: '${promptForPassword}' }, result, undefined);

            expect(await credentialStore.getPassword('SN-001')).to.be.undefined;
        });

        describe('legacy workspaceState.devicePasswords migration', () => {
            const seedLegacy = (entries: Record<string, string>) => {
                (vscode.context.workspaceState as any)._data.devicePasswords = entries;
            };

            const getLegacy = () => (vscode.context.workspaceState as any)._data.devicePasswords as Record<string, string> | undefined;

            it('migrates a legacy entry on ok: uses it, writes to the cred store, and drains the legacy entry', async () => {
                seedLegacy({ '1.2.3.4': 'legacy-pw', '9.9.9.9': 'other-device' });
                sinon.stub(deviceManager, 'validateDevicePassword').resolves('ok');

                const result: any = { host: '1.2.3.4', password: 'ignored' };
                const returned = await callProcess({ password: '${promptForPassword}' }, result, { serialNumber: 'SN-001' });

                expect(returned.password).to.equal('legacy-pw');
                expect(await credentialStore.getPassword('SN-001')).to.equal('legacy-pw');
                expect(getLegacy()).to.deep.equal({ '9.9.9.9': 'other-device' });
            });

            it('drops a legacy entry on bad-password and falls through to the candidate loop', async () => {
                seedLegacy({ '1.2.3.4': 'legacy-wrong' });
                const validateStub = sinon.stub(deviceManager, 'validateDevicePassword') as any;
                validateStub.onCall(0).resolves('bad-password'); // legacy
                validateStub.onCall(1).resolves('ok'); // candidate flow picks up the first dedup'd candidate

                const result: any = { host: '1.2.3.4', password: 'winning-pw' };
                const returned = await callProcess({ password: '${promptForPassword}' }, result, { serialNumber: 'SN-001' });

                expect(returned.password).to.equal('winning-pw');
                expect(getLegacy()).to.deep.equal({});
                expect(validateStub.callCount).to.equal(2);
            });

            it('preserves the legacy entry on unreachable and lets the main flow continue', async () => {
                seedLegacy({ '1.2.3.4': 'legacy-pw' });
                const validateStub = sinon.stub(deviceManager, 'validateDevicePassword') as any;
                validateStub.onCall(0).resolves('unreachable'); // legacy attempt — treated as transient
                validateStub.onCall(1).resolves('ok'); // main flow picks up the first candidate

                const result: any = { host: '1.2.3.4', password: 'winning-pw' };
                const returned = await callProcess({ password: '${promptForPassword}' }, result, { serialNumber: 'SN-001' });

                expect(returned.password).to.equal('winning-pw');
                // legacy entry stays intact for next launch to try again
                expect(getLegacy()).to.deep.equal({ '1.2.3.4': 'legacy-pw' });
                expect(validateStub.callCount).to.equal(2);
            });

            it('leaves other legacy entries alone when none match the current host', async () => {
                seedLegacy({ '9.9.9.9': 'stranger' });
                const validateStub = sinon.stub(deviceManager, 'validateDevicePassword').resolves('ok');

                const result: any = { host: '1.2.3.4', password: 'winning-pw' };
                await callProcess({ password: '${promptForPassword}' }, result, { serialNumber: 'SN-001' });

                // legacy was never peeked/validated — only the normal candidate flow ran
                expect(validateStub.callCount).to.equal(1);
                expect(getLegacy()).to.deep.equal({ '9.9.9.9': 'stranger' });
            });
        });

        describe('cred-store write gate', () => {
            it('skips the cred-store write when the serial number is not in settings or the cred store', async () => {
                sinon.stub(deviceManager, 'validateDevicePassword').resolves('ok');

                const result: any = { host: '1.2.3.4', password: 'winning-pw' };
                await callProcess({ password: '${promptForPassword}' }, result, { serialNumber: 'SN-DISCOVERED' });

                expect(await credentialStore.getPassword('SN-DISCOVERED')).to.be.undefined;
            });

            it('writes to the cred store when the SN is already present there (refreshing an existing entry)', async () => {
                await credentialStore.setPassword('SN-001', 'old-pw');
                // First candidate is the existing cred-store entry (priority #1). Reject it so
                // the newer result.password wins, proving acceptPassword actually refreshed the entry.
                const validateStub = sinon.stub(deviceManager, 'validateDevicePassword') as any;
                validateStub.onCall(0).resolves('bad-password');
                validateStub.onCall(1).resolves('ok');

                const result: any = { host: '1.2.3.4', password: 'new-pw' };
                await callProcess({ password: '${promptForPassword}' }, result, { serialNumber: 'SN-001' });

                expect(await credentialStore.getPassword('SN-001')).to.equal('new-pw');
            });

            it('does NOT write to the cred store when the SN is only listed in brightscript.devices[] without a stored password', async () => {
                adoptSerial('SN-001');
                sinon.stub(deviceManager, 'validateDevicePassword').resolves('ok');

                const result: any = { host: '1.2.3.4', password: 'winning-pw' };
                await callProcess({ password: '${promptForPassword}' }, result, { serialNumber: 'SN-001' });

                // Listing in settings is no longer enough on its own — the cred store
                // only refreshes entries that already exist there.
                expect(await credentialStore.getPassword('SN-001')).to.be.undefined;
            });

            it('always writes to the cred store when the winning password came from legacy migration', async () => {
                // Deliberately no adoptSerial here; legacy presence is the historical opt-in.
                (vscode.context.workspaceState as any)._data.devicePasswords = { '1.2.3.4': 'legacy-pw' };
                sinon.stub(deviceManager, 'validateDevicePassword').resolves('ok');

                const result: any = { host: '1.2.3.4', password: 'ignored' };
                await callProcess({ password: '${promptForPassword}' }, result, { serialNumber: 'SN-DISCOVERED' });

                expect(await credentialStore.getPassword('SN-DISCOVERED')).to.equal('legacy-pw');
            });
        });

        describe('typed-password persistence after prompt', () => {
            it('refreshes the cred store with a typed password when an entry already exists for the SN', async () => {
                await credentialStore.setPassword('SN-001', 'old-pw');
                const validateStub = sinon.stub(deviceManager, 'validateDevicePassword') as any;
                validateStub.onCall(0).resolves('bad-password'); // existing cred-store entry (candidate #1)
                validateStub.onCall(1).resolves('bad-password'); // result.password
                validateStub.onCall(2).resolves('ok'); // typed password
                (sinon.stub(userInputManager as any, 'promptForDevicePassword') as any).resolves('typed-pw');

                const result: any = { host: '1.2.3.4', password: 'rejected-pw' };
                await callProcess({ password: '${promptForPassword}' }, result, { serialNumber: 'SN-001' });

                expect(await credentialStore.getPassword('SN-001')).to.equal('typed-pw');
            });

            it('does NOT persist a typed password when no cred-store entry exists for the SN', async () => {
                const validateStub = sinon.stub(deviceManager, 'validateDevicePassword') as any;
                validateStub.onCall(0).resolves('bad-password');
                validateStub.onCall(1).resolves('ok');
                (sinon.stub(userInputManager as any, 'promptForDevicePassword') as any).resolves('typed-pw');

                const result: any = { host: '1.2.3.4', password: 'rejected-pw' };
                await callProcess({ password: '${promptForPassword}' }, result, { serialNumber: 'SN-NEW' });

                expect(await credentialStore.getPassword('SN-NEW')).to.be.undefined;
            });
        });
    });
});
