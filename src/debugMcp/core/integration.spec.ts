import { expect } from 'chai';
import { DebugStateStore } from './debugStateStore';
import { DEBUG_MCP_API_VERSION, DebugMcpRegistry } from './integration';
import type { DebugIntegration, DebugSessionInfo } from './integration';
import { SessionDirectory } from './sessionDirectory';
import { createDebugMcpTools } from './tools';

function makeSession(id: string, type: string, extra: Partial<DebugSessionInfo> = {}): any {
    return { id: id, name: id, type: type, customRequest: () => Promise.resolve({}), ...extra };
}

function makeDirectory(registry: DebugMcpRegistry, sessions: any[], active?: any) {
    return new SessionDirectory(registry, {
        getSessions: () => sessions,
        getActiveSession: () => active,
        onDidStartSession: (() => ({ dispose: () => { } })) as any,
        onDidTerminateSession: (() => ({ dispose: () => { } })) as any
    });
}

/** `main` sessions own a group; `side` sessions join the group of their parent session as the "secondary" runtime. */
function createFakeIntegration(overrides: Partial<DebugIntegration> = {}): DebugIntegration {
    return {
        apiVersion: DEBUG_MCP_API_VERSION,
        id: 'fake',
        debugTypes: ['main', 'side'],
        runtimes: [{ id: 'primary', description: 'the primary runtime' }, { id: 'secondary', description: 'the secondary runtime' }],
        classifySession: (session) => {
            if (session.type === 'main') {
                return { groupId: session.id, runtime: 'primary' };
            }
            return session.parentSession ? { groupId: session.parentSession.id, runtime: 'secondary' } : undefined;
        },
        ...overrides
    };
}

describe('DebugMcpRegistry', () => {
    let registry: DebugMcpRegistry;

    beforeEach(() => {
        registry = new DebugMcpRegistry();
    });

    describe('without the default integration', () => {
        it('ignores sessions no integration claims', () => {
            registry.registerDebugIntegration(createFakeIntegration());
            expect(registry.classify(makeSession('py1', 'python'))).to.be.undefined;
            expect(makeDirectory(registry, [makeSession('py1', 'python')]).groups).to.be.empty;
        });

        it('lets a session of an unclaimed type coexist with a group without affecting targeting', () => {
            registry.registerDebugIntegration(createFakeIntegration());
            const main = makeSession('m1', 'main');
            const python = makeSession('py1', 'python');
            const directory = makeDirectory(registry, [main, python], python);
            expect(directory.groups.map((group) => group.id)).to.eql(['m1']);
            expect(directory.activeGroup.id).to.equal('m1');
            expect(directory.sessions).to.have.length(2);
            expect(registry.getDeclaredRuntimes().map((runtime) => runtime.id)).to.eql(['primary', 'secondary']);
        });
    });

    describe('default integration', () => {
        beforeEach(() => {
            registry = new DebugMcpRegistry({ enableDefaultIntegration: true });
        });

        it('puts a session of any debug type in its own group with the debug type as its runtime', () => {
            expect(registry.classify(makeSession('py1', 'python'))).to.include({ groupId: 'py1', runtime: 'python' });
            expect(registry.classify(makeSession('node1', 'pwa-node'))).to.include({ groupId: 'node1', runtime: 'pwa-node' });
        });

        it('groups the sessions of one launch under the root of the parent chain', () => {
            const python = makeSession('py1', 'python');
            const child = makeSession('child', 'python', { parentSession: python });
            const grandchild = makeSession('grandchild', 'subprocess', { parentSession: child });
            const go = makeSession('go1', 'go');
            const directory = makeDirectory(registry, [python, child, grandchild, go], grandchild);
            expect(directory.groups.map((group) => [group.id, group.members.map((member) => member.session.id)])).to.eql([['py1', ['py1', 'child', 'grandchild']], ['go1', ['go1']]]);
            expect(directory.groups[0].primaryRuntime).to.equal('python');
            expect(directory.activeGroup.id).to.equal('py1');
        });

        it('falls back to the sole group when nothing is active, and to none when several run', () => {
            const python = makeSession('py1', 'python');
            expect(makeDirectory(registry, [python]).activeGroup.id).to.equal('py1');
            expect(makeDirectory(registry, [python, makeSession('go1', 'go')]).activeGroup).to.be.undefined;
        });

        it('serves the core tools for a non-Roku debug session end to end', async () => {
            const stateStore = new DebugStateStore();
            const python = makeSession('py1', 'python', { customRequest: (command: string) => Promise.resolve(command === 'stackTrace' ? { stackFrames: [{ id: 1, name: 'main', line: 5, column: 1, source: { path: '/p/app.py' } }] } : {}) });
            stateStore.trackSession('py1', 'python', { groupId: 'py1' });
            const directory = makeDirectory(registry, [python], python);
            const tools = createDebugMcpTools({ sessions: directory, registry: registry, stateStore: stateStore, host: { getFocusedStackItem: () => undefined } as any, extensionVersion: '1', getWorkspaceFolders: () => [] });
            const call = (name: string, args = {}) => tools.find((tool) => tool.name === name).handler(args) as Promise<any>;
            stateStore.handleMessage('py1', { type: 'event', event: 'stopped', body: { reason: 'breakpoint', threadId: 1 } });
            expect(await call('wait_for_stop')).to.include({ stopped: true, runtime: 'python', sessionId: 'py1' });
            const state = await call('get_debug_state');
            expect(Object.keys(state.runtimes)).to.eql(['python']);
            expect(state.runtimes.python).to.include({ status: 'stopped', topFrame: '/p/app.py:5:main' });
            expect((await call('list_debug_sessions')).groups[0].sessions[0]).to.include({ id: 'py1', runtime: 'python' });
            let message: string;
            try {
                await call('get_stack_trace', { runtime: 'brs' });
            } catch (error) {
                message = (error as Error).message;
            }
            expect(message).to.contain('no brs runtime; it has: python');
            stateStore.dispose();
        });

        it('verifies breakpoints in any file on one verified answer, since no runtime owns files', () => {
            const store = new DebugStateStore({ ownsFile: (filePath) => registry.ownsFile(filePath) });
            store.trackSession('py1', 'python', { groupId: 'py1' });
            store.handleRequest('py1', { type: 'request', seq: 1, command: 'setBreakpoints', arguments: { source: { path: '/p/app.py' }, breakpoints: [{ line: 3 }] } });
            store.handleMessage('py1', { type: 'response', 'request_seq': 1, command: 'setBreakpoints', success: true, body: { breakpoints: [{ verified: true, line: 3 }] } });
            expect(store.breakpoints.isSettled('/p/app.py', 3, 0)).to.be.true;
            store.dispose();
        });
    });

    describe('registered integrations', () => {
        it('groups sessions as the integration classifies them', () => {
            registry.registerDebugIntegration(createFakeIntegration());
            const main = makeSession('m1', 'main');
            const side = makeSession('s1', 'side', { parentSession: main });
            const python = makeSession('py1', 'python');
            const groups = makeDirectory(registry, [main, side, python]).groups;
            expect(groups.map((group) => group.id)).to.eql(['m1']);
            expect(groups[0].members.map((member) => [member.session.id, member.runtime])).to.eql([['m1', 'primary'], ['s1', 'secondary']]);
            expect(groups[0].runtimes.map((runtime) => runtime.id)).to.eql(['primary', 'secondary']);
        });

        it('treats a session of a claimed type that the integration leaves out as part of no group', () => {
            registry.registerDebugIntegration(createFakeIntegration());
            expect(registry.classify(makeSession('lonely', 'side'))).to.be.undefined;
        });

        it('drops a group whose primary session is gone', () => {
            registry.registerDebugIntegration(createFakeIntegration());
            const main = makeSession('m1', 'main');
            expect(makeDirectory(registry, [makeSession('s1', 'side', { parentSession: main })]).groups).to.be.empty;
        });

        it('asks each integration only about its debug types, and the first classification wins', () => {
            const asked: string[] = [];
            registry.registerDebugIntegration(createFakeIntegration({ id: 'first', classifySession: (session) => {
                asked.push(`first:${session.type}`);
                return undefined;
            } }));
            registry.registerDebugIntegration(createFakeIntegration({ id: 'second', debugTypes: ['side'], classifySession: (session) => ({ groupId: 'x', runtime: session.type }) }));
            expect(registry.classify(makeSession('s1', 'side'))).to.include({ groupId: 'x' });
            expect(registry.classify(makeSession('m1', 'main'))).to.be.undefined;
            expect(asked).to.eql(['first:side', 'first:main']);
        });

        it('takes file ownership from the first integration that claims the file', () => {
            registry.registerDebugIntegration(createFakeIntegration({ ownsFile: (filePath) => (filePath.endsWith('.fake') ? 'primary' : undefined) }));
            expect(registry.ownsFile('/p/a.fake')).to.equal('primary');
            expect(registry.ownsFile('/p/a.other')).to.be.undefined;
        });

        it('lists the declared runtimes once and rejects duplicate or empty registrations', () => {
            registry.registerDebugIntegration(createFakeIntegration());
            registry.registerDebugIntegration(createFakeIntegration({ id: 'other', runtimes: [{ id: 'primary', description: 'again' }, { id: 'third', description: 'the third' }] }));
            expect(registry.getDeclaredRuntimes().map((runtime) => runtime.id)).to.eql(['primary', 'secondary', 'third']);
            expect(() => registry.registerDebugIntegration(createFakeIntegration())).to.throw('already registered');
            expect(() => registry.registerDebugIntegration(createFakeIntegration({ id: 'empty', runtimes: [] }))).to.throw('at least one runtime');
        });

        it('can be unregistered', () => {
            const registration = registry.registerDebugIntegration(createFakeIntegration());
            registration.dispose();
            expect(registry.classify(makeSession('m1', 'main'))).to.be.undefined;
        });

        it('rejects integrations and providers of an unsupported API version', () => {
            expect(() => registry.registerDebugIntegration({ ...createFakeIntegration(), apiVersion: 2 as any })).to.throw('API version 2');
            expect(() => registry.registerToolProvider({ apiVersion: 0 as any, id: 'old', tools: () => [] })).to.throw('API version 0');
        });

        it('merges launch overrides and listed configuration fields from the integrations', () => {
            registry.registerDebugIntegration(createFakeIntegration({ launchOverrides: { host: 'string' }, launchConfigFields: ['host'] }));
            registry.registerDebugIntegration(createFakeIntegration({ id: 'other', debugTypes: ['x'], launchOverrides: { stopOnEntry: 'boolean' }, launchConfigFields: ['host', 'rootDir'] }));
            expect(registry.getLaunchOverrides()).to.eql({ host: 'string', stopOnEntry: 'boolean' });
            expect(registry.getLaunchConfigFields()).to.eql(['host', 'rootDir']);
        });
    });

    describe('failing integrations', () => {
        it('logs a throwing classifier and treats the session as unclaimed, letting later integrations answer', () => {
            const logged: string[] = [];
            registry = new DebugMcpRegistry({ log: (message) => logged.push(message) });
            registry.registerDebugIntegration(createFakeIntegration({
                id: 'broken',
                classifySession: () => {
                    throw new Error('classifier exploded');
                }
            }));
            registry.registerDebugIntegration(createFakeIntegration({ id: 'working', classifySession: (session) => ({ groupId: session.id, runtime: 'primary' }) }));
            expect(registry.classify(makeSession('m1', 'main'))).to.include({ groupId: 'm1' });
            expect(logged[0]).to.contain('\'broken\'').and.to.contain('classifier exploded');
        });

        it('logs a throwing ownsFile and gives no answer', () => {
            const logged: string[] = [];
            registry = new DebugMcpRegistry({ log: (message) => logged.push(message) });
            registry.registerDebugIntegration(createFakeIntegration({
                id: 'broken',
                ownsFile: () => {
                    throw new Error('ownsFile exploded');
                }
            }));
            registry.registerDebugIntegration(createFakeIntegration({ id: 'working', ownsFile: () => 'primary' }));
            expect(registry.ownsFile('/p/a')).to.equal('primary');
            expect(logged[0]).to.contain('ownsFile exploded');
        });

        it('reports a stop when the hook throws, rejects or never answers', async () => {
            const logged: string[] = [];
            registry = new DebugMcpRegistry({ log: (message) => logged.push(message), stopHookTimeoutMs: 30 });
            const context: any = { session: makeSession('m1', 'main'), runtime: 'primary', groupId: 'm1', stop: {}, fetchStack: () => Promise.resolve({ frames: [] }) };
            const judge = (shouldReportStop: DebugIntegration['shouldReportStop']) => registry.judgeStop(createFakeIntegration({ shouldReportStop: shouldReportStop }), context);
            expect(judge(() => {
                throw new Error('sync failure');
            })).to.equal(true);
            expect(await judge(() => Promise.reject(new Error('async failure')))).to.equal(true);
            const startedAt = Date.now();
            expect(await judge(() => new Promise(() => { }))).to.equal(true);
            expect(Date.now() - startedAt).to.be.below(1000);
            expect(logged.join('\n')).to.contain('sync failure').and.to.contain('async failure').and.to.contain('did not answer in time');
        });

        it('passes a hook answer through, including "entry" and false', async () => {
            expect(registry.judgeStop(createFakeIntegration({ shouldReportStop: () => false }), {} as any)).to.equal(false);
            expect(await registry.judgeStop(createFakeIntegration({ shouldReportStop: () => Promise.resolve('entry' as const) }), {} as any)).to.equal('entry');
        });
    });

    describe('tool providers', () => {
        it('add their tools after the core tools, built with the shared tool context, and appear in the status summary', async () => {
            const received: unknown[] = [];
            registry.registerToolProvider({
                apiVersion: DEBUG_MCP_API_VERSION,
                id: 'extra',
                tools: (context) => {
                    received.push(context);
                    return [
                        { name: 'extra_tool', description: 'Does extra things.', inputSchema: { type: 'object' as const }, handler: () => ({ extra: true }) },
                        { name: 'extra_window_tool', description: 'Needs no session.', needs: 'window' as const, inputSchema: { type: 'object' as const }, handler: () => ({}) }
                    ];
                }
            });
            const context = { sessions: { sessions: [], groups: [] } as any, registry: registry, stateStore: new DebugStateStore(), host: {} as any, extensionVersion: '1', getWorkspaceFolders: () => [] };
            const tools = createDebugMcpTools(context);
            expect(tools.map((tool) => tool.name).slice(-2)).to.eql(['extra_tool', 'extra_window_tool']);
            expect(received).to.eql([context]);
            const status: any = await tools.find((tool) => tool.name === 'get_status').handler({});
            expect(status.tools.needsActiveSession).to.include('extra_tool');
            expect(status.tools.needsOnlyVsCodeWindow).to.include('extra_window_tool');
        });

        it('keeps the core tool and logs an error when a provider reuses a tool name', () => {
            const logged: string[] = [];
            registry = new DebugMcpRegistry({ log: (message) => logged.push(message) });
            registry.registerToolProvider({
                apiVersion: DEBUG_MCP_API_VERSION,
                id: 'clash',
                tools: () => [
                    { name: 'get_status', description: 'Impostor.', inputSchema: { type: 'object' as const }, handler: () => ({ impostor: true }) },
                    { name: 'unique_tool', description: 'Fine.', inputSchema: { type: 'object' as const }, handler: () => ({}) },
                    { name: 'unique_tool', description: 'Twice.', inputSchema: { type: 'object' as const }, handler: () => ({}) }
                ]
            });
            const tools = createDebugMcpTools({ sessions: { sessions: [], groups: [] } as any, registry: registry, stateStore: new DebugStateStore(), host: {} as any, extensionVersion: '1', getWorkspaceFolders: () => [] });
            expect(tools.filter((tool) => tool.name === 'get_status')).to.have.length(1);
            expect(tools.find((tool) => tool.name === 'get_status').description).not.to.equal('Impostor.');
            expect(tools.filter((tool) => tool.name === 'unique_tool')).to.have.length(1);
            expect(logged).to.have.length(2);
            expect(logged[0]).to.contain('get_status');
        });

        it('rejects a duplicate provider id', () => {
            registry.registerToolProvider({ apiVersion: DEBUG_MCP_API_VERSION, id: 'extra', tools: () => [] });
            expect(() => registry.registerToolProvider({ apiVersion: DEBUG_MCP_API_VERSION, id: 'extra', tools: () => [] })).to.throw('already registered');
        });
    });
});
