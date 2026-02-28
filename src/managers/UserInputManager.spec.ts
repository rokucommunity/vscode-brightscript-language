import { expect } from 'chai';
import * as path from 'path';
import { createSandbox } from 'sinon';
import { QuickPickItemKind } from 'vscode';
import { UserInputManager, manualHostItemId, scanForDevicesItemId } from './UserInputManager';
import { vscode } from '../mockVscode.spec';
import { standardizePath as s } from 'brighterscript';
import * as fsExtra from 'fs-extra';
import type { RokuDeviceDetails } from '../deviceDiscovery/DeviceManager';
import { DeviceManager } from '../deviceDiscovery/DeviceManager';
import { GlobalStateManager } from '../GlobalStateManager';
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

    beforeEach(() => {
        fsExtra.emptyDirSync(tempDir);

        //prevent the DeviceManager from actually running
        sinon.stub(DeviceManager.prototype as any, 'initialize').callsFake(() => { });
        sinon.stub(DeviceManager.prototype as any, 'setupConfiguration').callsFake(() => { });
        sinon.stub(DeviceManager.prototype as any, 'setupWindowFocusHandling').callsFake(() => { });
        sinon.stub(DeviceManager.prototype as any, 'setupMonitors').callsFake(() => { });
        let globalStateManager = new GlobalStateManager(vscode.context);
        let deviceManager = new DeviceManager(globalStateManager);
        userInputManager = new UserInputManager(deviceManager);
    });

    afterEach(() => {
        fsExtra.emptyDirSync(tempDir);
        sinon.restore();
    });

    describe('createHostQuickPickList', () => {
        const devices: Array<RokuDeviceDetails> = [{
            deviceInfo: {
                'user-device-name': 'roku1',
                'serial-number': 'alpha',
                'model-number': 'model1',
                'software-version': '11.5.0'
            },
            id: '1',
            ip: '1.1.1.1',
            location: '???',
            deviceState: 'online'
        }, {
            deviceInfo: {
                'user-device-name': 'roku2',
                'serial-number': 'beta',
                'model-number': 'model2',
                'software-version': '11.5.0'
            },
            id: '2',
            ip: '1.1.1.2',
            location: '???',
            deviceState: 'online'
        }, {
            deviceInfo: {
                'user-device-name': 'roku3',
                'serial-number': 'charlie',
                'model-number': 'model3',
                'software-version': '11.5.0'
            },
            id: '3',
            ip: '1.1.1.3',
            location: '???',
            deviceState: 'online'
        }];
        function label(device: RokuDeviceDetails) {
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
                userInputManager['createHostQuickPickList']([devices[0], devices[1], devices[2]], devices[1]).map(x => x.label)
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
                userInputManager['createHostQuickPickList'](devices, devices[1]).map(x => x.label)
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
                userInputManager['createHostQuickPickList']([devices[0]], devices[0]).map(x => x.label)
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
});
