/* eslint-disable no-template-curly-in-string */
import * as brighterscript from 'brighterscript';
import { assert, expect } from 'chai';
import * as path from 'path';
import { createSandbox } from 'sinon';
import type { WorkspaceFolder } from 'vscode';
import { QuickPickItemKind } from 'vscode';
import Uri from 'vscode-uri';
import type { BrightScriptLaunchConfiguration } from './DebugConfigurationProvider';
import { BrightScriptDebugConfigurationProvider } from './DebugConfigurationProvider';
import { vscode } from './mockVscode.spec';
import { standardizePath as s } from 'brighterscript';
import * as fsExtra from 'fs-extra';
import type { RokuDeviceDetails } from './ActiveDeviceManager';
import { ActiveDeviceManager } from './ActiveDeviceManager';

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

    beforeEach(() => {
        fsExtra.emptyDirSync(tempDir);
        let context = {
            workspaceState: {
                update: () => {
                    return Promise.resolve();
                }
            }
        };

        folder = {
            uri: Uri.file(rootDir),
            name: 'test-folder',
            index: 0
        };

        //prevent the 'start' method from actually running
        sinon.stub(ActiveDeviceManager.prototype as any, 'start').callsFake(() => { });
        let activeDeviceManager = new ActiveDeviceManager();

        configProvider = new BrightScriptDebugConfigurationProvider(
            <any>context,
            activeDeviceManager,
            null,
            vscode.window.createOutputChannel('Extension')
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
                expect(e.message).to.contain('Cannot find .env');
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
            const config = await configProvider.resolveDebugConfiguration(folder, <any>{});
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
                host: '127.0.0.1',
                password: 'password',
                packagePort: 1234,
                remotePort: 5678
            });
            expect(config.packagePort).to.equal(1234);
            expect(config.remotePort).to.equal(5678);
        });

        [
            { input: true, expected: { activateOnSessionStart: true, deactivateOnSessionEnd: true } },
            { input: false, expected: { activateOnSessionStart: false, deactivateOnSessionEnd: false } },
            { input: undefined, expected: { activateOnSessionStart: false, deactivateOnSessionEnd: false } }
        ].forEach(({ input, expected }) => {
            it('allows using a bool value for remoteConfigMode', async () => {
                let config = await configProvider.resolveDebugConfiguration(folder, <any>{
                    remoteControlMode: input
                });
                expect(config.remoteControlMode).to.deep.equal(expected);
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
                stagingFolderPath: '${env:PASSWORD}'
            });

            expect(config.rootDir).to.equal('password');
            expect(config.stagingFolderPath).to.equal('password');
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

    describe('createHostQuickPickList', () => {
        const devices: Array<RokuDeviceDetails> = [{
            deviceInfo: {
                'user-device-name': 'roku1',
                'serial-number': 'alpha',
                'model-number': 'model1'
            },
            id: '1',
            ip: '1.1.1.1',
            location: '???'
        }, {
            deviceInfo: {
                'user-device-name': 'roku2',
                'serial-number': 'beta',
                'model-number': 'model2'
            },
            id: '2',
            ip: '1.1.1.2',
            location: '???'
        }, {
            deviceInfo: {
                'user-device-name': 'roku3',
                'serial-number': 'charlie',
                'model-number': 'model3'
            },
            id: '3',
            ip: '1.1.1.3',
            location: '???'
        }];
        function label(device: RokuDeviceDetails) {
            return `${device.ip} | ${device.deviceInfo['user-device-name']} - ${device.deviceInfo['serial-number']} - ${device.deviceInfo['model-number']}`;
        }

        it('includes "manual', () => {
            expect(
                configProvider['createHostQuickPickList']([], undefined, '')
            ).to.eql([{
                label: 'Enter manually',
                device: {
                    id: Number.MAX_SAFE_INTEGER
                }
            }]);
        });

        it('includes separators for devices and manual options', () => {
            expect(
                configProvider['createHostQuickPickList']([devices[0]], undefined, '')
            ).to.eql([
                {
                    kind: QuickPickItemKind.Separator,
                    label: 'devices'
                },
                {
                    label: '1.1.1.1 | roku1 - alpha - model1',
                    device: devices[0]
                },
                {
                    kind: QuickPickItemKind.Separator,
                    label: ' '
                }, {
                    label: 'Enter manually',
                    device: {
                        id: Number.MAX_SAFE_INTEGER
                    }
                }]
            );
        });

        it('moves active device to the top', () => {
            expect(
                configProvider['createHostQuickPickList']([devices[0], devices[1], devices[2]], devices[1], '').map(x => x.label)
            ).to.eql([
                'last used',
                label(devices[1]),
                'other devices',
                label(devices[0]),
                label(devices[2]),
                ' ',
                'Enter manually'
            ]);
        });

        it('includes the spinner text when "last used" and "other devices" separators are both present', () => {
            expect(
                configProvider['createHostQuickPickList'](devices, devices[1], ' (searching ...)').map(x => x.label)
            ).to.eql([
                'last used',
                label(devices[1]),
                'other devices',
                label(devices[0]),
                label(devices[2]),
                '(searching ...)',
                'Enter manually'
            ]);
        });

        it('includes the spinner text if "devices" separator is present', () => {
            expect(
                configProvider['createHostQuickPickList'](devices, null, ' (searching ...)').map(x => x.label)
            ).to.eql([
                'devices',
                label(devices[0]),
                label(devices[1]),
                label(devices[2]),
                '(searching ...)',
                'Enter manually'
            ]);
        });

        it('includes the spinner text if only "last used" separator is present', () => {
            expect(
                configProvider['createHostQuickPickList']([devices[0]], devices[0], ' (searching ...)').map(x => x.label)
            ).to.eql([
                'last used',
                label(devices[0]),
                '(searching ...)',
                'Enter manually'
            ]);
        });

        it('includes the spinner text when no other device entries are present', () => {
            expect(
                configProvider['createHostQuickPickList']([], null, ' (searching ...)').map(x => x.label)
            ).to.eql([
                '(searching ...)',
                'Enter manually'
            ]);
        });

    });
});
