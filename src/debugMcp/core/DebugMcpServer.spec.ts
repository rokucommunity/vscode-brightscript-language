import { expect } from 'chai';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { DebugMcpServer } from './DebugMcpServer';
import type { DebugMcpInstanceInfo } from './DebugMcpServer';
import { getInstancesDirectory } from './paths';

describe('DebugMcpServer', () => {
    let debugMcpHome: string;
    let server: DebugMcpServer;
    const clients: net.Socket[] = [];

    beforeEach(async () => {
        debugMcpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bsmcp-'));
        server = new DebugMcpServer({
            debugMcpHome: debugMcpHome,
            extensionVersion: '1.2.3',
            vscodeVersion: '1.99.0',
            getWorkspaceFolders: () => ['/projects/app'],
            getWindowInfo: () => ({ name: 'app', uriScheme: 'vscode', appName: 'Visual Studio Code' }),
            tools: [{
                name: 'echo',
                description: 'Echoes its input',
                inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
                handler: (args) => ({ echoed: args.text })
            }]
        });
        await server.start();
    });

    afterEach(() => {
        for (const client of clients.splice(0)) {
            client.destroy();
        }
        server.dispose();
        fs.rmSync(debugMcpHome, { recursive: true, force: true });
    });

    /** Connects, optionally sends a handshake line, and collects the JSON lines the server sends. */
    async function connect(handshakeToken: string | undefined) {
        const socket = net.connect(server.socketPath);
        clients.push(socket);
        await new Promise<void>((resolve, reject) => {
            socket.once('connect', resolve);
            socket.once('error', reject);
        });
        const received: any[] = [];
        let acknowledged = false;
        let closed = false;
        let buffered = '';
        socket.on('data', (chunk) => {
            buffered += chunk.toString('utf8');
            let newlineIndex: number;
            while ((newlineIndex = buffered.indexOf('\n')) >= 0) {
                const message = JSON.parse(buffered.slice(0, newlineIndex));
                if (!acknowledged && message.brightscriptDebugMcp === 'ok') {
                    acknowledged = true;
                } else {
                    received.push(message);
                }
                buffered = buffered.slice(newlineIndex + 1);
            }
        });
        socket.on('close', () => {
            closed = true;
        });
        if (handshakeToken !== undefined) {
            socket.write(handshakeToken + '\n');
        }
        return {
            socket: socket,
            received: received,
            isAcknowledged: () => acknowledged,
            isClosed: () => closed,
            request: async (message: object) => {
                const expectedCount = received.length + 1;
                socket.write(JSON.stringify(message) + '\n');
                await waitFor(() => received.length >= expectedCount);
                return received[expectedCount - 1];
            }
        };
    }

    const initializeRequest = {
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } }
    };

    it('writes a discovery file readable only by the user', () => {
        const filePath = path.join(getInstancesDirectory(debugMcpHome), `${process.pid}.json`);
        const instance: DebugMcpInstanceInfo = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        expect(instance).to.include({
            pid: process.pid,
            socketPath: server.socketPath,
            token: server.token,
            vscodeVersion: '1.99.0',
            extensionVersion: '1.2.3'
        });
        expect(instance.workspaceFolders).to.eql(['/projects/app']);
        if (process.platform !== 'win32') {
            expect((fs.statSync(filePath).mode).toString(8).slice(-3)).to.equal('600');
        }
    });

    it('records the window identity, name, and initial debug and focus state', () => {
        const instance = readInstanceFile();
        expect(instance).to.include({ windowId: 'vscode:/projects/app', windowIdStable: true, name: 'app', appName: 'Visual Studio Code', debugSessionActive: false });
        expect(instance.focusedAt).to.be.undefined;
    });

    it('rewrites the discovery file when the debug session state changes', () => {
        server.setDebugSessionActive(true);
        expect(readInstanceFile().debugSessionActive).to.be.true;
        server.setDebugSessionActive(false);
        expect(readInstanceFile().debugSessionActive).to.be.false;
    });

    it('records when the window gained focus', () => {
        const before = Date.now();
        server.markFocused();
        expect(Date.parse(readInstanceFile().focusedAt)).to.be.at.least(before);
    });

    function readInstanceFile(): DebugMcpInstanceInfo {
        return JSON.parse(fs.readFileSync(path.join(getInstancesDirectory(debugMcpHome), `${process.pid}.json`), 'utf8'));
    }

    it('removes the discovery file on dispose', () => {
        const filePath = path.join(getInstancesDirectory(debugMcpHome), `${process.pid}.json`);
        server.dispose();
        expect(fs.existsSync(filePath)).to.be.false;
    });

    it('completes initialize and tools/list after the token handshake', async () => {
        const client = await connect(server.token);
        const initializeResponse = await client.request(initializeRequest);
        expect(initializeResponse.result.serverInfo.name).to.equal('brightscript-debugger');
        client.socket.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

        const listResponse = await client.request({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
        expect(listResponse.result.tools.map((tool) => tool.name)).to.eql(['echo']);
    });

    it('runs tools and reports unknown tools as errors', async () => {
        const client = await connect(server.token);
        await client.request(initializeRequest);

        const callResponse = await client.request({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'echo', arguments: { text: 'hi' } } });
        expect(JSON.parse(callResponse.result.content[0].text)).to.eql({ echoed: 'hi' });

        const unknownResponse = await client.request({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'nope' } });
        expect(unknownResponse.result.isError).to.be.true;
    });

    it('accepts MCP traffic sent in the same write as the token', async () => {
        const socket = net.connect(server.socketPath);
        clients.push(socket);
        const chunks: string[] = [];
        socket.on('data', (chunk) => chunks.push(chunk.toString('utf8')));
        socket.write(`${server.token}\n${JSON.stringify(initializeRequest)}\n`);
        await waitFor(() => chunks.join('').split('\n').length > 2);
        const lines = chunks.join('').split('\n');
        expect(JSON.parse(lines[0])).to.eql({ brightscriptDebugMcp: 'ok' });
        expect(JSON.parse(lines[1]).id).to.equal(1);
    });

    it('acknowledges a valid token with a single line before MCP traffic', async () => {
        const client = await connect(server.token);
        await waitFor(() => client.isAcknowledged());
        expect(client.received).to.be.empty;
    });

    it('serves several clients concurrently', async () => {
        const first = await connect(server.token);
        const second = await connect(server.token);
        const [firstResponse, secondResponse] = await Promise.all([
            first.request(initializeRequest),
            second.request({ ...initializeRequest, id: 7 })
        ]);
        expect(firstResponse.id).to.equal(1);
        expect(secondResponse.id).to.equal(7);
    });

    it('closes connections that present the wrong token', async () => {
        const client = await connect('wrong-token');
        await waitFor(() => client.isClosed());
        expect(client.isAcknowledged()).to.be.false;
        expect(client.received).to.be.empty;
    });

    it('closes connections whose first line is protocol traffic instead of the token', async () => {
        const client = await connect(JSON.stringify(initializeRequest));
        await waitFor(() => client.isClosed());
        expect(client.received).to.be.empty;
    });
});

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
        if (Date.now() > deadline) {
            throw new Error('Timed out waiting for condition');
        }
        await new Promise((resolve) => {
            setTimeout(resolve, 10);
        });
    }
}

describe('DebugMcpServer start failure', () => {
    let debugMcpHome: string;

    beforeEach(() => {
        debugMcpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bsmcp-fail-'));
    });

    afterEach(() => {
        fs.rmSync(debugMcpHome, { recursive: true, force: true });
    });

    it('closes the listener and removes the socket when setup fails after listening', async function () {
        if (process.platform === 'win32') {
            this.skip();
        }
        //a file where the instances directory belongs makes the post-listen mkdir throw
        fs.writeFileSync(getInstancesDirectory(debugMcpHome), 'not a directory');
        const server = new DebugMcpServer({
            debugMcpHome: debugMcpHome,
            extensionVersion: '1.2.3',
            vscodeVersion: '1.99.0',
            getWorkspaceFolders: () => [],
            tools: []
        });
        let thrown: Error;
        try {
            await server.start();
        } catch (error) {
            thrown = error as Error;
        }
        expect(thrown, 'start should reject').to.exist;
        expect(fs.existsSync(server.socketPath)).to.be.false;
        await new Promise<void>((resolve) => {
            const probe = net.connect(server.socketPath);
            probe.once('error', () => resolve());
            probe.once('connect', () => {
                probe.destroy();
                expect.fail('listener should be closed');
            });
        });
    });
});
