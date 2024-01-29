import { expect } from 'chai';
import * as path from 'path';
import { createSandbox } from 'sinon';
import { QuickPickItemKind } from 'vscode';
import { UserInputManager, manualHostItemId } from './UserInputManager';
import { vscode } from '../mockVscode.spec';
import { standardizePath as s } from 'brighterscript';
import * as fsExtra from 'fs-extra';
import type { RokuDeviceDetails } from '../ActiveDeviceManager';
import { ActiveDeviceManager } from '../ActiveDeviceManager';

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

        //prevent the 'start' method from actually running
        sinon.stub(ActiveDeviceManager.prototype as any, 'start').callsFake(() => { });
        let activeDeviceManager = new ActiveDeviceManager();
        userInputManager = new UserInputManager(activeDeviceManager);
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
                userInputManager['createHostQuickPickList']([], undefined)
            ).to.eql([{
                label: 'Enter manually',
                device: {
                    id: manualHostItemId
                }
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
                    label: '1.1.1.1 | roku1 - alpha - model1',
                    device: devices[0]
                },
                {
                    kind: QuickPickItemKind.Separator,
                    label: ' '
                }, {
                    label: 'Enter manually',
                    device: {
                        id: manualHostItemId
                    }
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
                'Enter manually'
            ]);
        });

        it('includes the spinner text when "last used" and "other devices" separators are both present', () => {
            expect(
                userInputManager['createHostQuickPickList'](devices, devices[1]).map(x => x.label)
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

        it('includes the spinner text if "devices" separator is present', () => {
            expect(
                userInputManager['createHostQuickPickList'](devices, null).map(x => x.label)
            ).to.eql([
                'devices',
                label(devices[0]),
                label(devices[1]),
                label(devices[2]),
                ' ',
                'Enter manually'
            ]);
        });

        it('includes the spinner text if only "last used" separator is present', () => {
            expect(
                userInputManager['createHostQuickPickList']([devices[0]], devices[0]).map(x => x.label)
            ).to.eql([
                'last used',
                label(devices[0]),
                ' ',
                'Enter manually'
            ]);
        });

        it('includes the spinner text when no other device entries are present', () => {
            expect(
                userInputManager['createHostQuickPickList']([], null).map(x => x.label)
            ).to.eql([
                'Enter manually'
            ]);
        });
    });
});
