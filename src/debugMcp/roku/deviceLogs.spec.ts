import { expect } from 'chai';
import { DebugStateStore } from '../core/debugStateStore';
import { DebugMcpRegistry } from '../core/integration';
import type { DebugMcpToolContext } from '../core/toolSupport';
import { createDeviceLogsTool, DeviceLogStore } from './deviceLogs';
import { createRokuDebugIntegration } from './rokuIntegration';

function makeSession(id: string) {
    return { id: id, name: id, type: 'brightscript', configuration: {}, customRequest: () => Promise.resolve({}) } as any;
}

/** The shape of the custom event the Roku debug adapter sends for a device console line. */
function logOutputEvent(line: string) {
    return { type: 'event', event: 'LogOutputEvent', body: { line: line } };
}

describe('DeviceLogStore', () => {
    it('keeps device console lines per session and ignores every other custom event', () => {
        const store = new DeviceLogStore();
        store.handleCustomEvent('brs1', logOutputEvent('print one\n'));
        store.handleCustomEvent('brs1', { event: 'DebugServerLogOutputEvent', body: { line: 'DebugServer: adapter chatter' } });
        store.handleCustomEvent('brs1', { event: 'RendezvousEvent', body: {} });
        store.handleCustomEvent('brs1', { event: 'LogOutputEvent', body: {} });
        store.handleCustomEvent('brs2', logOutputEvent('other session'));
        expect(store.read('brs1', { maxLines: 10 }).lines.map((line) => line.text)).to.eql(['print one']);
        expect(store.read('brs2', { maxLines: 10 }).lines).to.have.length(1);
        expect(store.has('nope')).to.be.false;
        expect(store.read('nope', { maxLines: 10 }).lines).to.be.empty;
    });

    it('is a ring buffer with cursors that report evicted lines', () => {
        const store = new DeviceLogStore(5);
        store.handleCustomEvent('brs1', logOutputEvent('1\n2\n3\n4\n5\n6\n7\n'));
        const newest = store.read('brs1', { maxLines: 10 });
        expect(newest.lines.map((line) => line.text)).to.eql(['3', '4', '5', '6', '7']);
        expect(store.read('brs1', { sinceCursor: 0, maxLines: 10 }).droppedLines).to.be.true;
        store.handleCustomEvent('brs1', logOutputEvent('8'));
        const resumed = store.read('brs1', { sinceCursor: newest.nextCursor, maxLines: 10 });
        expect(resumed.lines.map((line) => line.text)).to.eql(['8']);
        expect(resumed.droppedLines).to.be.false;
    });

    it('holds about twenty thousand lines by default', () => {
        const store = new DeviceLogStore();
        store.handleCustomEvent('brs1', logOutputEvent(Array.from({ length: 20500 }, (_value, index) => `line ${index}`).join('\n')));
        expect(store.read('brs1', { sinceCursor: 0, maxLines: 1 }).droppedLines).to.be.true;
        expect(store.read('brs1', { maxLines: 1000 }).lines.pop().text).to.equal('line 20499');
    });

    it('remembers only the most recent sessions', () => {
        const store = new DeviceLogStore();
        for (let index = 0; index < 25; index++) {
            store.handleCustomEvent(`s${index}`, logOutputEvent('x'));
        }
        expect(store.has('s0')).to.be.false;
        expect(store.has('s24')).to.be.true;
    });
});

describe('get_device_logs', () => {
    let logStore: DeviceLogStore;
    let context: DebugMcpToolContext;

    beforeEach(() => {
        logStore = new DeviceLogStore();
        const registry = new DebugMcpRegistry();
        registry.registerDebugIntegration(createRokuDebugIntegration());
        const brightScript = makeSession('brs1');
        const group = { id: 'brs1', primary: brightScript, primaryRuntime: 'brs', runtimes: [{ id: 'brs', description: '' }, { id: 'js', description: '' }], members: [{ session: brightScript, runtime: 'brs' }] };
        context = { sessions: { sessions: [brightScript], groups: [group], activeGroup: group }, registry: registry, stateStore: new DebugStateStore(), host: {} as any, extensionVersion: '1', getWorkspaceFolders: () => [] };
    });

    it('returns the device console lines of the group\'s BrightScript session', async () => {
        logStore.handleCustomEvent('brs1', logOutputEvent('print one\nBRIGHTSCRIPT: ERROR: boom\n'));
        const result: any = await createDeviceLogsTool(context, logStore).handler({});
        expect(result.sessionId).to.equal('brs1');
        expect(result.lines.map((line) => line.text)).to.eql(['print one', 'BRIGHTSCRIPT: ERROR: boom']);
    });

    it('is empty for a session that has not logged yet', async () => {
        const result: any = await createDeviceLogsTool(context, logStore).handler({});
        expect(result).to.include({ sessionId: 'brs1', nextCursor: 0, hasMore: false });
        expect(result.lines).to.be.empty;
    });

    it('resumes from a cursor and filters with a regular expression', async () => {
        const tool = createDeviceLogsTool(context, logStore);
        logStore.handleCustomEvent('brs1', logOutputEvent('a\nb\n'));
        const first: any = await tool.handler({});
        logStore.handleCustomEvent('brs1', logOutputEvent('ERROR c\nd\n'));
        const next: any = await tool.handler({ sinceCursor: first.nextCursor });
        expect(next.lines.map((line) => line.text)).to.eql(['ERROR c', 'd']);
        const filtered: any = await tool.handler({ filter: '^ERROR' });
        expect(filtered.lines.map((line) => line.text)).to.eql(['ERROR c']);
    });

    it('reads the BrightScript session of the group when sessionId names another member', async () => {
        (context.sessions.groups[0] as any).members.push({ session: makeSession('child'), runtime: 'js' });
        logStore.handleCustomEvent('brs1', logOutputEvent('device line\n'));
        const result: any = await createDeviceLogsTool(context, logStore).handler({ sessionId: 'child' });
        expect(result.sessionId).to.equal('brs1');
        expect(result.lines).to.have.length(1);
    });

    it('still reads the log of a session that already ended', async () => {
        logStore.handleCustomEvent('brs1', logOutputEvent('last words\n'));
        (context.sessions as any).groups = [];
        const result: any = await createDeviceLogsTool(context, logStore).handler({ sessionId: 'brs1' });
        expect(result.lines.map((line) => line.text)).to.eql(['last words']);
    });

    it('describes the device log, and avoids file extensions', () => {
        const tool = createDeviceLogsTool(context, logStore);
        expect(tool.description).to.contain('console');
        expect(JSON.stringify([tool.description, tool.inputSchema])).not.to.match(/\.(js|ts)\b/);
    });
});
