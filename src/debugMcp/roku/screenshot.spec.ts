import { expect } from 'chai';
import { DebugStateStore } from '../core/debugStateStore';
import { DebugMcpRegistry } from '../core/integration';
import { ToolContentResult } from '../core/DebugMcpServer';
import { createRokuDebugIntegration } from './rokuIntegration';
import { createScreenshotTool, MAX_SCREENSHOT_BASE64_BYTES } from './screenshot';

function makeContext(configuration: Record<string, unknown>) {
    const session = { id: 'brs1', name: 'Roku', type: 'brightscript', configuration: configuration, customRequest: () => Promise.resolve({}) } as any;
    const group = { id: 'brs1', primary: session, primaryRuntime: 'brs', runtimes: [{ id: 'brs', description: '' }], members: [{ session: session, runtime: 'brs' }] };
    const registry = new DebugMcpRegistry();
    registry.registerDebugIntegration(createRokuDebugIntegration());
    return { sessions: { sessions: [session], groups: [group], activeGroup: group }, registry: registry, stateStore: new DebugStateStore(), host: {} as any, extensionVersion: '1', getWorkspaceFolders: () => [] };
}

describe('capture_screenshot', () => {
    it('captures the session device with its dev password and returns an image content item', async () => {
        const captured: any[] = [];
        const tool = createScreenshotTool(makeContext({ device: { id: 83 }, password: 'pw', packagePort: 8080 }), {
            getRceToken: () => Promise.resolve('t'),
            capture: (options) => {
                captured.push(options);
                return Promise.resolve({ buffer: Buffer.from('png-bytes'), format: 'png' });
            }
        });
        const result = await tool.handler({}) as ToolContentResult;
        expect(result).to.be.instanceOf(ToolContentResult);
        expect(captured[0]).to.eql({ device: { id: 83, rceToken: 't' }, password: 'pw', packagePort: 8080, timeout: 20000 });
        expect(result.content[0]).to.eql({ type: 'text', text: 'Screenshot of cloud emulator 83 (png, 9 bytes).' });
        expect(result.content[1]).to.eql({ type: 'image', data: Buffer.from('png-bytes').toString('base64'), mimeType: 'image/png' });
    });

    it('fails clearly without a Cloud Emulator token', async () => {
        const tool = createScreenshotTool(makeContext({ device: { id: 83 }, password: 'pw' }), { capture: () => Promise.reject(new Error('should not be called')) });
        let message: string;
        try {
            await tool.handler({});
        } catch (error) {
            message = (error as Error).message;
        }
        expect(message).to.contain('No Cloud Emulator token is available');
    });

    it('refuses a screenshot whose encoded size is over the limit', async () => {
        const tool = createScreenshotTool(makeContext({ host: '10.0.0.2', password: 'pw' }), {
            capture: () => Promise.resolve({ buffer: Buffer.alloc(Math.ceil(MAX_SCREENSHOT_BASE64_BYTES * 0.75) + 1024), format: 'png' })
        });
        let message: string;
        try {
            await tool.handler({});
        } catch (error) {
            message = (error as Error).message;
        }
        expect(message).to.contain('too large');
    });

    it('reports progress while capturing when the client asked for it', async function () {
        this.timeout(10000);
        const messages: string[] = [];
        const tool = createScreenshotTool(makeContext({ host: '10.0.0.2', password: 'pw' }), {
            capture: () => new Promise((resolve) => {
                setTimeout(() => resolve({ buffer: Buffer.alloc(1), format: 'png' }), 5200);
            })
        });
        await tool.handler({}, { reportProgress: (message) => messages.push(message) });
        expect(messages).to.eql(['Still capturing the screenshot']);
    });

    it('labels jpg screenshots as jpeg', async () => {
        const tool = createScreenshotTool(makeContext({ host: '10.0.0.2', password: 'pw' }), { capture: () => Promise.resolve({ buffer: Buffer.alloc(1), format: 'jpg' }) });
        const result = await tool.handler({}) as ToolContentResult;
        expect(result.content[1]).to.include({ mimeType: 'image/jpeg' });
    });
});
