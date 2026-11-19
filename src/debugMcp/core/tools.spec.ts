import { expect } from 'chai';
import { DebugStateStore } from './debugStateStore';
import type { DebugMcpHost, HostBreakpoint } from './host';
import { DEBUG_MCP_API_VERSION, DebugMcpRegistry } from './integration';
import type { DebugIntegration } from './integration';
import { createDebugMcpTools } from './tools';

function makeSession(id: string, name: string, customRequest: (command: string, args?: any) => Promise<any> = () => Promise.resolve({})) {
    return { id: id, name: name, customRequest: customRequest } as any;
}

/** A group owned by `primary` (runtime "brs"), optionally with more members, as an integration with runtimes "brs" and "js" would produce. */
function makeGroup(primary: any, otherMembers: Array<{ session: any; runtime?: string }> = []) {
    return {
        id: primary.id,
        primary: primary,
        primaryRuntime: 'brs',
        runtimes: TEST_INTEGRATION.runtimes,
        members: [{ session: primary, runtime: 'brs' }, ...otherMembers]
    };
}

const TEST_INTEGRATION: DebugIntegration = {
    apiVersion: DEBUG_MCP_API_VERSION,
    id: 'test',
    launchOverrides: { host: 'string', stopOnEntry: 'boolean' },
    launchConfigFields: ['host', 'rootDir', 'stopOnEntry'],
    runtimes: [{ id: 'brs', description: 'the primary runtime' }, { id: 'js', description: 'the secondary runtime' }],
    classifySession: () => undefined,
    ownsFile: (filePath) => (/\.(brs|bs|xml)$/i.test(filePath) ? 'brs' : undefined)
};

function makeStateStore() {
    return new DebugStateStore({ ownsFile: TEST_INTEGRATION.ownsFile });
}

function makeHost(overrides: Partial<DebugMcpHost> = {}): DebugMcpHost {
    const breakpoints: HostBreakpoint[] = [];
    return {
        getWorkspaceFolders: () => [{ name: 'app', path: '/projects/app' }],
        getLaunchSources: () => [{ folderName: 'app', folderPath: '/projects/app', configurations: [{ name: 'Launch', type: 'brightscript', request: 'launch' }], compounds: [] }],
        startDebugging: () => Promise.resolve(true),
        stopDebugging: () => Promise.resolve(),
        confirm: () => Promise.resolve(true),
        getSetting: () => false,
        fileExists: (filePath) => filePath === '/projects/app/source/main.brs',
        findFilesBySuffix: () => Promise.resolve([]),
        listBreakpoints: () => [...breakpoints],
        addBreakpoints: (requests) => {
            const created = requests.map((request, index) => ({ id: `bp${breakpoints.length + index}`, enabled: true, ...request }));
            breakpoints.push(...created);
            return created;
        },
        removeBreakpoints: (ids) => {
            for (const id of ids) {
                breakpoints.splice(breakpoints.findIndex((breakpoint) => breakpoint.id === id), 1);
            }
        },
        getFocusedStackItem: () => undefined,
        executeCommand: () => Promise.resolve(),
        ...overrides
    };
}

describe('debugMcp tools', () => {
    function createRegistry() {
        const registry = new DebugMcpRegistry();
        registry.registerDebugIntegration(TEST_INTEGRATION);
        return registry;
    }

    function getTools(sessions: any, host = makeHost(), stateStore = makeStateStore()) {
        const tools = createDebugMcpTools({ sessions: sessions, registry: createRegistry(), stateStore: stateStore, host: host, extensionVersion: '1.0.0', getWorkspaceFolders: () => ['/projects/app'], getWindowName: () => 'app' });
        return (name: string) => tools.find((tool) => tool.name === name);
    }

    it('exposes the full fixed tool set with descriptions that avoid file extensions', () => {
        const tools = createDebugMcpTools({ sessions: { sessions: [], groups: [] } as any, registry: createRegistry(), stateStore: new DebugStateStore(), host: makeHost(), extensionVersion: '1', getWorkspaceFolders: () => [] });
        expect(tools.map((tool) => tool.name)).to.have.members([
            'get_status', 'list_debug_sessions', 'list_launch_configs', 'start_debugging', 'stop_debugging', 'restart_debugging',
            'list_breakpoints', 'set_breakpoints', 'remove_breakpoints', 'get_debug_state', 'wait_for_stop', 'get_stack_trace',
            'get_variables', 'evaluate', 'get_debug_output', 'continue', 'step_over', 'step_into', 'step_out', 'pause'
        ]);
        for (const tool of tools) {
            expect(JSON.stringify([tool.description, tool.inputSchema]), tool.name).not.to.match(/\.(js|ts)\b/);
            expect(tool.description, tool.name).not.to.contain(String.fromCharCode(0x2014));
        }
    });

    it('list_debug_sessions describes groups and the active one', async () => {
        const brightScript = makeSession('brs1', 'Roku');
        const group = makeGroup(brightScript, [{ session: makeSession('attach1', 'Attach') }, { session: makeSession('child1', 'Child'), runtime: 'js' }]);
        const result: any = await getTools({ sessions: [], groups: [group], activeGroup: group })('list_debug_sessions').handler({});
        expect(result).to.eql({
            groups: [{
                id: 'brs1',
                primary: { id: 'brs1', name: 'Roku' },
                sessions: [
                    { id: 'brs1', name: 'Roku', runtime: 'brs' },
                    { id: 'attach1', name: 'Attach', runtime: null },
                    { id: 'child1', name: 'Child', runtime: 'js' }
                ]
            }],
            activeGroupId: 'brs1'
        });
    });

    it('list_debug_sessions reports no active group when none is active', async () => {
        const group = makeGroup(makeSession('brs1', 'Roku'));
        const result: any = await getTools({ sessions: [], groups: [group, group], activeGroup: undefined })('list_debug_sessions').handler({});
        expect(result.groups[0].sessions).to.have.length(1);
        expect(result.activeGroupId).to.be.null;
    });

    it('get_status reports workspace folders, session activity, and that the tool list is fixed', async () => {
        const idle: any = await getTools({ sessions: [], groups: [] })('get_status').handler({});
        expect(idle).to.include({ extensionVersion: '1.0.0', debugSessionActive: false });
        expect(idle.workspaceFolders).to.eql(['/projects/app']);
        expect(idle.windowName).to.equal('app');
        expect(idle.tools.note).to.contain('list_windows');
        expect(idle.tools.note).to.contain('fixed');
        expect(idle.tools.needsOnlyVsCodeWindow).to.include.members(['list_launch_configs', 'start_debugging', 'set_breakpoints']);
        expect(idle.tools.needsPausedRuntime).to.include('get_variables');
        const active: any = await getTools({ sessions: [], groups: [makeGroup(makeSession('a', 'a'))] })('get_status').handler({});
        expect(active.debugSessionActive).to.be.true;
        const unrelated: any = await getTools({ sessions: [makeSession('a', 'a')], groups: [] })('get_status').handler({});
        expect(unrelated.debugSessionActive).to.be.false;
    });

    it('list_launch_configs lists configurations from the host', async () => {
        const result: any = await getTools({ sessions: [], groups: [] })('list_launch_configs').handler({});
        expect(result.launchConfigs[0]).to.include({ name: 'Launch', kind: 'configuration', folder: 'app' });
    });

    describe('start_debugging', () => {
        it('starts by name and returns the new group', async () => {
            const groups: any[] = [];
            const started: any[] = [];
            const host = makeHost({
                startDebugging: (folderPath, nameOrConfiguration) => {
                    started.push([folderPath, nameOrConfiguration]);
                    groups.push(makeGroup(makeSession('brs1', 'Roku')));
                    return Promise.resolve(true);
                }
            });
            const result: any = await getTools({ sessions: [], groups: groups }, host)('start_debugging').handler({ name: 'Launch' });
            expect(started).to.eql([['/projects/app', 'Launch']]);
            expect(result.started).to.be.true;
            expect(result.group.primary.id).to.equal('brs1');
        });

        it('starts the merged configuration object when overrides are given', async () => {
            const groups: any[] = [];
            const started: any[] = [];
            const host = makeHost({
                startDebugging: (_folderPath, nameOrConfiguration) => {
                    started.push(nameOrConfiguration);
                    groups.push(makeGroup(makeSession('brs1', 'Roku')));
                    return Promise.resolve(true);
                }
            });
            await getTools({ sessions: [], groups: groups }, host)('start_debugging').handler({ name: 'Launch', overrides: { host: '10.0.0.2' } });
            expect(started[0]).to.include({ name: 'Launch', host: '10.0.0.2', type: 'brightscript' });
        });

        it('waits for the runtimes named in waitForRuntimes to join the group, and notes the ones that did not', async () => {
            const groups: any[] = [];
            const host = makeHost({
                startDebugging: () => {
                    const primary = makeSession('brs1', 'Roku');
                    const group = makeGroup(primary);
                    groups.push(group);
                    setTimeout(() => group.members.push({ session: makeSession('child1', 'Child'), runtime: 'js' }), 50);
                    return Promise.resolve(true);
                }
            });
            const joined: any = await getTools({ sessions: [], groups: groups }, host)('start_debugging').handler({ name: 'Launch', waitForRuntimes: ['js'], timeoutMs: 2000 });
            expect(joined.note).to.be.undefined;
            expect(joined.group.sessions.map((entry) => entry.runtime)).to.eql(['brs', 'js']);
            groups.length = 0;
            const missing: any = await getTools({ sessions: [], groups: groups }, host)('start_debugging').handler({ name: 'Launch', waitForRuntimes: ['other'], timeoutMs: 1000 });
            expect(missing.note).to.contain('other runtime did not join');
        });

        it('does not start when the user denies the confirmation', async () => {
            let startCalled = false;
            const host = makeHost({
                getSetting: (name) => name === 'confirmLaunch',
                confirm: () => Promise.resolve(false),
                startDebugging: () => {
                    startCalled = true;
                    return Promise.resolve(true);
                }
            });
            let message: string;
            message = await rejectionMessage(getTools({ sessions: [], groups: [] }, host)('start_debugging').handler({ name: 'Launch' }));
            expect(message).to.contain('denied');
            expect(startCalled).to.be.false;
        });

        it('stops waiting when the request is cancelled', async () => {
            const controller = new AbortController();
            const host = makeHost({ startDebugging: () => new Promise<boolean>(() => { }) });
            const pending = getTools({ sessions: [], groups: [] }, host)('start_debugging').handler({ name: 'Launch', timeoutMs: 60000 }, { signal: controller.signal });
            setTimeout(() => controller.abort(), 20);
            expect(await rejectionMessage(pending)).to.equal('The request was cancelled.');
        });

        it('times out without the prompt hint when the wait was shorter than ten seconds', async () => {
            const host = makeHost({ startDebugging: () => new Promise<boolean>(() => { }) });
            const message = await rejectionMessage(getTools({ sessions: [], groups: [] }, host)('start_debugging').handler({ name: 'Launch', timeoutMs: 1000 }));
            expect(message).to.contain('Timed out');
            expect(message).not.to.contain('prompt');
        });

        it('fails when VS Code reports the launch did not start', async () => {
            const host = makeHost({ startDebugging: () => Promise.resolve(false) });
            let message: string;
            message = await rejectionMessage(getTools({ sessions: [], groups: [] }, host)('start_debugging').handler({ name: 'Launch' }));
            expect(message).to.contain('could not start');
        });
    });

    describe('breakpoints', () => {
        it('sets breakpoints in 1-based lines, replaces ones at the same location, and reports pending status', async () => {
            const getTool = getTools({ sessions: [], groups: [] });
            const first: any = await getTool('set_breakpoints').handler({ breakpoints: [{ file: 'source/main.brs', line: 42, condition: 'i > 3' }] });
            expect(first.breakpoints[0]).to.include({ file: '/projects/app/source/main.brs', line: 42, condition: 'i > 3', status: 'pending', enabled: true });
            await getTool('set_breakpoints').handler({ breakpoints: [{ file: 'source/main.brs', line: 42 }] });
            const listed: any = await getTool('list_breakpoints').handler({});
            expect(listed.breakpoints).to.have.length(1);
            expect(listed.breakpoints[0].condition).to.be.undefined;
        });

        it('rejects missing files and invalid lines', async () => {
            const getTool = getTools({ sessions: [], groups: [] });
            let message: string;
            message = await rejectionMessage(getTool('set_breakpoints').handler({ breakpoints: [{ file: 'source/missing.brs', line: 1 }] }));
            expect(message).to.contain('File not found');
            message = await rejectionMessage(getTool('set_breakpoints').handler({ breakpoints: [{ file: 'source/main.brs', line: 0 }] }));
            expect(message).to.contain('1-based');
        });

        it('removes by id, by file and line, or all', async () => {
            const getTool = getTools({ sessions: [], groups: [] });
            await getTool('set_breakpoints').handler({ breakpoints: [{ file: 'source/main.brs', line: 1 }, { file: 'source/main.brs', line: 2 }, { file: 'source/main.brs', line: 3 }] });
            const byLocation: any = await getTool('remove_breakpoints').handler({ breakpoints: [{ file: 'source/main.brs', line: 2 }] });
            expect(byLocation.removed).to.have.length(1);
            const listed: any = await getTool('list_breakpoints').handler({});
            const byId: any = await getTool('remove_breakpoints').handler({ ids: [listed.breakpoints[0].id] });
            expect(byId.removed[0].line).to.equal(1);
            const all: any = await getTool('remove_breakpoints').handler({ all: true });
            expect(all.removed).to.have.length(1);
            let message: string;
            message = await rejectionMessage(getTool('remove_breakpoints').handler({}));
            expect(message).to.contain('Pass ids');
        });

        it('waits until the adapter verifies, including a later changed event, and reports it per runtime', async () => {
            const stateStore = makeStateStore();
            stateStore.trackSession('brs1', 'brs', { groupId: 'brs1' });
            const getTool = getTools({ sessions: [makeSession('brs1', 'Roku')], groups: [] }, makeHost(), stateStore);
            const pending = getTool('set_breakpoints').handler({ breakpoints: [{ file: 'source/main.brs', line: 7 }] }) as Promise<any>;
            setTimeout(() => {
                stateStore.handleRequest('brs1', { type: 'request', seq: 1, command: 'setBreakpoints', arguments: { source: { path: '/projects/app/source/main.brs' }, breakpoints: [{ line: 7 }] } });
                stateStore.handleMessage('brs1', { type: 'response', 'request_seq': 1, command: 'setBreakpoints', success: true, body: { breakpoints: [{ id: 4, verified: false, line: 7 }] } });
            }, 30);
            setTimeout(() => {
                stateStore.handleMessage('brs1', { type: 'event', event: 'breakpoint', body: { reason: 'changed', breakpoint: { id: 4, verified: true, line: 8 } } });
            }, 150);
            const startedAt = Date.now();
            const result = await pending;
            expect(Date.now() - startedAt).to.be.at.least(140);
            expect(result.breakpoints[0].status).to.equal('verified');
            expect(result.breakpoints[0].verification.brs).to.include({ verified: true, actualLine: 8 });
        });

        it('does not treat an older verified answer as settled for a replaced breakpoint', () => {
            const stateStore = makeStateStore();
            stateStore.trackSession('brs1', 'brs', { groupId: 'brs1' });
            stateStore.handleRequest('brs1', { type: 'request', seq: 1, command: 'setBreakpoints', arguments: { source: { path: '/projects/app/source/main.brs' }, breakpoints: [{ line: 7 }] } });
            stateStore.handleMessage('brs1', { type: 'response', 'request_seq': 1, command: 'setBreakpoints', success: true, body: { breakpoints: [{ verified: true, line: 7 }] } });
            const baseline = stateStore.breakpoints.currentUpdate;
            expect(stateStore.breakpoints.isSettled('/projects/app/source/main.brs', 7, baseline)).to.be.false;
            expect(stateStore.breakpoints.isSettled('/projects/app/source/main.brs', 7, 0)).to.be.true;
        });

        it('settles a BrightScript file on the brs answer alone and ignores the JS debugger', () => {
            const stateStore = makeStateStore();
            stateStore.trackSession('brs1', 'brs', { groupId: 'brs1' });
            stateStore.trackSession('js1', 'js', { groupId: 'brs1' });
            const file = '/projects/app/source/main.brs';
            const request = { type: 'request', seq: 1, command: 'setBreakpoints', arguments: { source: { path: file }, breakpoints: [{ line: 7 }] } };
            stateStore.handleRequest('js1', request);
            stateStore.handleMessage('js1', { type: 'response', 'request_seq': 1, command: 'setBreakpoints', success: true, body: { breakpoints: [{ verified: false }] } });
            expect(stateStore.breakpoints.isSettled(file, 7, 0)).to.be.false;
            stateStore.handleRequest('brs1', request);
            stateStore.handleMessage('brs1', { type: 'response', 'request_seq': 1, command: 'setBreakpoints', success: true, body: { breakpoints: [{ verified: true, line: 7 }] } });
            expect(stateStore.breakpoints.isSettled(file, 7, 0)).to.be.true;
        });

        it('settles other files on any verified answer, or once every runtime answered', () => {
            const stateStore = makeStateStore();
            stateStore.trackSession('brs1', 'brs', { groupId: 'brs1' });
            stateStore.trackSession('js1', 'js', { groupId: 'brs1' });
            const file = '/projects/app/src/Main.tsx';
            const request = { type: 'request', seq: 1, command: 'setBreakpoints', arguments: { source: { path: file }, breakpoints: [{ line: 7 }] } };
            stateStore.handleRequest('js1', request);
            stateStore.handleMessage('js1', { type: 'response', 'request_seq': 1, command: 'setBreakpoints', success: true, body: { breakpoints: [{ verified: false }] } });
            expect(stateStore.breakpoints.isSettled(file, 7, 0)).to.be.false;
            stateStore.handleRequest('brs1', request);
            stateStore.handleMessage('brs1', { type: 'response', 'request_seq': 1, command: 'setBreakpoints', success: true, body: { breakpoints: [{ verified: false }] } });
            expect(stateStore.breakpoints.isSettled(file, 7, 0)).to.be.true;
        });

        it('dedupes identical entries within one call', async () => {
            const getTool = getTools({ sessions: [], groups: [] });
            const result: any = await getTool('set_breakpoints').handler({ breakpoints: [{ file: 'source/main.brs', line: 5 }, { file: '/projects/app/source/main.brs', line: 5 }] });
            expect(result.breakpoints).to.have.length(1);
        });
    });

    describe('runtime tools', () => {
        function makeDebugGroup(customRequest: (command: string, args?: any) => Promise<any>) {
            const stateStore = makeStateStore();
            const brightScript = makeSession('brs1', 'Roku', customRequest);
            const group = makeGroup(brightScript);
            stateStore.trackSession('brs1', 'brs', { groupId: 'brs1' });
            return { stateStore: stateStore, group: group, getTool: getTools({ sessions: [brightScript], groups: [group], activeGroup: group }, makeHost(), stateStore) };
        }

        it('explains when there is no session or the runtime is running', async () => {
            let message: string;
            message = await rejectionMessage(getTools({ sessions: [], groups: [] })('get_stack_trace').handler({}));
            expect(message).to.equal('No active debug session. Use list_launch_configs and start_debugging.');
            const { getTool } = makeDebugGroup(() => Promise.resolve({}));
            message = await rejectionMessage(getTool('get_variables').handler({}));
            expect(message).to.equal('The brs runtime is running, not stopped. Use wait_for_stop or pause.');
        });

        it('reads the stack and variables of the stopped thread, truncating long values', async () => {
            const requests: any[] = [];
            const { stateStore, getTool } = makeDebugGroup((command, args) => {
                requests.push([command, args]);
                switch (command) {
                    case 'stackTrace':
                        return Promise.resolve({ stackFrames: [{ id: 11, name: 'init', line: 42, column: 5, source: { path: '/projects/app/main.brs' } }] });
                    case 'scopes':
                        return Promise.resolve({ scopes: [{ name: 'Local', variablesReference: 100, expensive: false }, { name: 'Global', variablesReference: 200, expensive: true }] });
                    case 'variables':
                        return Promise.resolve({ variables: [{ name: 'i', value: '3', type: 'Integer', variablesReference: 0 }, { name: 'text', value: 'x'.repeat(600), type: 'String', variablesReference: 0 }] });
                    default:
                        return Promise.resolve({});
                }
            });
            stateStore.handleMessage('brs1', { type: 'event', event: 'stopped', body: { reason: 'breakpoint', threadId: 1 } });

            const stack: any = await getTool('get_stack_trace').handler({});
            expect(stack.frames[0]).to.eql({ id: 11, name: 'init', file: '/projects/app/main.brs', sourceName: undefined, line: 42, column: 5 });

            const variables: any = await getTool('get_variables').handler({});
            expect(variables.frameId).to.equal(11);
            expect(variables.scopes.map((scope) => scope.name)).to.eql(['Local', 'Global']);
            expect(variables.scopes[0].variables[0]).to.include({ name: 'i', value: '3', type: 'Integer' });
            expect(variables.scopes[0].variables[1].value).to.have.length(500);
            expect(variables.scopes[0].variables[1].valueTruncated).to.be.true;
            expect(variables.scopes[1].variables).to.be.undefined;
            expect(variables.scopes[1]).to.include({ expensive: true, notExpanded: true });
            expect(variables.scopes[1].hint).to.contain('scope: "Global"');
            expect(requests.filter(([command]) => command === 'variables')).to.have.length(1);
        });

        it('expands an expensive Local scope by default, else the first scope, and any scope that is named', async () => {
            function setup(scopeNames: string[]) {
                const expanded: number[] = [];
                const group = makeDebugGroup((command, args) => {
                    if (command === 'scopes') {
                        return Promise.resolve({ scopes: scopeNames.map((name, index) => ({ name: name, variablesReference: index + 1, expensive: true })) });
                    }
                    if (command === 'variables') {
                        expanded.push(args.variablesReference);
                        return Promise.resolve({ variables: [] });
                    }
                    return Promise.resolve({ stackFrames: [{ id: 1, name: 'f', line: 1, column: 1 }] });
                });
                group.stateStore.handleMessage('brs1', { type: 'event', event: 'stopped', body: { reason: 'breakpoint', threadId: 1 } });
                return { ...group, expanded: expanded };
            }
            const withLocal = setup(['Global', 'LOCAL']);
            const first: any = await withLocal.getTool('get_variables').handler({});
            expect(withLocal.expanded).to.eql([2]);
            expect(first.scopes[0].notExpanded).to.be.true;
            const withoutLocal = setup(['Registers', 'Global']);
            await withoutLocal.getTool('get_variables').handler({});
            expect(withoutLocal.expanded).to.eql([1]);
            const named = setup(['Registers', 'Global']);
            const filtered: any = await named.getTool('get_variables').handler({ scope: 'global' });
            expect(named.expanded).to.eql([2]);
            expect(filtered.scopes.map((scope) => scope.name)).to.eql(['Global']);
        });

        it('evaluates in the top frame and honors the confirmEvaluate setting', async () => {
            let confirmedDetail: string;
            const stateStore = makeStateStore();
            const brightScript = makeSession('brs1', 'Roku', (command, args) => Promise.resolve(command === 'stackTrace' ? { stackFrames: [{ id: 5, name: 'f', line: 1, column: 1 }] } : { result: `evaluated ${args.expression} in ${args.frameId} as ${args.context}`, type: 'String', variablesReference: 0 }));
            const group = makeGroup(brightScript);
            stateStore.trackSession('brs1', 'brs', { groupId: 'brs1' });
            stateStore.handleMessage('brs1', { type: 'event', event: 'stopped', body: { reason: 'breakpoint', threadId: 1 } });
            const host = makeHost({
                getSetting: (name) => name === 'confirmEvaluate',
                confirm: (_message, detail) => {
                    confirmedDetail = detail;
                    return Promise.resolve(true);
                }
            });
            const getTool = getTools({ sessions: [brightScript], groups: [group], activeGroup: group }, host, stateStore);
            const result: any = await getTool('evaluate').handler({ expression: 'child.id' });
            expect(result.result).to.equal('evaluated child.id in 5 as watch');
            expect(confirmedDetail).to.equal('child.id');
        });

        it('steps and returns the new location in one call', async () => {
            const { stateStore, getTool } = makeDebugGroup((command, args) => {
                if (command === 'next') {
                    stateStore.handleRequest('brs1', { type: 'request', seq: 1, command: 'next', arguments: args });
                    setTimeout(() => stateStore.handleMessage('brs1', { type: 'event', event: 'stopped', body: { reason: 'step', threadId: 1 } }), 10);
                    return Promise.resolve({});
                }
                return Promise.resolve({ stackFrames: [{ id: 12, name: 'init', line: 43, column: 1, source: { path: '/p/main.brs' } }] });
            });
            stateStore.handleMessage('brs1', { type: 'event', event: 'stopped', body: { reason: 'breakpoint', threadId: 1 } });
            const result: any = await getTool('step_over').handler({ timeoutMs: 1000 });
            expect(result).to.include({ stopped: true, reason: 'step', runtime: 'brs' });
            expect(result.frames[0].line).to.equal(43);
        });

        function setupFocusedExecution(options: { commandSendsRequest: boolean }) {
            const requests: string[] = [];
            const commands: Array<[string, any]> = [];
            const stateStore = makeStateStore();
            const brightScript = makeSession('brs1', 'Roku', (command) => {
                requests.push(command);
                return Promise.resolve({});
            });
            const group = makeGroup(brightScript);
            stateStore.trackSession('brs1', 'brs', { groupId: 'brs1' });
            const state = { focusedSessionId: 'brs1' };
            const host = makeHost({
                getFocusedStackItem: () => ({ sessionId: state.focusedSessionId, threadId: 1 }),
                executeCommand: (command, target) => {
                    commands.push([command, target]);
                    if (options.commandSendsRequest) {
                        stateStore.handleRequest('brs1', { type: 'request', seq: 9, command: 'continue', arguments: {} });
                    }
                    return Promise.resolve();
                }
            });
            const getTool = getTools({ sessions: [brightScript], groups: [group], activeGroup: group }, host, stateStore);
            stateStore.handleMessage('brs1', { type: 'event', event: 'stopped', body: { reason: 'breakpoint', threadId: 1 } });
            return { requests: requests, commands: commands, stateStore: stateStore, state: state, getTool: getTool };
        }

        it('runs VS Code\'s command with an explicit thread target when that thread is focused', async () => {
            const { requests, commands, getTool } = setupFocusedExecution({ commandSendsRequest: true });
            const focused: any = await getTool('continue').handler({});
            expect(commands).to.eql([['workbench.action.debug.continue', { sessionId: 'brs1', threadId: 'thread:brs1:1' }]]);
            expect(requests).to.be.empty;
            expect(focused.uiNote).to.be.undefined;
        });

        it('sends the request with a UI note when another session is focused', async () => {
            const { requests, commands, state, getTool } = setupFocusedExecution({ commandSendsRequest: true });
            state.focusedSessionId = 'other';
            const unfocused: any = await getTool('continue').handler({});
            expect(commands).to.be.empty;
            expect(requests).to.eql(['continue']);
            expect(unfocused.uiNote).to.contain('previous pause');
        });

        it('falls back to the request when the command never produced one', async function () {
            this.timeout(5000);
            const { requests, commands, getTool } = setupFocusedExecution({ commandSendsRequest: false });
            const result: any = await getTool('continue').handler({});
            expect(commands).to.have.length(1);
            expect(requests).to.eql(['continue']);
            expect(result.uiNote).to.contain('did not send the request');
        });

        it('wait_for_stop returns alreadyStopped and the top frames', async () => {
            const { stateStore, getTool } = makeDebugGroup(() => Promise.resolve({ stackFrames: [{ id: 1, name: 'main', line: 3, column: 1, source: { path: '/p/main.brs' } }] }));
            stateStore.handleMessage('brs1', { type: 'event', event: 'stopped', body: { reason: 'entry', threadId: 1 } });
            const result: any = await getTool('wait_for_stop').handler({});
            expect(result).to.include({ stopped: true, alreadyStopped: true, reason: 'entry' });
            expect(result.frames).to.have.length(1);
        });

        it('wait_for_stop returns frames for a session that joined the group after the group was resolved', async () => {
            const { stateStore, group } = makeDebugGroup(() => Promise.resolve({}));
            const lateChild = makeSession('child1', 'Child', () => Promise.resolve({ stackFrames: [{ id: 1, name: 'late', line: 8, column: 1, source: { path: '/p/late.brs' } }] }));
            stateStore.trackSession('child1', 'js', { groupId: 'brs1' });
            const getTool = getTools({ sessions: [group.primary, lateChild], groups: [group], activeGroup: group }, makeHost(), stateStore);
            const pending = getTool('wait_for_stop').handler({ timeoutMs: 1000 }) as Promise<any>;
            stateStore.handleMessage('child1', { type: 'event', event: 'stopped', body: { reason: 'breakpoint', threadId: 1 } });
            const result = await pending;
            expect(result).to.include({ stopped: true, sessionId: 'child1' });
            expect(result.frames[0]).to.include({ name: 'late', line: 8 });
        });

        it('wait_for_stop reports a timeout and a terminated session', async () => {
            const { stateStore, getTool } = makeDebugGroup(() => Promise.resolve({}));
            const timedOut: any = await getTool('wait_for_stop').handler({ timeoutMs: 10 });
            expect(timedOut.timedOut).to.be.true;
            const pending = getTool('wait_for_stop').handler({ timeoutMs: 1000 });
            stateStore.handleSessionEnded('brs1');
            expect(await pending).to.include({ terminated: true });
        });

        it('get_debug_output returns captured lines and a cursor', async () => {
            const { stateStore, getTool } = makeDebugGroup(() => Promise.resolve({}));
            stateStore.handleMessage('brs1', { type: 'event', event: 'output', body: { category: 'stdout', output: 'a\nb\n' } });
            const first: any = await getTool('get_debug_output').handler({});
            expect(first.lines.map((line) => line.text)).to.eql(['a', 'b']);
            stateStore.handleMessage('brs1', { type: 'event', event: 'output', body: { category: 'stdout', output: 'c\n' } });
            const second: any = await getTool('get_debug_output').handler({ sinceCursor: first.nextCursor, filter: 'c' });
            expect(second.lines.map((line) => line.text)).to.eql(['c']);
        });

        it('get_debug_output can be limited to one output category', async () => {
            const { stateStore, getTool } = makeDebugGroup(() => Promise.resolve({}));
            stateStore.handleMessage('brs1', { type: 'event', event: 'output', body: { category: 'stdout', output: 'device\n' } });
            stateStore.handleMessage('brs1', { type: 'event', event: 'output', body: { category: 'stderr', output: 'adapter\n' } });
            const result: any = await getTool('get_debug_output').handler({ category: 'stderr' });
            expect(result.lines.map((line) => line.text)).to.eql(['adapter']);
        });

        it('get_debug_state reports stopped and not-present runtimes', async () => {
            const { stateStore, getTool } = makeDebugGroup(() => Promise.resolve({ stackFrames: [{ id: 1, name: 'init', line: 9, column: 1, source: { path: '/p/main.brs' } }] }));
            stateStore.handleMessage('brs1', { type: 'event', event: 'stopped', body: { reason: 'breakpoint', threadId: 1 } });
            const state: any = await getTool('get_debug_state').handler({});
            expect(state.runtimes.brs).to.include({ status: 'stopped', reason: 'breakpoint', topFrame: '/p/main.brs:9:init' });
            expect(state.runtimes.js).to.eql({ status: 'not present' });
            expect(state.userFocus).to.be.null;
        });
    });
});

async function rejectionMessage(call: unknown): Promise<string | undefined> {
    try {
        await call;
    } catch (error) {
        return (error as Error).message;
    }
    return undefined;
}
