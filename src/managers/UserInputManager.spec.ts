import { expect } from 'chai';
import * as path from 'path';
import { createSandbox } from 'sinon';
import { QuickPickItemKind } from 'vscode';
import { UserInputManager, manualHostItemId, scanForDevicesItemId } from './UserInputManager';
import { vscode } from '../mockVscode.spec';
import { standardizePath as s } from 'brighterscript';
import * as fsExtra from 'fs-extra';
import type { RokuDevice } from '../deviceDiscovery/DeviceManager';
import { DeviceManager } from '../deviceDiscovery/DeviceManager';
import { GlobalStateManager } from '../GlobalStateManager';
import { CredentialStore } from './CredentialStore';
import { icons } from '../icons';

const sinon = createSandbox();
const Module = require('module');
const cwd = s`${path.dirname(__dirname)}`;
const tempDir = s`${cwd}/.tmp`;

//override the "require" call to mock certain items
const { require: oldRequire } = Module.prototype;
Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

describe('UserInputManager', () => {

    let userInputManager: UserInputManager;
    let deviceManager: DeviceManager;
    let globalStateManager: GlobalStateManager;
    let credentialStore: CredentialStore;

    beforeEach(() => {
        fsExtra.emptyDirSync(tempDir);

        //prevent the DeviceManager from actually running
        sinon.stub(DeviceManager.prototype as any, 'initialize').callsFake(() => { });
        sinon.stub(DeviceManager.prototype as any, 'setupConfiguration').callsFake(() => { });
        sinon.stub(DeviceManager.prototype as any, 'setupWindowFocusHandling').callsFake(() => { });
        sinon.stub(DeviceManager.prototype as any, 'setupMonitors').callsFake(() => { });
        globalStateManager = new GlobalStateManager(vscode.context);
        deviceManager = new DeviceManager(vscode.context, globalStateManager);
        credentialStore = new CredentialStore(vscode.context);
        userInputManager = new UserInputManager(deviceManager, credentialStore);
    });

    afterEach(() => {
        fsExtra.emptyDirSync(tempDir);
        sinon.restore();
    });

    describe('createHostQuickPickList', () => {
        const devices: Array<RokuDevice> = [{
            ip: '1.1.1.1',
            serialNumber: 'alpha',
            key: 's:alpha',
            deviceState: 'online',
            lastDeviceState: 'unknown',
            isDiscovered: true,
            isConfigured: false,
            deviceInfo: {
                'user-device-name': 'roku1',
                'serial-number': 'alpha',
                'model-number': 'model1',
                'software-version': '11.5.0'
            }
        }, {
            ip: '1.1.1.2',
            serialNumber: 'beta',
            key: 's:beta',
            deviceState: 'online',
            lastDeviceState: 'unknown',
            isDiscovered: true,
            isConfigured: false,
            deviceInfo: {
                'user-device-name': 'roku2',
                'serial-number': 'beta',
                'model-number': 'model2',
                'software-version': '11.5.0'
            }
        }, {
            ip: '1.1.1.3',
            serialNumber: 'charlie',
            key: 's:charlie',
            deviceState: 'online',
            lastDeviceState: 'unknown',
            isDiscovered: true,
            isConfigured: false,
            deviceInfo: {
                'user-device-name': 'roku3',
                'serial-number': 'charlie',
                'model-number': 'model3',
                'software-version': '11.5.0'
            }
        }];

        function label(device: RokuDevice) {
            return `${device.deviceInfo['model-number']} – ${device.deviceInfo['user-device-name']} – OS ${device.deviceInfo['software-version']} – ${device.ip}`;
        }

        it('includes "manual" and "scan" options', () => {
            expect(
                userInputManager['createHostQuickPickList']([], undefined)
            ).to.eql([{
                label: 'Enter manually',
                device: {
                    id: manualHostItemId
                },
                iconPath: new vscode.ThemeIcon('keyboard')
            }, {
                label: 'Scan for devices',
                device: {
                    id: scanForDevicesItemId
                },
                iconPath: new vscode.ThemeIcon('radio-tower')
            }]);
        });

        it('includes separators for devices and manual options', () => {
            expect(
                userInputManager['createHostQuickPickList']([devices[0]], undefined)
            ).to.eql([
                {
                    kind: QuickPickItemKind.Separator,
                    label: 'devices'
                },
                {
                    label: 'model1 – roku1 – OS 11.5.0 – 1.1.1.1',
                    device: devices[0],
                    iconPath: icons.setTopBox
                },
                {
                    kind: QuickPickItemKind.Separator,
                    label: ' '
                }, {
                    label: 'Enter manually',
                    device: {
                        id: manualHostItemId
                    },
                    iconPath: new vscode.ThemeIcon('keyboard')
                }, {
                    label: 'Scan for devices',
                    device: {
                        id: scanForDevicesItemId
                    },
                    iconPath: new vscode.ThemeIcon('radio-tower')
                }]
            );
        });

        it('moves active device to the top', () => {
            expect(
                userInputManager['createHostQuickPickList']([devices[0], devices[1], devices[2]], devices[1].ip).map(x => x.label)
            ).to.eql([
                'last used',
                label(devices[1]),
                'other devices',
                label(devices[0]),
                label(devices[2]),
                ' ',
                'Enter manually',
                'Scan for devices'
            ]);
        });

        it('includes action items when "last used" and "other devices" separators are both present', () => {
            expect(
                userInputManager['createHostQuickPickList'](devices, devices[1].ip).map(x => x.label)
            ).to.eql([
                'last used',
                label(devices[1]),
                'other devices',
                label(devices[0]),
                label(devices[2]),
                ' ',
                'Enter manually',
                'Scan for devices'
            ]);
        });

        it('includes action items when "devices" separator is present', () => {
            expect(
                userInputManager['createHostQuickPickList'](devices, null).map(x => x.label)
            ).to.eql([
                'devices',
                label(devices[0]),
                label(devices[1]),
                label(devices[2]),
                ' ',
                'Enter manually',
                'Scan for devices'
            ]);
        });

        it('includes action items when only "last used" separator is present', () => {
            expect(
                userInputManager['createHostQuickPickList']([devices[0]], devices[0].ip).map(x => x.label)
            ).to.eql([
                'last used',
                label(devices[0]),
                ' ',
                'Enter manually',
                'Scan for devices'
            ]);
        });

        it('includes action items when no devices are present', () => {
            expect(
                userInputManager['createHostQuickPickList']([], null).map(x => x.label)
            ).to.eql([
                'Enter manually',
                'Scan for devices'
            ]);
        });
    });

    describe('promptForHost', () => {
        it('calls scan() instead of refresh() when picker opens', async () => {
            const scanSpy = sinon.spy(deviceManager, 'scan');
            const refreshSpy = sinon.spy(deviceManager, 'refresh');

            // Capture the quickPick instance when created
            let quickPick: any;
            const originalCreateQuickPick = vscode.window.createQuickPick;
            sinon.stub(vscode.window, 'createQuickPick').callsFake(() => {
                quickPick = originalCreateQuickPick();
                return quickPick;
            });

            // Start the prompt (don't await - it waits for user input)
            const promptPromise = userInputManager.promptForHost();

            // Give it a tick to set up
            await new Promise<void>(resolve => {
                setTimeout(resolve, 10);
            });

            // Verify scan was called, not refresh
            expect(scanSpy.called).to.be.true;
            expect(refreshSpy.called).to.be.false;

            // Clean up by hiding the quickpick (triggers rejection)
            quickPick?.hide();
            await promptPromise.catch(() => { });
        });
    });

    describe('collectDevicePasswordCandidates', () => {
        //the new signature takes (serialNumber, extraCandidates); the launch-config equivalent is
        //extraCandidates = [result.password, config.password]
        const callCollect = (
            serialNumber: string | undefined,
            extraCandidates: Array<string | undefined>
        ): Promise<string[]> => (userInputManager as any).collectDevicePasswordCandidates(serialNumber, extraCandidates);

        beforeEach(async () => {
            await credentialStore.clearAll();
        });

        it('returns an empty list when every source is empty or a variable placeholder', async () => {
            // eslint-disable-next-line no-template-curly-in-string
            const candidates = await callCollect(undefined, ['${activeHostPassword}', '${promptForPassword}']);
            expect(candidates).to.deep.equal([]);
        });

        it('filters out falsy entries', async () => {
            const candidates = await callCollect(undefined, [undefined, '']);
            expect(candidates).to.deep.equal([]);
        });

        it('includes the default password followed by the extra candidates in order', async () => {
            sinon.stub(deviceManager, 'getDefaultPassword').returns('default-pw');
            const candidates = await callCollect(undefined, ['result-pw', 'config-pw']);
            expect(candidates).to.deep.equal(['default-pw', 'result-pw', 'config-pw']);
        });

        it('dedupes candidates that appear in multiple sources, preserving first occurrence', async () => {
            sinon.stub(deviceManager, 'getDefaultPassword').returns('shared-pw');
            const candidates = await callCollect(undefined, ['shared-pw', 'shared-pw']);
            expect(candidates).to.deep.equal(['shared-pw']);
        });

        it('trims whitespace from candidates before deduping', async () => {
            sinon.stub(deviceManager, 'getDefaultPassword').returns('  padded  ');
            const candidates = await callCollect(undefined, ['padded', 'padded']);
            expect(candidates).to.deep.equal(['padded']);
        });

        it('puts the cred-store password first when a serial number is known', async () => {
            sinon.stub(deviceManager, 'getDefaultPassword').returns('default-pw');
            await credentialStore.setPassword('SN-001', 'cred-store-pw');
            const candidates = await callCollect('SN-001', ['result-pw', 'config-pw']);
            expect(candidates).to.deep.equal(['cred-store-pw', 'default-pw', 'result-pw', 'config-pw']);
        });

        it('skips cred-store and settings-by-SN sources when the serial number is undefined', async () => {
            await credentialStore.setPassword('SN-001', 'cred-store-pw');
            const candidates = await callCollect(undefined, ['result-pw', 'config-pw']);
            expect(candidates).to.not.include('cred-store-pw');
        });

        it('excludes variable placeholders even when wrapped in whitespace', async () => {
            // eslint-disable-next-line no-template-curly-in-string
            const candidates = await callCollect(undefined, ['  ${activeHostPassword}  ', '  ${promptForPassword}  ']);
            expect(candidates).to.deep.equal([]);
        });
    });

    describe('resolveDevicePassword', () => {
        beforeEach(async () => {
            await credentialStore.clearAll();
            vscode.context.workspaceState['_data'] = {};
            sinon.stub(deviceManager, 'getDefaultPassword').returns(undefined);
        });

        it('returns the first candidate that validates ok and refreshes the existing cred-store entry', async () => {
            await credentialStore.setPassword('SN-001', 'stored-pw');
            sinon.stub(deviceManager, 'validateDevicePassword').resolves('ok');

            const resolution = await userInputManager.resolveDevicePassword({ host: '1.2.3.4', serialNumber: 'SN-001' });

            expect(resolution).to.deep.equal({ status: 'ok', password: 'stored-pw' });
            expect(await credentialStore.getPassword('SN-001')).to.equal('stored-pw');
        });

        it('moves past bad-password candidates and uses the first accepted one', async () => {
            const stub = sinon.stub(deviceManager, 'validateDevicePassword') as any;
            stub.onCall(0).resolves('bad-password');
            stub.onCall(1).resolves('ok');

            const resolution = await userInputManager.resolveDevicePassword({ host: '1.2.3.4', serialNumber: 'SN-001', extraCandidates: ['rejected-pw', 'accepted-pw'] });

            expect(resolution).to.deep.equal({ status: 'ok', password: 'accepted-pw' });
            expect(stub.callCount).to.equal(2);
        });

        it('reports unreachable without prompting', async () => {
            await credentialStore.setPassword('SN-001', 'stored-pw');
            sinon.stub(deviceManager, 'validateDevicePassword').resolves('unreachable');
            const promptStub = sinon.stub(userInputManager as any, 'promptForDevicePassword');

            const resolution = await userInputManager.resolveDevicePassword({ host: '1.2.3.4', serialNumber: 'SN-001' });

            expect(resolution).to.deep.equal({ status: 'unreachable' });
            expect(promptStub.called).to.be.false;
        });

        it('prompts when every candidate is rejected, then accepts a typed password', async () => {
            const stub = sinon.stub(deviceManager, 'validateDevicePassword') as any;
            stub.onFirstCall().resolves('bad-password');
            stub.onSecondCall().resolves('ok');
            (sinon.stub(userInputManager as any, 'promptForDevicePassword') as any).resolves('typed-pw');

            const resolution = await userInputManager.resolveDevicePassword({ host: '1.2.3.4', serialNumber: 'SN-001', extraCandidates: ['rejected-pw'] });

            expect(resolution).to.deep.equal({ status: 'ok', password: 'typed-pw' });
        });

        it('re-prompts after a rejected typed password and reports cancelled when the user cancels', async () => {
            const validateStub = sinon.stub(deviceManager, 'validateDevicePassword') as any;
            validateStub.resolves('bad-password');
            const promptStub = sinon.stub(userInputManager as any, 'promptForDevicePassword') as any;
            promptStub.onCall(0).resolves('still-wrong');
            promptStub.onCall(1).resolves(undefined);

            const resolution = await userInputManager.resolveDevicePassword({ host: '1.2.3.4', serialNumber: undefined });

            expect(resolution).to.deep.equal({ status: 'cancelled' });
            expect(promptStub.callCount).to.equal(2);
        });

        it('does not seed the cred store when no entry exists for the serial', async () => {
            sinon.stub(deviceManager, 'validateDevicePassword').resolves('ok');

            const resolution = await userInputManager.resolveDevicePassword({ host: '1.2.3.4', serialNumber: 'SN-NEW', extraCandidates: ['winning-pw'] });

            expect(resolution).to.deep.equal({ status: 'ok', password: 'winning-pw' });
            expect(await credentialStore.getPassword('SN-NEW')).to.be.undefined;
        });
    });
});
