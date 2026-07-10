import { expect } from 'chai';
import * as sinon from 'sinon';
let Module = require('module');

import { vscode } from '../mockVscode.spec';

//override the "require" call to mock certain items
const { require: oldRequire } = Module.prototype;

Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

import { SdkEnvDeviceProvider } from './SdkEnvDeviceProvider';

describe('SdkEnvDeviceProvider', () => {
    const envKeys = ['RK_DEVICE_IP', 'RK_DEVICE_PASSWORD', 'ROKU_DEV_TARGET', 'ROKU_DEV_PASSWORD'];

    let provider: SdkEnvDeviceProvider;

    beforeEach(() => {
        for (const key of envKeys) {
            delete process.env[key];
        }
        provider = new SdkEnvDeviceProvider();
    });

    afterEach(() => {
        for (const key of envKeys) {
            delete process.env[key];
        }
        provider?.dispose();
        sinon.restore();
    });

    it('returns no devices when neither env var is set', () => {
        expect(provider.getConfiguredDevices()).to.deep.equal([]);
    });

    it('surfaces the RK_DEVICE_IP device with its paired password', () => {
        process.env.RK_DEVICE_IP = '10.0.0.1';
        process.env.RK_DEVICE_PASSWORD = 'pool-pw';
        expect(provider.getConfiguredDevices()).to.deep.equal([{
            host: '10.0.0.1',
            name: 'RK_DEVICE_IP (env)',
            password: 'pool-pw'
        }]);
    });

    it('surfaces the ROKU_DEV_TARGET device with its paired password', () => {
        process.env.ROKU_DEV_TARGET = '10.0.0.2';
        process.env.ROKU_DEV_PASSWORD = 'cli-pw';
        expect(provider.getConfiguredDevices()).to.deep.equal([{
            host: '10.0.0.2',
            name: 'ROKU_DEV_TARGET (env)',
            password: 'cli-pw'
        }]);
    });

    it('omits the password key entirely when the paired password var is unset', () => {
        process.env.RK_DEVICE_IP = '10.0.0.1';
        const devices = provider.getConfiguredDevices();
        expect(devices).to.deep.equal([{ host: '10.0.0.1', name: 'RK_DEVICE_IP (env)' }]);
        expect(Object.keys(devices[0])).to.not.include('password');
    });

    it('returns both devices when the env vars point at different hosts', () => {
        process.env.RK_DEVICE_IP = '10.0.0.1';
        process.env.ROKU_DEV_TARGET = '10.0.0.2';
        expect(provider.getConfiguredDevices().map(x => x.host)).to.deep.equal(['10.0.0.1', '10.0.0.2']);
    });

    it('dedupes by host with RK_DEVICE_IP winning, matching the sdk precedence', () => {
        process.env.RK_DEVICE_IP = '10.0.0.1';
        process.env.RK_DEVICE_PASSWORD = 'pool-pw';
        process.env.ROKU_DEV_TARGET = '10.0.0.1';
        process.env.ROKU_DEV_PASSWORD = 'cli-pw';
        expect(provider.getConfiguredDevices()).to.deep.equal([{
            host: '10.0.0.1',
            name: 'RK_DEVICE_IP (env)',
            password: 'pool-pw'
        }]);
    });

    it('treats empty or whitespace-only env values as unset', () => {
        process.env.RK_DEVICE_IP = '   ';
        process.env.ROKU_DEV_TARGET = '';
        expect(provider.getConfiguredDevices()).to.deep.equal([]);
    });
});
