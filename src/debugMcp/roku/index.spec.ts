import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { DebugStateStore } from '../core/debugStateStore';
import { DebugMcpRegistry } from '../core/integration';
import { createDebugMcpTools } from '../core/tools';
import { registerRokuDebugMcp } from './index';

describe('registerRokuDebugMcp', () => {
    const options = { getRceToken: () => Promise.resolve(undefined) };

    beforeEach(() => {
        sinon.stub(vscode.debug, 'onDidReceiveDebugSessionCustomEvent').returns({ dispose: () => { } } as any);
    });

    afterEach(() => sinon.restore());

    function createTools(registry: DebugMcpRegistry) {
        return createDebugMcpTools({ sessions: { sessions: [], groups: [] } as any, registry: registry, stateStore: new DebugStateStore(), host: {} as any, extensionVersion: '1', getWorkspaceFolders: () => [] });
    }

    it('adds the Roku tools next to the core tools, and points get_status at the device logs', async () => {
        const registry = new DebugMcpRegistry();
        registerRokuDebugMcp(registry, options);
        const tools = createTools(registry);
        expect(tools.map((tool) => tool.name)).to.include.members(['get_status', 'get_debug_output', 'send_keys', 'get_device_logs', 'capture_screenshot']);
        const status: any = await tools.find((tool) => tool.name === 'get_status').handler({});
        expect(status.tools.needsActiveSession).to.include.members(['get_device_logs', 'send_keys', 'capture_screenshot']);
        for (const tool of tools) {
            expect(JSON.stringify([tool.description, tool.inputSchema]), tool.name).not.to.match(/\.(js|ts)\b/);
            expect(tool.description, tool.name).not.to.contain(String.fromCharCode(0x2014));
        }
    });

    it('describes the Roku runtimes in the shared runtime argument', () => {
        const registry = new DebugMcpRegistry();
        registerRokuDebugMcp(registry, options);
        const waitForStop = createTools(registry).find((tool) => tool.name === 'wait_for_stop');
        const runtime: any = (waitForStop.inputSchema.properties as any).runtime;
        expect(runtime.enum).to.eql(['brs', 'js']);
        expect(runtime.description).to.contain('"brs" is the BrightScript runtime; "js" is the Hermes JavaScript runtime of a TypeScript SDK app.');
    });

    it('can be disposed', () => {
        const registry = new DebugMcpRegistry();
        for (const disposable of registerRokuDebugMcp(registry, options)) {
            disposable.dispose();
        }
        expect(createTools(registry).map((tool) => tool.name)).not.to.include('send_keys');
        expect(registry.getDeclaredRuntimes()).to.be.empty;
    });
});
