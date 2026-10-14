import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createBridgeTools, createFallbackResponse, findMatchingInstances, getDebugMcpHome, pickInstance, readBridgeIdentity, readLiveInstances } from './bridge';
import type { BridgeInstanceInfo } from './bridge';

function makeInstance(pid: number, workspaceFolders: string[], startedAt: string): BridgeInstanceInfo {
    return { pid: pid, socketPath: `/tmp/${pid}.sock`, token: 'token', workspaceFolders: workspaceFolders, windowId: workspaceFolders.join('|'), startedAt: startedAt };
}

describe('debugMcp bridge', () => {
    describe('pickInstance', () => {
        it('picks the only instance whose workspace contains the working directory', () => {
            const instances = [
                makeInstance(1, ['/projects/other'], '2026-01-02T00:00:00Z'),
                makeInstance(2, ['/projects/app'], '2026-01-01T00:00:00Z')
            ];
            expect(pickInstance(instances, '/projects/app/source', 'darwin').pid).to.equal(2);
        });

        it('matches a working directory equal to the workspace folder', () => {
            const instances = [
                makeInstance(1, ['/projects/other'], '2026-01-02T00:00:00Z'),
                makeInstance(2, ['/projects/app/'], '2026-01-01T00:00:00Z')
            ];
            expect(pickInstance(instances, '/projects/app', 'darwin').pid).to.equal(2);
        });

        it('does not treat a sibling with a shared name prefix as containing the directory', () => {
            const instances = [
                makeInstance(1, ['/projects/app'], '2026-01-01T00:00:00Z'),
                makeInstance(2, ['/projects/app-two'], '2026-01-02T00:00:00Z')
            ];
            expect(pickInstance(instances, '/projects/app-two/source', 'darwin').pid).to.equal(2);
            expect(pickInstance(instances, '/projects/app/source', 'darwin').pid).to.equal(1);
        });

        it('picks nothing when several instances match', () => {
            const instances = [
                makeInstance(1, ['/projects/app'], '2026-01-01T00:00:00Z'),
                makeInstance(2, ['/projects/app'], '2026-01-03T00:00:00Z')
            ];
            expect(pickInstance(instances, '/projects/app', 'darwin')).to.be.undefined;
        });

        it('picks nothing when no instance matches, even if only one is open', () => {
            const instances = [makeInstance(1, ['/projects/other'], '2026-01-01T00:00:00Z')];
            expect(pickInstance(instances, '/elsewhere', 'darwin')).to.be.undefined;
        });

        it('returns undefined without instances', () => {
            expect(pickInstance([], '/anywhere', 'darwin')).to.be.undefined;
        });
    });

    describe('findMatchingInstances', () => {
        it('lists matches most recently started first and leaves out the rest', () => {
            const instances = [
                makeInstance(1, ['/projects/app'], '2026-01-01T00:00:00Z'),
                makeInstance(2, ['/projects/other'], '2026-01-04T00:00:00Z'),
                makeInstance(3, ['/projects/app'], '2026-01-03T00:00:00Z')
            ];
            expect(findMatchingInstances(instances, '/projects/app', 'darwin').map((instance) => instance.pid)).to.eql([3, 1]);
        });

        it('matches through symlinks in either direction', function () {
            if (process.platform === 'win32') {
                this.skip();
            }
            const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bsmcp-link-'));
            try {
                const realDirectory = path.join(root, 'real');
                fs.mkdirSync(path.join(realDirectory, 'source'), { recursive: true });
                const linkDirectory = path.join(root, 'link');
                fs.symlinkSync(realDirectory, linkDirectory);
                const throughLink = [makeInstance(1, [linkDirectory], '2026-01-01T00:00:00Z')];
                const throughReal = [makeInstance(2, [realDirectory], '2026-01-01T00:00:00Z')];

                expect(findMatchingInstances(throughLink, path.join(realDirectory, 'source'))).to.have.length(1);
                expect(findMatchingInstances(throughReal, path.join(linkDirectory, 'source'))).to.have.length(1);
            } finally {
                fs.rmSync(root, { recursive: true, force: true });
            }
        });

        it('compares paths case-insensitively on windows only', () => {
            const instances = [makeInstance(1, ['C:\\Projects\\App'], '2026-01-01T00:00:00Z')];
            expect(findMatchingInstances(instances, 'c:\\projects\\app', 'win32')).to.have.length(1);
            expect(findMatchingInstances(instances, 'c:\\projects\\app', 'linux')).to.have.length(0);
        });
    });

    describe('readLiveInstances', () => {
        let directory: string;

        beforeEach(() => {
            directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bsmcp-bridge-'));
        });

        afterEach(() => {
            fs.rmSync(directory, { recursive: true, force: true });
        });

        it('returns live instances, deletes dead ones, and ignores corrupt files', () => {
            fs.writeFileSync(path.join(directory, '10.json'), JSON.stringify(makeInstance(10, ['/live'], '2026-01-01T00:00:00Z')));
            fs.writeFileSync(path.join(directory, '11.json'), JSON.stringify(makeInstance(11, ['/dead'], '2026-01-01T00:00:00Z')));
            fs.writeFileSync(path.join(directory, '12.json'), '{not json');
            fs.writeFileSync(path.join(directory, 'notes.txt'), 'ignored');

            const instances = readLiveInstances(directory, (pid) => pid === 10);

            expect(instances.map((instance) => instance.pid)).to.eql([10]);
            expect(fs.existsSync(path.join(directory, '11.json'))).to.be.false;
            expect(fs.existsSync(path.join(directory, '12.json'))).to.be.true;
        });

        it('returns an empty list when the directory does not exist', () => {
            expect(readLiveInstances(path.join(directory, 'missing'))).to.eql([]);
        });
    });

    describe('getDebugMcpHome', () => {
        it('honors the environment override', () => {
            expect(getDebugMcpHome({ DEBUG_MCP_HOME: '/custom' }, '/home/user')).to.equal('/custom');
        });

        it('defaults under the home directory', () => {
            expect(getDebugMcpHome({}, '/home/user')).to.equal(path.join('/home/user', '.debug-mcp'));
        });
    });

    describe('readBridgeIdentity', () => {
        it('takes the names the launcher passes, else neutral defaults', () => {
            expect(readBridgeIdentity({ DEBUG_MCP_SERVER_NAME: 'acme-debugger', DEBUG_MCP_ACK_PROPERTY: 'acmeAck', DEBUG_MCP_PRODUCT_NAME: 'Acme' })).to.eql({ serverName: 'acme-debugger', ackProperty: 'acmeAck', productName: 'Acme' });
            expect(readBridgeIdentity({})).to.eql({ serverName: 'debug-mcp', ackProperty: 'debugMcp', productName: 'debugger' });
        });

        it('names the product in the fallback responses', () => {
            const response: any = createFallbackResponse({ jsonrpc: '2.0', id: 1, method: 'initialize' }, 'reason', {}, { serverName: 'acme-debugger', ackProperty: 'a', productName: 'Acme' });
            expect(response.result.serverInfo.name).to.equal('acme-debugger-bridge');
            expect(createBridgeTools(false, 'Acme').find((tool) => tool.name === 'list_windows').description).to.contain('run the Acme extension');
        });
    });

    describe('createFallbackResponse', () => {
        it('negotiates the latest supported version for an unknown request', () => {
            const response: any = createFallbackResponse({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2099-01-01' } }, 'reason');
            expect(response.result.protocolVersion).to.equal('2025-06-18');
        });

        it('answers initialize echoing the requested protocol version', () => {
            const response: any = createFallbackResponse({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } }, 'reason');
            expect(response.id).to.equal(1);
            expect(response.result.protocolVersion).to.equal('2024-11-05');
            expect(response.result.capabilities).to.eql({ tools: { listChanged: true } });
        });

        it('lists only the bridge tools, each saying how to get the debugger tools', () => {
            const response: any = createFallbackResponse({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, 'reason');
            expect(response.result.tools.map((tool) => tool.name)).to.eql(['get_status', 'list_windows', 'select_window']);
            for (const tool of response.result.tools) {
                expect(tool.description).to.contain('The debugger tools (launch, breakpoints, stepping, variables) appear after a VS Code window is selected. Call list_windows, then select_window.');
            }
        });

        it('explains why through get_status, including the window list', () => {
            const response: any = createFallbackResponse({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_status' } }, 'No match', { windows: [{ name: 'app' }] });
            expect(response.result.isError).to.be.undefined;
            expect(JSON.parse(response.result.content[0].text)).to.eql({ connected: false, message: 'No match', windows: [{ name: 'app' }] });
        });

        it('returns the reason as an error for tool calls', () => {
            const response: any = createFallbackResponse({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_debug_sessions' } }, 'No VS Code window');
            expect(response.result.isError).to.be.true;
            expect(response.result.content[0].text).to.equal('No VS Code window');
        });

        it('ignores notifications', () => {
            expect(createFallbackResponse({ jsonrpc: '2.0', method: 'notifications/initialized' }, 'reason')).to.be.undefined;
        });

        it('reports unknown methods as errors', () => {
            const response: any = createFallbackResponse({ jsonrpc: '2.0', id: 4, method: 'resources/list' }, 'reason');
            expect(response.error.code).to.equal(-32601);
        });
    });

    describe('createBridgeTools', () => {
        it('omits get_status and the selection guidance once connected', () => {
            const tools = createBridgeTools(true);
            expect(tools.map((tool) => tool.name)).to.eql(['list_windows', 'select_window']);
            expect(tools.every((tool) => !tool.description.includes('appear after'))).to.be.true;
        });
    });
});
