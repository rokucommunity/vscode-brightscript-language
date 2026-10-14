import { expect } from 'chai';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { PassThrough } from 'stream';
import { DebugMcpBridge, LineBuffer } from './bridge';
import type { BridgeInstanceInfo } from './bridge';
import { DebugMcpServer } from './DebugMcpServer';
import { getInstancesDirectory } from './paths';

describe('DebugMcpBridge', () => {
    let debugMcpHome: string;
    let input: PassThrough;
    let output: PassThrough;
    let bridge: DebugMcpBridge;
    let outputLines: any[];
    let servers: DebugMcpServer[];
    let fakeServers: net.Server[];
    let fakeSockets: net.Socket[];
    let releaseSlowTool: () => void;

    beforeEach(() => {
        debugMcpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bsmcp-bridge-e2e-'));
        input = new PassThrough();
        output = new PassThrough();
        outputLines = [];
        servers = [];
        fakeServers = [];
        fakeSockets = [];
        const lineBuffer = new LineBuffer();
        output.on('data', (chunk) => {
            for (const line of lineBuffer.push(chunk)) {
                outputLines.push(JSON.parse(line));
            }
        });
        bridge = createBridge();
        bridge.start();
    });

    afterEach(() => {
        bridge.stop();
        for (const server of servers) {
            server.dispose();
        }
        for (const fakeSocket of fakeSockets) {
            fakeSocket.destroy();
        }
        for (const fakeServer of fakeServers) {
            fakeServer.close();
        }
        fs.rmSync(debugMcpHome, { recursive: true, force: true });
    });

    function createBridge(rescanIntervalMs = 60000): DebugMcpBridge {
        return new DebugMcpBridge({
            input: input,
            output: output,
            debugMcpHome: debugMcpHome,
            workingDirectory: '/projects/app',
            identity: { serverName: 'brightscript-debugger', ackProperty: 'brightscriptDebugMcp', productName: 'BrightScript' },
            rescanIntervalMs: rescanIntervalMs,
            log: () => { }
        });
    }

    async function startServer(options: { folders?: string[]; name?: string } = {}): Promise<DebugMcpServer> {
        const server = new DebugMcpServer({
            debugMcpHome: debugMcpHome,
            extensionVersion: '1.2.3',
            vscodeVersion: '1.99.0',
            getWorkspaceFolders: () => options.folders ?? ['/projects/app'],
            getWindowInfo: () => ({ name: options.name ?? 'app' }),
            tools: [{
                name: 'echo',
                description: 'Echoes its input',
                inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
                handler: (args) => ({ echoed: args.text })
            }, {
                name: 'slow',
                description: 'Never answers until released',
                inputSchema: { type: 'object' },
                handler: () => new Promise((resolve) => {
                    releaseSlowTool = () => resolve({});
                })
            }]
        });
        await server.start();
        servers.push(server);
        return server;
    }

    function writeInstanceFile(name: string, socketPath: string, token: string, startedAt: string, overrides: Partial<BridgeInstanceInfo> = {}): void {
        const instance: BridgeInstanceInfo = { pid: process.pid, socketPath: socketPath, token: token, workspaceFolders: ['/projects/app'], windowId: name, startedAt: startedAt, ...overrides };
        const directory = getInstancesDirectory(debugMcpHome);
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(path.join(directory, `${name}.json`), JSON.stringify(instance));
    }

    function send(message: object): void {
        input.write(JSON.stringify(message) + '\n');
    }

    async function request(message: { id: number; [key: string]: unknown }): Promise<any> {
        send(message);
        await waitFor(() => outputLines.some((line) => line.id === message.id));
        return outputLines.find((line) => line.id === message.id);
    }

    function countListChanged(): number {
        return outputLines.filter((line) => line.method === 'notifications/tools/list_changed').length;
    }

    const initializeRequest = {
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } }
    };

    async function initializeClient(): Promise<any> {
        const response = await request(initializeRequest);
        send({ jsonrpc: '2.0', method: 'notifications/initialized' });
        return response;
    }

    it('answers from the fallback when no instance exists', async () => {
        const initializeResponse = await initializeClient();
        expect(initializeResponse.result.serverInfo.name).to.equal('brightscript-debugger-bridge');
        expect(initializeResponse.result.capabilities.tools.listChanged).to.be.true;
        const listResponse = await request({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
        expect(listResponse.result.tools.map((tool) => tool.name)).to.eql(['get_status', 'list_windows', 'select_window']);
    });

    it('connects on the next request after a server appears, replaying initialize, and announces the change', async () => {
        await initializeClient();
        await request({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
        await startServer();

        const listResponse = await request({ jsonrpc: '2.0', id: 3, method: 'tools/list' });

        expect(listResponse.result.tools.map((tool) => tool.name)).to.eql(['echo', 'slow', 'list_windows', 'select_window']);
        expect(countListChanged()).to.equal(1);
        expect(outputLines.filter((line) => line.result?.serverInfo?.name === 'brightscript-debugger')).to.be.empty;
        expect(outputLines.every((line) => typeof line.id !== 'string' || !line.id.startsWith('__'))).to.be.true;
    });

    it('sends the initialize replay and initialized notification before forwarding the request', async () => {
        const received: any[] = [];
        const fakeServer = net.createServer();
        fakeServers.push(fakeServer);
        fakeServer.on('connection', (socket) => {
            fakeSockets.push(socket);
            const lineBuffer = new LineBuffer();
            let tokenSeen = false;
            socket.on('data', (chunk) => {
                for (const line of lineBuffer.push(chunk)) {
                    if (!tokenSeen) {
                        tokenSeen = true;
                        received.push({ token: line });
                        socket.write(JSON.stringify({ brightscriptDebugMcp: 'ok' }) + '\n');
                        continue;
                    }
                    const message = JSON.parse(line);
                    received.push(message);
                    if (message.id !== undefined) {
                        socket.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {} }) + '\n');
                    }
                }
            });
        });

        const socketPath = path.join(debugMcpHome, 'fake.sock');
        await new Promise<void>((resolve) => {
            fakeServer.listen(socketPath, resolve);
        });

        await initializeClient();
        writeInstanceFile('fake', socketPath, 'fake-token', '2026-01-01T00:00:00Z');
        await request({ jsonrpc: '2.0', id: 2, method: 'ping' });

        expect(received.map((message) => message.token ?? message.method)).to.eql(['fake-token', 'initialize', 'notifications/initialized', 'ping']);
        expect(received[1].params).to.eql(initializeRequest.params);
        expect(received[1].id).to.not.equal(1);
    });

    it('answers in-flight requests with an error when the server goes away, then reconnects to a new server', async () => {
        const firstServer = await startServer();
        await initializeClient();
        send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'slow', arguments: {} } });
        await bridgeToServerRoundTrip();
        const listChangedBefore = countListChanged();

        firstServer.dispose();
        await waitFor(() => outputLines.some((line) => line.id === 2));

        const errorResponse = outputLines.find((line) => line.id === 2);
        expect(errorResponse.error.code).to.equal(-32000);
        expect(errorResponse.error.message).to.contain('Lost connection to VS Code');
        await waitFor(() => countListChanged() === listChangedBefore + 1);

        const secondServer = await startServer();
        expect(secondServer.token).to.not.equal(firstServer.token);
        const echoResponse = await request({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'echo', arguments: { text: 'again' } } });
        expect(JSON.parse(echoResponse.result.content[0].text)).to.eql({ echoed: 'again' });
        expect(countListChanged()).to.equal(listChangedBefore + 2);
        releaseSlowTool?.();
    });

    async function bridgeToServerRoundTrip(): Promise<void> {
        //a later request completing proves the slow call was already forwarded
        await request({ jsonrpc: '2.0', id: 99, method: 'tools/call', params: { name: 'echo', arguments: { text: 'sync' } } });
    }

    it('reassembles requests split across stdin chunks', async () => {
        await startServer();
        const line = JSON.stringify(initializeRequest) + '\n';
        input.write(line.slice(0, 20));
        await pause(20);
        input.write(line.slice(20, 60));
        await pause(20);
        input.write(line.slice(60));

        await waitFor(() => outputLines.some((candidate) => candidate.id === 1));
        expect(outputLines.find((candidate) => candidate.id === 1).result.serverInfo.name).to.equal('brightscript-debugger');
    });

    it('announces a server appearing even when the client stays idle', async () => {
        bridge.stop();
        bridge = createBridge(30);
        bridge.start();
        await initializeClient();
        await startServer();

        await waitFor(() => countListChanged() === 1);
    });

    /** Starts a fake window that acks any token and hands each parsed message to `onMessage`. */
    async function startFakeServer(
        name: string,
        onMessage: (message: any, socket: net.Socket) => void,
        options: { acknowledge?: boolean } = {}
    ): Promise<{ received: any[]; socketPath: string }> {
        const received: any[] = [];
        const fakeServer = net.createServer();
        fakeServers.push(fakeServer);
        fakeServer.on('connection', (socket) => {
            fakeSockets.push(socket);
            const lineBuffer = new LineBuffer();
            let tokenSeen = false;
            socket.on('error', () => { });
            socket.on('data', (chunk) => {
                for (const line of lineBuffer.push(chunk)) {
                    if (!tokenSeen) {
                        tokenSeen = true;
                        if (options.acknowledge !== false) {
                            socket.write(JSON.stringify({ brightscriptDebugMcp: 'ok' }) + '\n');
                        }
                        continue;
                    }
                    const message = JSON.parse(line);
                    received.push(message);
                    onMessage(message, socket);
                }
            });
        });
        const socketPath = path.join(debugMcpHome, `${name}.sock`);
        await new Promise<void>((resolve) => {
            fakeServer.listen(socketPath, resolve);
        });
        return { received: received, socketPath: socketPath };
    }

    function respondToRequests(message: any, socket: net.Socket): void {
        if (message.id !== undefined && message.method !== undefined) {
            socket.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {} }) + '\n');
        }
    }

    it('answers a client request within a bounded time when an instance accepts the socket but never acknowledges', async () => {
        bridge.stop();
        bridge = new DebugMcpBridge({
            input: input,
            output: output,
            debugMcpHome: debugMcpHome,
            workingDirectory: '/projects/app',
            rescanIntervalMs: 20,
            connectTimeoutMs: 300,
            log: () => { }
        });
        bridge.start();
        const hung = await startFakeServer('hung', () => { }, { acknowledge: false });
        writeInstanceFile('hung', hung.socketPath, 'token', '2026-01-01T00:00:00Z');
        await initializeClient();
        await pause(200);

        const startedAt = Date.now();
        const response = await request({ jsonrpc: '2.0', id: 2, method: 'tools/list' });

        expect(response.result.tools.map((tool) => tool.name)).to.eql(['get_status', 'list_windows', 'select_window']);
        expect(Date.now() - startedAt).to.be.lessThan(1000);
    });

    it('forwards a request queued behind an in-progress handshake replay after it', async () => {
        const fake = await startFakeServer('slow-replay', (message, socket) => {
            if (message.method === 'initialize') {
                setTimeout(() => respondToRequests(message, socket), 150);
            } else {
                respondToRequests(message, socket);
            }
        });
        await initializeClient();
        writeInstanceFile('slow-replay', fake.socketPath, 'token', '2026-01-01T00:00:00Z');

        send({ jsonrpc: '2.0', id: 2, method: 'ping' });
        send({ jsonrpc: '2.0', id: 3, method: 'ping' });
        await waitFor(() => outputLines.some((line) => line.id === 3));

        const summary = fake.received.map((message) => {
            const isClientRequest = message.id === 2 || message.id === 3;
            return isClientRequest ? `${message.method}:${message.id}` : message.method;
        });
        expect(summary).to.eql(['initialize', 'notifications/initialized', 'ping:2', 'ping:3']);
        expect(outputLines.find((line) => line.id === 2).result).to.eql({});
    });

    it('forwards a client response to a server-initiated request', async () => {
        const fake = await startFakeServer('server-request', (message, socket) => {
            if (message.method === 'ping' && message.id === 2) {
                socket.write(JSON.stringify({ jsonrpc: '2.0', id: 'server-1', method: 'roots/list' }) + '\n');
            }
            respondToRequests(message, socket);
        });
        await initializeClient();
        writeInstanceFile('server-request', fake.socketPath, 'token', '2026-01-01T00:00:00Z');
        await request({ jsonrpc: '2.0', id: 2, method: 'ping' });
        await waitFor(() => outputLines.some((line) => line.id === 'server-1'));

        send({ jsonrpc: '2.0', id: 'server-1', result: { roots: [] } });

        await waitFor(() => fake.received.some((message) => message.id === 'server-1'));
        expect(fake.received.find((message) => message.id === 'server-1').result).to.eql({ roots: [] });
    });

    it('does not report a cancelled request as lost when the connection drops', async () => {
        const fake = await startFakeServer('cancel', (message, socket) => {
            if (message.method !== 'tools/call') {
                respondToRequests(message, socket);
            }
        });
        await initializeClient();
        writeInstanceFile('cancel', fake.socketPath, 'token', '2026-01-01T00:00:00Z');
        await request({ jsonrpc: '2.0', id: 2, method: 'ping' });
        send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'slow' } });
        send({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'slow' } });
        await waitFor(() => fake.received.filter((message) => message.method === 'tools/call').length === 2);
        send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 5 } });
        await waitFor(() => fake.received.some((message) => message.method === 'notifications/cancelled'));

        for (const socket of fakeSockets) {
            socket.destroy();
        }
        await waitFor(() => outputLines.some((line) => line.id === 6));

        expect(outputLines.some((line) => line.id === 5)).to.be.false;
        expect(outputLines.find((line) => line.id === 6).error.code).to.equal(-32000);
    });

    describe('window selection', () => {
        function callTool(id: number, name: string, args: object = {}): Promise<any> {
            return request({ jsonrpc: '2.0', id: id, method: 'tools/call', params: { name: name, arguments: args } });
        }

        function parseToolText(response: any): any {
            return JSON.parse(response.result.content[0].text);
        }

        async function listToolNames(id: number): Promise<string[]> {
            const response = await request({ jsonrpc: '2.0', id: id, method: 'tools/list' });
            return response.result.tools.map((tool) => tool.name);
        }

        const unselectedTools = ['get_status', 'list_windows', 'select_window'];

        it('auto-connects when exactly one window contains the working directory', async () => {
            await startServer();
            writeInstanceFile('elsewhere', path.join(debugMcpHome, 'unused.sock'), 'token', '2099-01-01T00:00:00Z', { workspaceFolders: ['/projects/other'] });

            await initializeClient();

            expect(await listToolNames(2)).to.eql(['echo', 'slow', 'list_windows', 'select_window']);
        });

        it('stays unselected with no matching window and explains it through get_status', async () => {
            await startServer({ folders: ['/projects/other'], name: 'other' });
            await initializeClient();

            expect(await listToolNames(2)).to.eql(unselectedTools);
            const status = parseToolText(await callTool(3, 'get_status'));
            expect(status.connected).to.be.false;
            expect(status.message).to.contain('No open VS Code window has a workspace folder containing the working directory /projects/app');
            expect(status.windows.map((window) => window.name)).to.eql(['other']);
            const echoResponse = await callTool(4, 'echo', { text: 'x' });
            expect(echoResponse.result.isError).to.be.true;
            expect(echoResponse.result.content[0].text).to.contain('Call list_windows, then select_window.');
        });

        it('stays unselected when several windows contain the working directory', async () => {
            await startServer({ name: 'first' });
            const second = await startFakeServer('second', respondToRequests);
            writeInstanceFile('second', second.socketPath, 'token', '2099-01-01T00:00:00Z', { name: 'second' });
            await initializeClient();

            expect(await listToolNames(2)).to.eql(unselectedTools);
            const status = parseToolText(await callTool(3, 'get_status'));
            expect(status.message).to.contain('Several open VS Code windows contain the working directory');
            expect(status.windows.filter((window) => window.matchesWorkingDirectory)).to.have.length(2);
            expect(second.received).to.be.empty;
        });

        it('reports that no window is open when nothing is running', async () => {
            await initializeClient();
            const status = parseToolText(await callTool(2, 'get_status'));
            expect(status.message).to.contain('No VS Code window with the BrightScript extension is running');
            expect(status.windows).to.eql([]);
        });

        it('lists windows with their state and selects one by windowId, then announces the change', async () => {
            await startServer({ folders: ['/projects/other'], name: 'other' });
            await initializeClient();

            const listing = parseToolText(await callTool(2, 'list_windows'));
            expect(listing.connected).to.be.false;
            expect(listing.workingDirectory).to.equal('/projects/app');
            expect(listing.windows[0]).to.include({ index: 1, windowId: '/projects/other', name: 'other', debugSessionActive: false, matchesWorkingDirectory: false, selected: false });
            expect(listing.windows[0].workspaceFolders).to.eql(['/projects/other']);
            expect(listing.windows[0]).to.have.property('focusedAt');

            const selection = parseToolText(await callTool(3, 'select_window', { windowId: '/projects/other' }));
            expect(selection.selected).to.include({ windowId: '/projects/other', selected: true });
            await waitFor(() => countListChanged() === 1);
            expect(await listToolNames(4)).to.eql(['echo', 'slow', 'list_windows', 'select_window']);
        });

        it('selects by index from the last listing', async () => {
            await startServer({ folders: ['/projects/other'] });
            await initializeClient();
            await callTool(2, 'list_windows');

            const selection = parseToolText(await callTool(3, 'select_window', { index: 1 }));

            expect(selection.selected.windowId).to.equal('/projects/other');
            expect(await listToolNames(4)).to.include('echo');
        });

        it('rejects an index that is not in the last listing', async () => {
            await startServer({ folders: ['/projects/other'] });
            await initializeClient();
            const response = await callTool(2, 'select_window', { index: 5 });
            expect(response.result.isError).to.be.true;
            expect(response.result.content[0].text).to.contain('No window at index 5');
        });

        it('selects by a folder inside exactly one window', async () => {
            await startServer({ folders: ['/projects/other'] });
            await initializeClient();

            const selection = parseToolText(await callTool(2, 'select_window', { folder: '/projects/other/source' }));

            expect(selection.selected.windowId).to.equal('/projects/other');
        });

        it('refuses a folder that matches several windows and one that matches none', async () => {
            await startServer({ name: 'first' });
            const second = await startFakeServer('second', respondToRequests);
            writeInstanceFile('second', second.socketPath, 'token', '2099-01-01T00:00:00Z', { name: 'second' });
            await initializeClient();

            const several = await callTool(2, 'select_window', { folder: '/projects/app' });
            const none = await callTool(3, 'select_window', { folder: '/nowhere' });
            const missingArguments = await callTool(4, 'select_window');

            expect(several.result.isError).to.be.true;
            expect(several.result.content[0].text).to.contain('Several open windows');
            expect(none.result.isError).to.be.true;
            expect(missingArguments.result.content[0].text).to.contain('Provide instanceKey, windowId, index, or folder');
            expect(await listToolNames(5)).to.eql(unselectedTools);
        });

        it('answers the bridge tools locally and never forwards them when connected', async () => {
            const fake = await startFakeServer('only', (message, socket) => {
                if (message.method === 'tools/list') {
                    socket.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: [{ name: 'echo', description: 'e', inputSchema: { type: 'object' } }] } }) + '\n');
                } else {
                    respondToRequests(message, socket);
                }
            });
            writeInstanceFile('only', fake.socketPath, 'token', '2026-01-01T00:00:00Z', { name: 'Only' });
            await initializeClient();

            expect(await listToolNames(2)).to.eql(['echo', 'list_windows', 'select_window']);
            const listing = parseToolText(await callTool(3, 'list_windows'));
            expect(listing).to.include({ connected: true, selectedWindowId: 'only' });
            expect(listing.windows[0]).to.include({ selected: true, matchesWorkingDirectory: true });
            await callTool(4, 'select_window', { windowId: 'only' });

            expect(fake.received.filter((message) => message.method === 'tools/call')).to.be.empty;
        });

        it('reconnects a reloaded window by id and never to another live window', async () => {
            const firstServer = await startServer({ name: 'app' });
            await initializeClient();
            const other = await startFakeServer('other', respondToRequests);
            writeInstanceFile('other', other.socketPath, 'token', '2099-01-01T00:00:00Z', { name: 'other' });
            const listChangedBefore = countListChanged();

            firstServer.dispose();
            await waitFor(() => countListChanged() === listChangedBefore + 1);
            const duringReload = await callTool(2, 'echo', { text: 'x' });
            expect(duringReload.result.isError).to.be.true;

            const reloadedServer = await startServer({ name: 'app' });
            expect(reloadedServer.token).to.not.equal(firstServer.token);
            const echoResponse = await callTool(3, 'echo', { text: 'again' });

            expect(parseToolText(echoResponse)).to.eql({ echoed: 'again' });
            expect(other.received).to.be.empty;
        });

        it('tells the agent the selected window is not open and offers only the bridge tools', async () => {
            const server = await startServer({ name: 'app' });
            await initializeClient();
            server.dispose();
            await waitFor(() => countListChanged() === 1);

            expect(await listToolNames(2)).to.eql(unselectedTools);
            const response = await callTool(3, 'echo', { text: 'x' });
            expect(response.result.isError).to.be.true;
            expect(response.result.content[0].text).to.equal('The selected window \'app\' (folders: /projects/app) is not open. Reopen it or call select_window to choose another.');
        });

        it('does not auto-pick once the auto-selected window is gone and two matching windows exist', async () => {
            const server = await startServer({ name: 'app' });
            await initializeClient();
            server.dispose();
            await waitFor(() => countListChanged() === 1);
            const first = await startFakeServer('first', respondToRequests);
            const second = await startFakeServer('second', respondToRequests);
            writeInstanceFile('first', first.socketPath, 'token', '2099-01-01T00:00:00Z');
            writeInstanceFile('second', second.socketPath, 'token', '2099-01-02T00:00:00Z');

            const response = await callTool(2, 'echo', { text: 'x' });

            expect(response.result.isError).to.be.true;
            expect(response.result.content[0].text).to.contain('The selected window \'app\'');
            expect(first.received).to.be.empty;
            expect(second.received).to.be.empty;
            expect(await listToolNames(3)).to.eql(unselectedTools);
        });

        it('switches windows with select_window, replays initialize on the new window, announces it, and fails requests in flight on the old one with a switch message', async () => {
            const first = await startFakeServer('first', (message, socket) => {
                if (message.method !== 'tools/call') {
                    respondToRequests(message, socket);
                }
            });
            writeInstanceFile('first', first.socketPath, 'token', '2026-01-01T00:00:00Z', { workspaceFolders: ['/projects/other'] });
            const second = await startFakeServer('second', respondToRequests);
            writeInstanceFile('second', second.socketPath, 'token', '2026-01-02T00:00:00Z', { workspaceFolders: ['/projects/another'] });
            await initializeClient();
            await callTool(2, 'select_window', { windowId: 'first' });
            await waitFor(() => countListChanged() === 1);
            send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'slow', arguments: {} } });
            await waitFor(() => first.received.some((message) => message.id === 3));

            await callTool(4, 'select_window', { windowId: 'second' });

            expect(outputLines.find((line) => line.id === 3).error.message).to.contain('switched to another VS Code window');
            expect(second.received.map((message) => message.method).slice(0, 2)).to.eql(['initialize', 'notifications/initialized']);
            expect(countListChanged()).to.equal(2);
            expect(parseToolText(await callTool(5, 'list_windows')).selectedWindowId).to.equal('second');
        });

        it('selects before the client has initialized, without announcing a tool change', async () => {
            await startServer({ folders: ['/projects/other'] });

            const response = await callTool(1, 'select_window', { windowId: '/projects/other' });

            expect(parseToolText(response).selected.windowId).to.equal('/projects/other');
            expect(parseToolText(await callTool(2, 'list_windows')).connected).to.be.true;
            expect(countListChanged()).to.equal(0);
        });

        it('passes an error response to tools/list through unmodified', async () => {
            const fake = await startFakeServer('erroring', (message, socket) => {
                if (message.method === 'tools/list') {
                    socket.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: 'boom' } }) + '\n');
                } else {
                    respondToRequests(message, socket);
                }
            });
            writeInstanceFile('erroring', fake.socketPath, 'token', '2026-01-01T00:00:00Z');
            await initializeClient();

            const response = await request({ jsonrpc: '2.0', id: 2, method: 'tools/list' });

            expect(response).to.eql({ jsonrpc: '2.0', id: 2, error: { code: -32603, message: 'boom' } });
        });

        it('explains that automatic connection needs exactly one matching window when none is open', async () => {
            await initializeClient();
            const status = parseToolText(await callTool(2, 'get_status'));
            expect(status.message).to.contain('only when exactly one window has this working directory open');
        });

        describe('windows that share a windowId', () => {
            async function startDuplicates(): Promise<{ first: any; second: any }> {
                const first = await startFakeServer('dup-first', respondToRequests);
                const second = await startFakeServer('dup-second', respondToRequests);
                writeInstanceFile('dup-first', first.socketPath, 'token', '2026-01-01T00:00:00Z', { windowId: 'dup', name: 'Stable', appName: 'Visual Studio Code', workspaceFolders: ['/projects/other'] });
                writeInstanceFile('dup-second', second.socketPath, 'token', '2026-01-02T00:00:00Z', { windowId: 'dup', name: 'Insiders', appName: 'Visual Studio Code - Insiders', workspaceFolders: ['/projects/other'] });
                return { first: first, second: second };
            }

            it('lists them with distinct instance keys and refuses an ambiguous windowId', async () => {
                await startDuplicates();
                await initializeClient();

                const listing = parseToolText(await callTool(2, 'list_windows'));
                const ambiguous = await callTool(3, 'select_window', { windowId: 'dup' });

                expect(listing.windows).to.have.length(2);
                expect(new Set(listing.windows.map((window) => window.instanceKey)).size).to.equal(2);
                expect(listing.windows.map((window) => window.appName)).to.eql(['Visual Studio Code - Insiders', 'Visual Studio Code']);
                expect(ambiguous.result.isError).to.be.true;
                expect(ambiguous.result.content[0].text).to.contain('instanceKey');
            });

            it('selects the exact listed instance by index and marks only it selected', async () => {
                const { first, second } = await startDuplicates();
                await initializeClient();
                await callTool(2, 'list_windows');

                //index 2 is the older window
                await callTool(3, 'select_window', { index: 2 });
                const listing = parseToolText(await callTool(4, 'list_windows'));

                expect(listing.windows.map((window) => window.selected)).to.eql([false, true]);
                expect(first.received.some((message) => message.method === 'initialize')).to.be.true;
                expect(second.received).to.be.empty;
            });

            it('selects by instanceKey', async () => {
                const { second } = await startDuplicates();
                await initializeClient();
                const listing = parseToolText(await callTool(2, 'list_windows'));

                await callTool(3, 'select_window', { instanceKey: listing.windows[0].instanceKey });

                expect(second.received.some((message) => message.method === 'initialize')).to.be.true;
            });

            it('does not reconnect to either window after a drop while several share the selected id', async () => {
                const original = await startFakeServer('single', respondToRequests);
                writeInstanceFile('single', original.socketPath, 'token', '2026-01-01T00:00:00Z', { windowId: 'dup', workspaceFolders: ['/projects/app'] });
                await initializeClient();
                const listChangedBefore = countListChanged();
                const originalSockets = [...fakeSockets];
                const { first, second } = await startDuplicates();

                fs.rmSync(path.join(getInstancesDirectory(debugMcpHome), 'single.json'));
                originalSockets.forEach((socket) => socket.destroy());
                await waitFor(() => countListChanged() === listChangedBefore + 1);
                const response = await callTool(2, 'echo', { text: 'x' });

                expect(response.result.isError).to.be.true;
                expect(response.result.content[0].text).to.contain('Several open VS Code windows match the selected window');
                expect(first.received).to.be.empty;
                expect(second.received).to.be.empty;
            });
        });

        it('adopts a changed windowId of the connected window when listing', async () => {
            const fake = await startFakeServer('moving', respondToRequests);
            writeInstanceFile('moving', fake.socketPath, 'token', '2026-01-01T00:00:00Z', { windowId: 'before' });
            await initializeClient();

            writeInstanceFile('moving', fake.socketPath, 'token', '2026-01-01T00:00:00Z', { windowId: 'after' });
            const listing = parseToolText(await callTool(2, 'list_windows'));

            expect(listing.selectedWindowId).to.equal('after');
            expect(listing.windows[0]).to.include({ windowId: 'after', selected: true });
        });

        it('does not rebuild the remembered listing for requests other than list_windows and get_status', async () => {
            await startServer({ folders: ['/projects/other'], name: 'other' });
            await initializeClient();
            await callTool(2, 'list_windows');
            writeInstanceFile('newer', path.join(debugMcpHome, 'unused.sock'), 'token', '2099-01-01T00:00:00Z', { workspaceFolders: ['/projects/elsewhere'], windowId: 'newer' });

            await request({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
            const selection = parseToolText(await callTool(4, 'select_window', { index: 1 }));

            //the newer window would be index 1 if the listing had been rebuilt
            expect(selection.selected.windowId).to.equal('/projects/other');
        });
    });

    it('stops and notifies when the input stream ends', async () => {
        let inputEnded = false;
        bridge.stop();
        bridge = new DebugMcpBridge({
            input: input,
            output: output,
            debugMcpHome: debugMcpHome,
            workingDirectory: '/projects/app',
            onInputEnd: () => {
                inputEnded = true;
            },
            log: () => { }
        });
        bridge.start();

        input.end();

        await waitFor(() => inputEnded);
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

function pause(durationMs: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, durationMs);
    });
}

describe('LineBuffer', () => {
    it('reassembles a multibyte character split across chunks', () => {
        const lineBuffer = new LineBuffer();
        const bytes = Buffer.from('{"text":"caf\u00e9 \u4f60\u597d"}\n', 'utf8');
        const splitIndex = bytes.indexOf(0xc3) + 1;
        expect(lineBuffer.push(bytes.subarray(0, splitIndex))).to.eql([]);
        expect(lineBuffer.push(bytes.subarray(splitIndex, splitIndex + 7))).to.eql([]);
        expect(lineBuffer.push(bytes.subarray(splitIndex + 7))).to.eql(['{"text":"caf\u00e9 \u4f60\u597d"}']);
    });

    it('splits several lines and skips blank ones', () => {
        expect(new LineBuffer().push('a\n\n b \r\nc')).to.eql(['a', 'b']);
    });
});
