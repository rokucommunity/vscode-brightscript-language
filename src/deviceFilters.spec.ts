import { expect } from 'chai';
import { vscode } from './mockVscode.spec';

const Module = require('module');
const { require: oldRequire } = Module.prototype;
Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

import {
    DEFAULT_DEVICE_FILTERS,
    applyDeviceFilters,
    loadDeviceFilters
} from './deviceFilters';

function makeDevice(overrides: { key: string; isTv?: boolean; isStick?: boolean; deviceState?: string; lastDeviceState?: string; developerEnabled?: 'true' | 'false' | undefined; isConfigured?: boolean }): any {
    return {
        key: overrides.key,
        ip: '1.2.3.4',
        deviceState: overrides.deviceState ?? 'online',
        lastDeviceState: overrides.lastDeviceState ?? 'unknown',
        isConfigured: overrides.isConfigured ?? false,
        deviceInfo: {
            'is-tv': overrides.isTv ? 'true' : 'false',
            'is-stick': overrides.isStick ? 'true' : 'false',
            ...(overrides.developerEnabled !== undefined ? { 'developer-enabled': overrides.developerEnabled } : {})
        }
    };
}

describe('deviceFilters', () => {
    describe('applyDeviceFilters', () => {
        it('with the default filters: keeps online dev-enabled devices of every form factor', () => {
            const devices = [
                makeDevice({ key: 'tv' as any, isTv: true }),
                makeDevice({ key: 'stick' as any, isStick: true }),
                makeDevice({ key: 'stb' as any }),
                makeDevice({ key: 'offline' as any, deviceState: 'offline' }),
                makeDevice({ key: 'nondev' as any, developerEnabled: 'false' })
            ];
            const result = applyDeviceFilters(devices, DEFAULT_DEVICE_FILTERS);
            expect(result.map(d => d.key)).to.deep.equal(['tv', 'stick', 'stb']);
        });

        it('disabling a form-factor facet hides those devices', () => {
            const devices = [
                makeDevice({ key: 'tv', isTv: true }),
                makeDevice({ key: 'stb' }),
                makeDevice({ key: 'stick', isStick: true })
            ];
            const result = applyDeviceFilters(devices, { ...DEFAULT_DEVICE_FILTERS, tv: false });
            expect(result.map(d => d.key)).to.deep.equal(['stb', 'stick']);
        });

        it('treats pending devices as online only when lastDeviceState was online', () => {
            const devices = [
                makeDevice({ key: 'pending-was-online', deviceState: 'pending', lastDeviceState: 'online' }),
                makeDevice({ key: 'pending-first-load', deviceState: 'pending', lastDeviceState: 'unknown' })
            ];
            // With offline hidden (default), only the previously-online pending device shows
            const visible = applyDeviceFilters(devices, DEFAULT_DEVICE_FILTERS);
            expect(visible.map(d => d.key)).to.deep.equal(['pending-was-online']);

            // Showing only offline drops the previously-online pending one and keeps the first-load one
            const offlineOnly = applyDeviceFilters(devices, { ...DEFAULT_DEVICE_FILTERS, online: false, offline: true });
            expect(offlineOnly.map(d => d.key)).to.deep.equal(['pending-first-load']);
        });

        it('treats missing developer-enabled as enabled', () => {
            const devices = [
                makeDevice({ key: 'unknown' }),
                makeDevice({ key: 'explicit-on', developerEnabled: 'true' }),
                makeDevice({ key: 'explicit-off', developerEnabled: 'false' })
            ];
            const result = applyDeviceFilters(devices, { ...DEFAULT_DEVICE_FILTERS, devModeEnabled: false, devModeDisabled: true });
            expect(result.map(d => d.key)).to.deep.equal(['explicit-off']);
        });

        it('separates configured (user-defined) from discovered (auto-detected) devices', () => {
            const devices = [
                makeDevice({ key: 'configured', isConfigured: true }),
                makeDevice({ key: 'discovered', isConfigured: false })
            ];
            expect(
                applyDeviceFilters(devices, { ...DEFAULT_DEVICE_FILTERS, userDefined: false }).map(d => d.key)
            ).to.deep.equal(['discovered']);
            expect(
                applyDeviceFilters(devices, { ...DEFAULT_DEVICE_FILTERS, autoDetected: false }).map(d => d.key)
            ).to.deep.equal(['configured']);
        });
    });

    describe('loadDeviceFilters', () => {
        beforeEach(() => {
            (vscode.workspace as any)._configuration = {};
        });

        it('returns defaults when no settings are present under the section', () => {
            expect(loadDeviceFilters('brightscript.somePickerScope.filters')).to.deep.equal(DEFAULT_DEVICE_FILTERS);
        });

        it('applies overrides for boolean values under the requested section only', () => {
            (vscode.workspace as any)._configuration = {
                'brightscript.deviceQuickPick.filters.tv': false,
                'brightscript.deviceQuickPick.filters.offline': true,
                // Different section — should not leak into the picker's filters
                'brightscript.devicesView.filters.tv': true
            };
            const result = loadDeviceFilters('brightscript.deviceQuickPick.filters');
            expect(result.tv).to.equal(false);
            expect(result.offline).to.equal(true);
            // Untouched keys retain their defaults
            expect(result.online).to.equal(DEFAULT_DEVICE_FILTERS.online);
        });

        it('ignores non-boolean values', () => {
            (vscode.workspace as any)._configuration = {
                'brightscript.deviceQuickPick.filters.tv': 'not-a-bool',
                'brightscript.deviceQuickPick.filters.online': null
            };
            const result = loadDeviceFilters('brightscript.deviceQuickPick.filters');
            expect(result.tv).to.equal(DEFAULT_DEVICE_FILTERS.tv);
            expect(result.online).to.equal(DEFAULT_DEVICE_FILTERS.online);
        });
    });
});
