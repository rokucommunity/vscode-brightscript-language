import { expect } from 'chai';
import * as sinonImport from 'sinon';
import { EventEmitter } from 'eventemitter3';
import type { DeviceOut, RceDevice, RceDeviceConfig, RceManagementClient } from 'roku-deploy';
import { vscode } from '../mockVscode.spec';
import { RceManager } from '../managers/RceManager';
import { RceManagementViewProvider } from './RceManagementViewProvider';
import { ViewProviderCommand } from './ViewProviderCommand';
import { ViewProviderEvent } from './ViewProviderEvent';
import { WorkspaceStateKey } from './WorkspaceStateKey';
import { VscodeCommand } from '../commands/VscodeCommand';

let Module = require('module');
const { require: oldRequire } = Module.prototype;

Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

let sinon: sinonImport.SinonSandbox;
beforeEach(() => {
    sinon = sinonImport.createSandbox();
});
afterEach(() => {
    sinon.restore();
});

function createFakeManagementClient() {
    return {
        listDevices: sinon.stub(),
        createDevice: sinon.stub(),
        startDevice: sinon.stub(),
        stopDevice: sinon.stub(),
        listFirmwareVersions: sinon.stub(),
        listSnapshots: sinon.stub().resolves([]),
        getDeviceRuns: sinon.stub().resolves([]),
        updateDevice: sinon.stub(),
        deleteSnapshot: sinon.stub()
    };
}

/**
 * RceManager with the client construction stubbed out so tests can control the management api responses
 */
class TestRceManager extends RceManager {
    public fakeManagementClient = createFakeManagementClient();

    protected override createClient(token: string): RceManagementClient {
        return this.fakeManagementClient as unknown as RceManagementClient;
    }
}

/**
 * Minimal stand-in for RceFinder: a real EventEmitter (so `.on`/`.off`/`.emit` behave exactly like the
 * genuine finder) with a stubbed `scan()` so tests can observe the transition watch's polling
 */
class FakeRceFinder extends EventEmitter {
    public scan = sinon.stub().resolves();
}

/**
 * RceManagementViewProvider with RceDevice construction stubbed out, the same pattern as
 * TestRceManager overriding createClient, so tests can control the instance-api responses
 */
class TestRceManagementViewProvider extends RceManagementViewProvider {
    public fakeRceDevice = {
        sendDeveloperSettingsCombo: sinon.stub().resolves()
    };

    public lastRceDeviceConfig: RceDeviceConfig | undefined;

    protected override createRceDevice(config: RceDeviceConfig): RceDevice {
        this.lastRceDeviceConfig = config;
        return this.fakeRceDevice as unknown as RceDevice;
    }
}

/**
 * Lets any pending microtasks (chained promise callbacks from a fire-and-forget async handler) settle
 * before assertions run
 */
function flushMicrotasks(): Promise<void> {
    return new Promise((resolve) => {
        setImmediate(resolve);
    });
}

describe('RceManagementViewProvider', () => {
    let rceManager: TestRceManager;
    let rceFinder: FakeRceFinder;
    let provider: RceManagementViewProvider;
    let postOrQueueMessage: sinonImport.SinonStub;

    beforeEach(() => {
        rceFinder = undefined;
    });

    function createProvider() {
        if (!rceFinder) {
            rceFinder = new FakeRceFinder();
        }
        provider = new RceManagementViewProvider(vscode.context, { rceManager: rceManager, rceFinder: rceFinder } as any);
        postOrQueueMessage = sinon.stub(provider as any, 'postOrQueueMessage');
        return provider;
    }

    function createProviderWithFakeRceDevice(): TestRceManagementViewProvider {
        if (!rceFinder) {
            rceFinder = new FakeRceFinder();
        }
        const testProvider = new TestRceManagementViewProvider(vscode.context, { rceManager: rceManager, rceFinder: rceFinder } as any);
        provider = testProvider;
        postOrQueueMessage = sinon.stub(provider as any, 'postOrQueueMessage');
        return testProvider;
    }

    function findResponseMessage(command: ViewProviderCommand) {
        return postOrQueueMessage.getCalls().find((call) => call.args[0].command === command)?.args[0];
    }

    function findEventMessages(event: ViewProviderEvent) {
        return postOrQueueMessage.getCalls().map((call) => call.args[0]).filter((message) => message.event === event);
    }

    afterEach(() => {
        provider?.dispose();
    });

    describe('getRceState', () => {
        it('includes account names in the state but never leaks tokens', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            await rceManager.addAccount('work', 'token-work');
            await rceManager.addAccount('personal', 'token-personal');
            rceManager.fakeManagementClient.listDevices.resolves([]);

            createProvider();

            const message = { command: ViewProviderCommand.getRceState, context: {} };
            await provider['messageCommandCallbacks'][ViewProviderCommand.getRceState](message);

            const responseMessage = findResponseMessage(ViewProviderCommand.getRceState);
            expect(responseMessage.response.accounts).to.eql(['work', 'personal']);
            expect(responseMessage.response.activeAccountName).to.equal('personal');
            expect(JSON.stringify(responseMessage)).not.to.contain('token-work');
            expect(JSON.stringify(responseMessage)).not.to.contain('token-personal');
        });

        it('leaves devices undefined when no account is configured', async () => {
            rceManager = new TestRceManager(vscode.context as any);

            createProvider();

            const message = { command: ViewProviderCommand.getRceState, context: {} };
            await provider['messageCommandCallbacks'][ViewProviderCommand.getRceState](message);

            const responseMessage = findResponseMessage(ViewProviderCommand.getRceState);
            expect(responseMessage.response.hasToken).to.be.false;
            expect(responseMessage.response.devices).to.be.undefined;
            expect(rceManager.fakeManagementClient.listDevices.called).to.be.false;
        });
    });

    describe('startRceDevice', () => {
        it('responds with an error and does not start the device when it has no snapshot', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            await rceManager.addAccount('work', 'token-work');
            /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
            rceManager.fakeManagementClient.listDevices.resolves([
                { id: 5, name: 'my-device', device_type: 'tv', last_snapshot_id: null }
            ]);
            /* eslint-enable camelcase */

            createProvider();

            const message = { command: ViewProviderCommand.startRceDevice, context: { deviceId: 5 } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.startRceDevice](message);

            const responseMessage = findResponseMessage(ViewProviderCommand.startRceDevice);
            expect(responseMessage.error.message).to.contain('snapshot');
            expect(rceManager.fakeManagementClient.startDevice.called).to.be.false;
        });

        it('starts the device with an explicit snapshotId and remembers it for the device', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            await rceManager.addAccount('work', 'token-work');
            /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
            rceManager.fakeManagementClient.listDevices.resolves([
                { id: 5, name: 'my-device', device_type: 'tv', last_snapshot_id: 10, snapshots: [10, 20], firmware_version_id: 'rce-fw:1' }
            ]);
            rceManager.fakeManagementClient.listSnapshots.resolves([
                { id: 10, created_at: '2026-01-01', firmware_version_id: 'rce-fw:1' },
                { id: 20, created_at: '2026-01-02', firmware_version_id: 'rce-fw:2' }
            ]);
            /* eslint-enable camelcase */
            rceManager.fakeManagementClient.startDevice.resolves({ id: 5 });

            createProvider();

            const message = { command: ViewProviderCommand.startRceDevice, context: { deviceId: 5, snapshotId: 20 } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.startRceDevice](message);

            const startDeviceArgs = rceManager.fakeManagementClient.startDevice.getCall(0).args;
            expect(startDeviceArgs[0]).to.equal(5);
            expect(startDeviceArgs[1].snapshot_id).to.equal(20);
            expect(startDeviceArgs[1].firmware_version_id).to.equal('rce-fw:2');

            const remembered = vscode.context.workspaceState.get(WorkspaceStateKey.rceLastSnapshotByDevice);
            expect(remembered[5]).to.equal(20);
        });

        it('prefers the remembered snapshot over the live snapshot and last_snapshot_id when no explicit snapshotId is given', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            await rceManager.addAccount('work', 'token-work');
            await vscode.context.workspaceState.update(WorkspaceStateKey.rceLastSnapshotByDevice, { 5: 20 });
            /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
            rceManager.fakeManagementClient.listDevices.resolves([
                { id: 5, name: 'my-device', device_type: 'tv', last_snapshot_id: 10, snapshots: [10, 20, 30], firmware_version_id: 'rce-fw:1' }
            ]);
            rceManager.fakeManagementClient.listSnapshots.resolves([
                { id: 10, created_at: '2026-01-01', firmware_version_id: 'rce-fw:1', live: false },
                { id: 20, created_at: '2026-01-02', firmware_version_id: 'rce-fw:2', live: false },
                { id: 30, created_at: '2026-01-03', firmware_version_id: 'rce-fw:3', live: true }
            ]);
            /* eslint-enable camelcase */
            rceManager.fakeManagementClient.startDevice.resolves({ id: 5 });

            createProvider();

            const message = { command: ViewProviderCommand.startRceDevice, context: { deviceId: 5 } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.startRceDevice](message);

            const startDeviceArgs = rceManager.fakeManagementClient.startDevice.getCall(0).args;
            expect(startDeviceArgs[1].snapshot_id).to.equal(20);

            //a resolved default (even one that happens to match a prior remembered pick) is not re-persisted here;
            //the remembered value simply stays what it already was
            const remembered = vscode.context.workspaceState.get(WorkspaceStateKey.rceLastSnapshotByDevice) ?? {};
            expect(remembered[5]).to.equal(20);
        });

        it('starts from the live snapshot when there is no explicit snapshotId and no remembered pick, even when last_snapshot_id points elsewhere', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            await rceManager.addAccount('work', 'token-work');
            /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
            rceManager.fakeManagementClient.listDevices.resolves([
                { id: 5, name: 'my-device', device_type: 'tv', last_snapshot_id: 10, snapshots: [10, 30], firmware_version_id: 'rce-fw:1' }
            ]);
            rceManager.fakeManagementClient.listSnapshots.resolves([
                { id: 10, created_at: '2026-01-01', firmware_version_id: 'rce-fw:1', live: false },
                { id: 30, created_at: '2026-01-03', firmware_version_id: 'rce-fw:3', live: true }
            ]);
            /* eslint-enable camelcase */
            rceManager.fakeManagementClient.startDevice.resolves({ id: 5 });

            createProvider();

            const message = { command: ViewProviderCommand.startRceDevice, context: { deviceId: 5 } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.startRceDevice](message);

            const startDeviceArgs = rceManager.fakeManagementClient.startDevice.getCall(0).args;
            expect(startDeviceArgs[1].snapshot_id).to.equal(30);
            expect(startDeviceArgs[1].firmware_version_id).to.equal('rce-fw:3');
        });

        it('does not persist rceLastSnapshotByDevice when the start resolved a default snapshot rather than an explicit pick', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            await rceManager.addAccount('work', 'token-work');
            /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
            rceManager.fakeManagementClient.listDevices.resolves([
                { id: 5, name: 'my-device', device_type: 'tv', last_snapshot_id: 10, snapshots: [10, 30], firmware_version_id: 'rce-fw:1' }
            ]);
            rceManager.fakeManagementClient.listSnapshots.resolves([
                { id: 10, created_at: '2026-01-01', firmware_version_id: 'rce-fw:1', live: false },
                { id: 30, created_at: '2026-01-03', firmware_version_id: 'rce-fw:3', live: true }
            ]);
            /* eslint-enable camelcase */
            rceManager.fakeManagementClient.startDevice.resolves({ id: 5 });

            createProvider();

            const message = { command: ViewProviderCommand.startRceDevice, context: { deviceId: 5 } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.startRceDevice](message);

            const remembered = vscode.context.workspaceState.get(WorkspaceStateKey.rceLastSnapshotByDevice) ?? {};
            expect(remembered[5]).to.be.undefined;
        });
    });

    describe('getRceDeviceDetails', () => {
        it('returns snapshots, runs, and the remembered snapshot id', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            await rceManager.addAccount('work', 'token-work');
            await vscode.context.workspaceState.update(WorkspaceStateKey.rceLastSnapshotByDevice, { 5: 20 });
            /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
            rceManager.fakeManagementClient.listSnapshots.resolves([{ id: 20, created_at: '2026-01-01' }]);
            rceManager.fakeManagementClient.getDeviceRuns.resolves([{ id: 1, instance_id: 1, status: 'completed' }]);
            /* eslint-enable camelcase */

            createProvider();

            const message = { command: ViewProviderCommand.getRceDeviceDetails, context: { deviceId: 5 } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.getRceDeviceDetails](message);

            const responseMessage = findResponseMessage(ViewProviderCommand.getRceDeviceDetails);
            expect(responseMessage.response.snapshots).to.have.length(1);
            expect(responseMessage.response.runs).to.have.length(1);
            expect(responseMessage.response.lastUsedSnapshotId).to.equal(20);
        });
    });

    describe('updateRceDevice', () => {
        it('calls updateDevice with the new name and note', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            await rceManager.addAccount('work', 'token-work');
            rceManager.fakeManagementClient.updateDevice.resolves({ id: 5, name: 'renamed' });

            createProvider();

            const message = { command: ViewProviderCommand.updateRceDevice, context: { deviceId: 5, name: 'renamed', note: 'new note' } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.updateRceDevice](message);

            const updateDeviceArgs = rceManager.fakeManagementClient.updateDevice.getCall(0).args;
            expect(updateDeviceArgs[0]).to.equal(5);
            expect(updateDeviceArgs[1].name).to.equal('renamed');
            expect(updateDeviceArgs[1].note).to.equal('new note');
        });
    });

    describe('deleteRceSnapshot', () => {
        it('does not call deleteSnapshot when the confirmation modal is cancelled', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            await rceManager.addAccount('work', 'token-work');
            /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
            rceManager.fakeManagementClient.listSnapshots.resolves([
                { id: 20, name: 'my-snapshot', created_at: '2026-01-01', live: false, base: false }
            ]);
            /* eslint-enable camelcase */
            sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);

            createProvider();

            const message = { command: ViewProviderCommand.deleteRceSnapshot, context: { deviceId: 5, snapshotId: 20, snapshotName: 'my-snapshot' } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.deleteRceSnapshot](message);

            expect(rceManager.fakeManagementClient.deleteSnapshot.called).to.be.false;
            const responseMessage = findResponseMessage(ViewProviderCommand.deleteRceSnapshot);
            expect(responseMessage.response.deleted).to.be.false;
        });

        it('calls deleteSnapshot when the deletion is confirmed', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            await rceManager.addAccount('work', 'token-work');
            /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
            rceManager.fakeManagementClient.listSnapshots.resolves([
                { id: 20, name: 'my-snapshot', created_at: '2026-01-01', live: false, base: false }
            ]);
            /* eslint-enable camelcase */
            sinon.stub(vscode.window, 'showWarningMessage').resolves('Delete');
            rceManager.fakeManagementClient.deleteSnapshot.resolves();

            createProvider();

            const message = { command: ViewProviderCommand.deleteRceSnapshot, context: { deviceId: 5, snapshotId: 20, snapshotName: 'my-snapshot' } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.deleteRceSnapshot](message);

            expect(rceManager.fakeManagementClient.deleteSnapshot.calledWith(5, 20)).to.be.true;
        });

        it('refuses to delete the live snapshot without showing the confirm modal', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            await rceManager.addAccount('work', 'token-work');
            /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
            rceManager.fakeManagementClient.listSnapshots.resolves([
                { id: 20, name: 'my-snapshot', created_at: '2026-01-01', live: true, base: false }
            ]);
            /* eslint-enable camelcase */
            const showWarningMessage = sinon.stub(vscode.window, 'showWarningMessage').resolves('Delete');

            createProvider();

            const message = { command: ViewProviderCommand.deleteRceSnapshot, context: { deviceId: 5, snapshotId: 20, snapshotName: 'my-snapshot' } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.deleteRceSnapshot](message);

            expect(showWarningMessage.called).to.be.false;
            expect(rceManager.fakeManagementClient.deleteSnapshot.called).to.be.false;
            const responseMessage = findResponseMessage(ViewProviderCommand.deleteRceSnapshot);
            expect(responseMessage.error.message).to.contain('live');
            expect(responseMessage.error.message).not.to.contain('base');
        });

        it('refuses to delete the base snapshot without showing the confirm modal', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            await rceManager.addAccount('work', 'token-work');
            /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
            rceManager.fakeManagementClient.listSnapshots.resolves([
                { id: 20, name: 'my-snapshot', created_at: '2026-01-01', live: false, base: true }
            ]);
            /* eslint-enable camelcase */
            const showWarningMessage = sinon.stub(vscode.window, 'showWarningMessage').resolves('Delete');

            createProvider();

            const message = { command: ViewProviderCommand.deleteRceSnapshot, context: { deviceId: 5, snapshotId: 20, snapshotName: 'my-snapshot' } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.deleteRceSnapshot](message);

            expect(showWarningMessage.called).to.be.false;
            expect(rceManager.fakeManagementClient.deleteSnapshot.called).to.be.false;
            const responseMessage = findResponseMessage(ViewProviderCommand.deleteRceSnapshot);
            expect(responseMessage.error.message).to.contain('base');
            expect(responseMessage.error.message).not.to.contain('live');
        });

        it('responds with an error and does not show the modal when the snapshot no longer exists', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            await rceManager.addAccount('work', 'token-work');
            rceManager.fakeManagementClient.listSnapshots.resolves([]);
            const showWarningMessage = sinon.stub(vscode.window, 'showWarningMessage').resolves('Delete');

            createProvider();

            const message = { command: ViewProviderCommand.deleteRceSnapshot, context: { deviceId: 5, snapshotId: 20, snapshotName: 'my-snapshot' } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.deleteRceSnapshot](message);

            expect(showWarningMessage.called).to.be.false;
            expect(rceManager.fakeManagementClient.deleteSnapshot.called).to.be.false;
            const responseMessage = findResponseMessage(ViewProviderCommand.deleteRceSnapshot);
            expect(responseMessage.error.message).to.contain('no longer exists');
        });
    });

    describe('enableRceDevMode', () => {
        it('responds with an error and never constructs an RceDevice when the device is not running', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            await rceManager.addAccount('work', 'token-work');
            /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
            rceManager.fakeManagementClient.listDevices.resolves([
                { id: 5, name: 'my-device', device_type: 'tv', status: 'shutdown' }
            ]);
            /* eslint-enable camelcase */

            const testProvider = createProviderWithFakeRceDevice();

            const message = { command: ViewProviderCommand.enableRceDevMode, context: { deviceId: 5 } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.enableRceDevMode](message);

            const responseMessage = findResponseMessage(ViewProviderCommand.enableRceDevMode);
            expect(responseMessage.error.message).to.contain('must be running');
            expect(testProvider.fakeRceDevice.sendDeveloperSettingsCombo.called).to.be.false;
            expect(testProvider.lastRceDeviceConfig).to.be.undefined;
        });

        it('responds with an error and never constructs an RceDevice when a running device has no instance_api_url', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            await rceManager.addAccount('work', 'token-work');
            /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
            rceManager.fakeManagementClient.listDevices.resolves([
                { id: 5, name: 'my-device', device_type: 'tv', status: 'running', running_device: {} }
            ]);
            /* eslint-enable camelcase */

            const testProvider = createProviderWithFakeRceDevice();

            const message = { command: ViewProviderCommand.enableRceDevMode, context: { deviceId: 5 } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.enableRceDevMode](message);

            const responseMessage = findResponseMessage(ViewProviderCommand.enableRceDevMode);
            expect(responseMessage.error.message).to.contain('must be running');
            expect(testProvider.fakeRceDevice.sendDeveloperSettingsCombo.called).to.be.false;
            expect(testProvider.lastRceDeviceConfig).to.be.undefined;
        });

        it('sends the developer-settings combo to a running device with an instance api url', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            await rceManager.addAccount('work', 'token-work');
            /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
            rceManager.fakeManagementClient.listDevices.resolves([
                {
                    id: 5,
                    name: 'my-device',
                    device_type: 'tv',
                    status: 'running',
                    running_device: { instance_api_url: 'https://device.rce.roku.com/instance/abc' }
                }
            ]);
            /* eslint-enable camelcase */

            const testProvider = createProviderWithFakeRceDevice();

            const message = { command: ViewProviderCommand.enableRceDevMode, context: { deviceId: 5 } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.enableRceDevMode](message);

            expect(testProvider.fakeRceDevice.sendDeveloperSettingsCombo.calledOnce).to.be.true;
            expect(testProvider.lastRceDeviceConfig).to.eql({
                instanceUrl: 'https://device.rce.roku.com/instance/abc',
                rceToken: 'token-work'
            });
            const responseMessage = findResponseMessage(ViewProviderCommand.enableRceDevMode);
            expect(responseMessage.response.success).to.be.true;
        });
    });

    describe('watchRceDevice', () => {
        it('responds with an error and never invokes the rokuDeviceView command when the device is not running', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            await rceManager.addAccount('work', 'token-work');
            /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
            rceManager.fakeManagementClient.listDevices.resolves([
                { id: 5, name: 'my-device', device_type: 'tv', status: 'shutdown' }
            ]);
            /* eslint-enable camelcase */
            const executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves();

            createProvider();

            const message = { command: ViewProviderCommand.watchRceDevice, context: { deviceId: 5 } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.watchRceDevice](message);

            const responseMessage = findResponseMessage(ViewProviderCommand.watchRceDevice);
            expect(responseMessage.error.message).to.contain('must be running');
            expect(executeCommand.called).to.be.false;
        });

        it('responds with an error and never invokes the rokuDeviceView command when a running device has no janus_websocket_url', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            await rceManager.addAccount('work', 'token-work');
            /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
            rceManager.fakeManagementClient.listDevices.resolves([
                { id: 5, name: 'my-device', device_type: 'tv', status: 'running', running_device: {} }
            ]);
            /* eslint-enable camelcase */
            const executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves();

            createProvider();

            const message = { command: ViewProviderCommand.watchRceDevice, context: { deviceId: 5 } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.watchRceDevice](message);

            const responseMessage = findResponseMessage(ViewProviderCommand.watchRceDevice);
            expect(responseMessage.error.message).to.contain('must be running');
            expect(executeCommand.called).to.be.false;
        });

        it('responds with an error and never invokes the rokuDeviceView command when a running device has no janus_id', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            await rceManager.addAccount('work', 'token-work');
            /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
            rceManager.fakeManagementClient.listDevices.resolves([
                {
                    id: 5,
                    name: 'my-device',
                    device_type: 'tv',
                    status: 'running',
                    running_device: { janus_websocket_url: 'wss://device.rce.roku.com/instance/abc/janus', janus_id: null }
                }
            ]);
            /* eslint-enable camelcase */
            const executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves();

            createProvider();

            const message = { command: ViewProviderCommand.watchRceDevice, context: { deviceId: 5 } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.watchRceDevice](message);

            const responseMessage = findResponseMessage(ViewProviderCommand.watchRceDevice);
            expect(responseMessage.error.message).to.contain('must be running');
            expect(executeCommand.called).to.be.false;
        });

        it('executes the rokuDeviceView command with the janus stream config for a running device', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            await rceManager.addAccount('work', 'token-work');
            /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
            rceManager.fakeManagementClient.listDevices.resolves([
                {
                    id: 5,
                    name: 'my-device',
                    device_type: 'tv',
                    status: 'running',
                    running_device: {
                        janus_websocket_url: 'wss://device.rce.roku.com/instance/abc/janus',
                        janus_id: 7,
                        janus_pin: '1234',
                        janus_token: 'janus-secret',
                        janus_ice_servers: [{ urls: ['stun:stun.example.com'] }]
                    }
                }
            ]);
            /* eslint-enable camelcase */
            const executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves();

            createProvider();

            const message = { command: ViewProviderCommand.watchRceDevice, context: { deviceId: 5 } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.watchRceDevice](message);

            expect(executeCommand.calledOnce).to.be.true;
            const executeCommandArgs = executeCommand.getCall(0).args as any[];
            expect(executeCommandArgs[0]).to.equal(VscodeCommand.rokuDeviceViewShowRceStream);
            expect(executeCommandArgs[1]).to.eql({
                deviceId: 5,
                deviceName: 'my-device',
                websocketUrl: 'wss://device.rce.roku.com/instance/abc/janus',
                streamId: 7,
                pin: '1234',
                janusToken: 'janus-secret',
                iceServers: [{ urls: ['stun:stun.example.com'] }]
            });

            const responseMessage = findResponseMessage(ViewProviderCommand.watchRceDevice);
            expect(responseMessage.response.success).to.be.true;
        });

        it('treats a janus_id of 0 as a valid stream id rather than a missing one', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            await rceManager.addAccount('work', 'token-work');
            /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
            rceManager.fakeManagementClient.listDevices.resolves([
                {
                    id: 5,
                    name: 'my-device',
                    device_type: 'tv',
                    status: 'running',
                    running_device: {
                        janus_websocket_url: 'wss://device.rce.roku.com/instance/abc/janus',
                        janus_id: 0,
                        janus_ice_servers: []
                    }
                }
            ]);
            /* eslint-enable camelcase */
            const executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves();

            createProvider();

            const message = { command: ViewProviderCommand.watchRceDevice, context: { deviceId: 5 } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.watchRceDevice](message);

            expect(executeCommand.calledOnce).to.be.true;
            const executeCommandArgs = executeCommand.getCall(0).args as any[];
            expect(executeCommandArgs[1].streamId).to.equal(0);

            const responseMessage = findResponseMessage(ViewProviderCommand.watchRceDevice);
            expect(responseMessage.response.success).to.be.true;
        });

        it('registers rceWatchDeviceById as an internal command that resolves and shows the same stream config', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            await rceManager.addAccount('work', 'token-work');
            /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
            rceManager.fakeManagementClient.listDevices.resolves([
                {
                    id: 5,
                    name: 'my-device',
                    device_type: 'tv',
                    status: 'running',
                    running_device: {
                        janus_websocket_url: 'wss://device.rce.roku.com/instance/abc/janus',
                        janus_id: 7,
                        janus_ice_servers: []
                    }
                }
            ]);
            /* eslint-enable camelcase */
            const registeredCommands = new Map<string, (...args: any[]) => any>();
            (sinon.stub(vscode.commands, 'registerCommand') as sinon.SinonStub).callsFake((commandId: string, callback: any) => {
                registeredCommands.set(commandId, callback);
                return { dispose: () => { } };
            });
            const executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves();

            createProvider();

            await registeredCommands.get(VscodeCommand.rceWatchDeviceById)(5);

            expect(executeCommand.calledOnce).to.be.true;
            const executeCommandArgs = executeCommand.getCall(0).args as any[];
            expect(executeCommandArgs[0]).to.equal(VscodeCommand.rokuDeviceViewShowRceStream);
            expect(executeCommandArgs[1].deviceId).to.equal(5);
        });

        it('rejects from rceWatchDeviceById when the device is not running, without posting a response', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            await rceManager.addAccount('work', 'token-work');
            /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
            rceManager.fakeManagementClient.listDevices.resolves([
                { id: 5, name: 'my-device', device_type: 'tv', status: 'shutdown' }
            ]);
            /* eslint-enable camelcase */
            const registeredCommands = new Map<string, (...args: any[]) => any>();
            (sinon.stub(vscode.commands, 'registerCommand') as sinon.SinonStub).callsFake((commandId: string, callback: any) => {
                registeredCommands.set(commandId, callback);
                return { dispose: () => { } };
            });
            sinon.stub(vscode.commands, 'executeCommand').resolves();

            createProvider();

            let caughtError: Error;
            try {
                await registeredCommands.get(VscodeCommand.rceWatchDeviceById)(5);
            } catch (error) {
                caughtError = error as Error;
            }
            expect(caughtError?.message).to.contain('must be running');
        });
    });

    describe('runRceAccountCommand', () => {
        it('executes the matching rce vscode command', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            rceManager.fakeManagementClient.listDevices.resolves([]);

            createProvider();
            const executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves();

            const message = { command: ViewProviderCommand.runRceAccountCommand, context: { command: 'switchAccount' } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.runRceAccountCommand](message);

            expect(executeCommand.calledOnce).to.be.true;
            const executeCommandArgs = executeCommand.getCall(0).args as any[];
            expect(executeCommandArgs[0]).to.equal('extension.brightscript.rce.switchAccount');
        });

        it('rejects a command that is not on the allowlist and never calls executeCommand', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            rceManager.fakeManagementClient.listDevices.resolves([]);

            createProvider();
            const executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves();

            let receivedMessage;
            sinon.stub(provider as any, 'postMessage').callsFake((message) => {
                receivedMessage = message;
                return Promise.resolve();
            });

            let onDidReceiveMessageCallback;
            const view = {
                webview: {
                    onDidReceiveMessage: (callback) => {
                        onDidReceiveMessageCallback = callback;
                    },
                    postMessage: () => Promise.resolve()
                }
            };
            await provider['resolveWebviewView'](view as any, {} as any, {} as any);

            await onDidReceiveMessageCallback({
                command: ViewProviderCommand.runRceAccountCommand,
                context: { command: 'deleteEverything' }
            });

            expect(executeCommand.called).to.be.false;
            expect(receivedMessage.error.message).to.contain('deleteEverything');
        });
    });

    describe('finder devices event', () => {
        it('pushes onRceStateChanged with the emitted devices without calling listDevices', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            await rceManager.addAccount('work', 'token-work');

            createProvider();

            /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
            const emittedDevices: DeviceOut[] = [
                { id: 5, name: 'my-device', device_type: 'tv', status: 'running', created_at: '2026-01-01' }
            ];
            /* eslint-enable camelcase */
            rceFinder.emit('devices', emittedDevices);
            await flushMicrotasks();

            const eventMessages = findEventMessages(ViewProviderEvent.onRceStateChanged);
            expect(eventMessages.length).to.be.greaterThan(0);
            expect(eventMessages[eventMessages.length - 1].context.devices).to.equal(emittedDevices);
            expect(rceManager.fakeManagementClient.listDevices.called).to.be.false;
        });
    });

    describe('transition watch', () => {
        it('starts polling the finder after a successful start, on the documented interval', async () => {
            const clock = sinon.useFakeTimers();
            try {
                rceManager = new TestRceManager(vscode.context as any);
                await rceManager.addAccount('work', 'token-work');
                /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
                rceManager.fakeManagementClient.listDevices.resolves([
                    { id: 5, name: 'my-device', device_type: 'tv', last_snapshot_id: 10, snapshots: [10], firmware_version_id: 'rce-fw:1' }
                ]);
                rceManager.fakeManagementClient.listSnapshots.resolves([
                    { id: 10, created_at: '2026-01-01', firmware_version_id: 'rce-fw:1' }
                ]);
                /* eslint-enable camelcase */
                rceManager.fakeManagementClient.startDevice.resolves({ id: 5 });

                createProvider();

                const message = { command: ViewProviderCommand.startRceDevice, context: { deviceId: 5 } };
                await provider['messageCommandCallbacks'][ViewProviderCommand.startRceDevice](message);

                expect(rceFinder.scan.called).to.be.false;

                clock.tick(RceManagementViewProvider['transitionWatchIntervalMs']);
                expect(rceFinder.scan.callCount).to.equal(1);

                clock.tick(RceManagementViewProvider['transitionWatchIntervalMs']);
                expect(rceFinder.scan.callCount).to.equal(2);
            } finally {
                clock.restore();
            }
        });

        it('stops polling once a finder emission shows no device pending', () => {
            const clock = sinon.useFakeTimers();
            try {
                rceManager = new TestRceManager(vscode.context as any);
                createProvider();

                provider['startTransitionWatch']();
                clock.tick(RceManagementViewProvider['transitionWatchIntervalMs']);
                expect(rceFinder.scan.callCount).to.equal(1);

                //stopTransitionWatchIfSettled runs synchronously inside handleFinderDevices, so the
                //watch is already stopped by the time this call returns; no need to await anything
                /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
                provider['handleFinderDevices']([{ id: 5, name: 'my-device', device_type: 'tv', status: 'running', created_at: '2026-01-01' }]);
                /* eslint-enable camelcase */

                clock.tick(RceManagementViewProvider['transitionWatchIntervalMs'] * 2);
                expect(rceFinder.scan.callCount).to.equal(1);
            } finally {
                clock.restore();
            }
        });

        it('keeps polling while a device is still pending', () => {
            const clock = sinon.useFakeTimers();
            try {
                rceManager = new TestRceManager(vscode.context as any);
                createProvider();

                provider['startTransitionWatch']();
                clock.tick(RceManagementViewProvider['transitionWatchIntervalMs']);
                expect(rceFinder.scan.callCount).to.equal(1);

                /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
                provider['handleFinderDevices']([{ id: 5, name: 'my-device', device_type: 'tv', status: 'pending', created_at: '2026-01-01' }]);
                /* eslint-enable camelcase */

                clock.tick(RceManagementViewProvider['transitionWatchIntervalMs']);
                expect(rceFinder.scan.callCount).to.equal(2);
            } finally {
                clock.restore();
            }
        });

        it('stops after the safety timeout even when a device never stops being pending', () => {
            const clock = sinon.useFakeTimers();
            try {
                rceManager = new TestRceManager(vscode.context as any);
                createProvider();

                provider['startTransitionWatch']();
                clock.tick(RceManagementViewProvider['transitionWatchTimeoutMs']);
                const callCountAtTimeout = rceFinder.scan.callCount;

                clock.tick(RceManagementViewProvider['transitionWatchIntervalMs'] * 2);
                expect(rceFinder.scan.callCount).to.equal(callCountAtTimeout);
            } finally {
                clock.restore();
            }
        });
    });

    describe('dispose', () => {
        it('unsubscribes from token-changed notifications', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            rceManager.fakeManagementClient.listDevices.resolves([]);

            createProvider();
            provider.dispose();

            await rceManager.addAccount('work', 'token-work');

            expect(postOrQueueMessage.called).to.be.false;
        });

        it('clears the transition watch and unsubscribes from the finder devices event', () => {
            const clock = sinon.useFakeTimers();
            try {
                rceManager = new TestRceManager(vscode.context as any);
                createProvider();

                provider['startTransitionWatch']();
                provider.dispose();

                clock.tick(RceManagementViewProvider['transitionWatchIntervalMs'] * 3);
                expect(rceFinder.scan.called).to.be.false;

                postOrQueueMessage.resetHistory();
                //dispose() already removed the 'devices' listener, so this emit reaches no handler at all
                /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
                rceFinder.emit('devices', [{ id: 5, name: 'my-device', device_type: 'tv', status: 'running', created_at: '2026-01-01' }]);
                /* eslint-enable camelcase */

                expect(postOrQueueMessage.called).to.be.false;
            } finally {
                clock.restore();
            }
        });
    });
});
