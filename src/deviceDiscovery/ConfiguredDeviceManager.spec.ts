import { expect } from 'chai';
import * as sinon from 'sinon';
import { vscode } from '../mockVscode.spec';
import { util as rokuDebugUtil } from 'roku-debug/dist/util';
import { ConfiguredDeviceManager } from './ConfiguredDeviceManager';
import type { ConfiguredDevice } from './types';

describe('ConfiguredDeviceManager', () => {
    let manager: ConfiguredDeviceManager;
    let dnsLookupStub: sinon.SinonStub;

    /**
     * Stub the `brightscript.devices` config for the user (global) and workspace scopes.
     */
    function stubConfig(userDevices: ConfiguredDevice[], workspaceDevices: ConfiguredDevice[] = []) {
        sinon.stub(vscode.workspace, 'getConfiguration').returns({
            inspect: () => ({ globalValue: userDevices, workspaceValue: workspaceDevices })
        } as any);
    }

    beforeEach(() => {
        manager = new ConfiguredDeviceManager();
        // Resolve hostnames to a predictable IP; individual tests can override.
        dnsLookupStub = sinon.stub(rokuDebugUtil, 'dnsLookup').callsFake((host: string) => Promise.resolve(`resolved-${host}`));
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('load', () => {
        it('loads devices from the user scope', async () => {
            stubConfig([{ host: '192.168.1.100', serialNumber: 'ABC', name: 'Living Room' }]);
            await manager.load();

            const all = manager.getAll();
            expect(all).to.have.lengthOf(1);
            expect(all[0]).to.include({ host: '192.168.1.100', serialNumber: 'ABC', name: 'Living Room' });
            expect(all[0].configuredIn).to.deep.equal(['user']);
        });

        it('resolves the host to an IP via DNS', async () => {
            stubConfig([{ host: 'my-roku.local' }]);
            await manager.load();
            expect(manager.getAll()[0].resolvedIp).to.equal('resolved-my-roku.local');
        });

        it('leaves resolvedIp undefined when DNS lookup fails', async () => {
            dnsLookupStub.rejects(new Error('ENOTFOUND'));
            stubConfig([{ host: 'unreachable.local' }]);
            await manager.load();
            expect(manager.getAll()[0].resolvedIp).to.be.undefined;
        });

        it('skips entries without a host', async () => {
            stubConfig([{ host: '192.168.1.100' }, { name: 'no host' } as any]);
            await manager.load();
            expect(manager.getAll()).to.have.lengthOf(1);
        });

        it('merges the same device across user and workspace scopes, tracking both', async () => {
            stubConfig(
                [{ host: '192.168.1.100', serialNumber: 'ABC', name: 'User Name' }],
                [{ host: '192.168.1.100', serialNumber: 'ABC', name: 'Workspace Name' }]
            );
            await manager.load();

            const all = manager.getAll();
            expect(all).to.have.lengthOf(1);
            expect(all[0].configuredIn).to.deep.equal(['user', 'workspace']);
            // workspace scope is applied last, so its values win
            expect(all[0].name).to.equal('Workspace Name');
        });

        it('keeps devices with the same host but different serials separate', async () => {
            stubConfig([
                { host: '192.168.1.100', serialNumber: 'AAA' },
                { host: '192.168.1.100', serialNumber: 'BBB' }
            ]);
            await manager.load();
            expect(manager.getAll()).to.have.lengthOf(2);
        });

        it('sorts devices by serialNumber||host key', async () => {
            stubConfig([
                { host: '192.168.1.100', serialNumber: 'ZZZ' },
                { host: '192.168.1.101', serialNumber: 'AAA' }
            ]);
            await manager.load();
            expect(manager.getAll().map(d => d.serialNumber)).to.deep.equal(['AAA', 'ZZZ']);
        });

        it('rebuilds in place, preserving the array reference', async () => {
            stubConfig([{ host: '192.168.1.100', serialNumber: 'AAA' }]);
            await manager.load();
            const ref = manager.getAll();

            (vscode.workspace.getConfiguration as sinon.SinonStub).restore();
            stubConfig([{ host: '192.168.1.200', serialNumber: 'BBB' }]);
            await manager.load();

            expect(manager.getAll()).to.equal(ref); // same array instance
            expect(ref.map(d => d.serialNumber)).to.deep.equal(['BBB']);
        });
    });

    describe('lookups', () => {
        beforeEach(async () => {
            dnsLookupStub.callsFake((host: string) => Promise.resolve(host)); // IP hosts resolve to themselves
            stubConfig([
                { host: '192.168.1.100', serialNumber: 'AAA' },
                { host: '192.168.1.101', serialNumber: 'BBB' }
            ]);
            await manager.load();
        });

        it('findBySerial returns the matching device', () => {
            expect(manager.findBySerial('BBB')?.host).to.equal('192.168.1.101');
        });

        it('findBySerial returns undefined for unknown serial', () => {
            expect(manager.findBySerial('nope')).to.be.undefined;
        });

        it('findByIp matches on resolvedIp', () => {
            expect(manager.findByIp('192.168.1.100')?.serialNumber).to.equal('AAA');
        });

        it('findByIp matches on raw host when resolvedIp differs', async () => {
            (vscode.workspace.getConfiguration as sinon.SinonStub).restore();
            dnsLookupStub.callsFake(() => Promise.resolve('10.0.0.1'));
            stubConfig([{ host: 'roku.local', serialNumber: 'CCC' }]);
            await manager.load();
            expect(manager.findByIp('roku.local')?.serialNumber).to.equal('CCC');
            expect(manager.findByIp('10.0.0.1')?.serialNumber).to.equal('CCC');
        });
    });

    describe('clear', () => {
        it('empties the list in place', async () => {
            stubConfig([{ host: '192.168.1.100', serialNumber: 'AAA' }]);
            await manager.load();
            const ref = manager.getAll();

            manager.clear();

            expect(manager.getAll()).to.have.lengthOf(0);
            expect(manager.getAll()).to.equal(ref); // same array instance
        });
    });
});
