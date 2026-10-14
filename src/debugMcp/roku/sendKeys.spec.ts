import { expect } from 'chai';
import * as sinon from 'sinon';
import { rokuDeploy } from 'roku-deploy';
import { DebugStateStore } from '../core/debugStateStore';
import { DebugMcpRegistry } from '../core/integration';
import type { DebugMcpToolContext } from '../core/toolSupport';
import { createRokuDebugIntegration } from './rokuIntegration';
import { createSendKeysTool, normalizeKey, rokuDeploySender, VALID_KEYS } from './sendKeys';
import type { KeyAction, KeySender } from './sendKeys';

const LAN_DEVICE = { host: '192.168.1.50' };
const CLOUD_DEVICE = { id: 83 };
const CLOUD_TOKEN = 'secret-token';
const getRceToken = () => Promise.resolve(CLOUD_TOKEN);

function makeBrightScriptSession(device: any = LAN_DEVICE) {
    return { id: 'brs1', name: 'Roku', type: 'brightscript', configuration: { device: device }, customRequest: () => Promise.resolve({}) } as any;
}

function makeContext(session = makeBrightScriptSession(), stateStore = new DebugStateStore()): DebugMcpToolContext {
    const group = { id: session.id, primary: session, primaryRuntime: 'brs', runtimes: [{ id: 'brs', description: '' }, { id: 'js', description: '' }], members: [{ session: session, runtime: 'brs' }] };
    stateStore.trackSession(session.id, 'brs', { groupId: session.id });
    const registry = new DebugMcpRegistry();
    registry.registerDebugIntegration(createRokuDebugIntegration());
    return { sessions: { sessions: [session], groups: [group], activeGroup: group }, registry: registry, stateStore: stateStore, host: {} as any, extensionVersion: '1', getWorkspaceFolders: () => [] };
}

function makeSender(events: string[], options: { failOn?: string; status?: number } = {}): KeySender {
    return {
        sendKey: (action: KeyAction, device, key) => {
            events.push(`${action}:${key}:${JSON.stringify(device)}`);
            return options.failOn === key ? Promise.reject(new Error('device unreachable')) : Promise.resolve(options.failOn === `status:${key}` ? options.status : 200);
        }
    };
}

describe('send_keys', () => {
    afterEach(() => sinon.restore());

    it('describes itself for agents without file extensions and mentions cloud emulators and wait_for_stop', () => {
        const tool = createSendKeysTool(makeContext());
        expect(tool.name).to.equal('send_keys');
        expect(tool.description).to.contain('Cloud Emulator');
        expect(tool.description).to.contain('wait_for_stop');
        expect(tool.description).to.contain('Select');
        expect(JSON.stringify([tool.description, tool.inputSchema])).not.to.match(/\.(js|ts)\b/);
    });

    describe('key validation', () => {
        it('canonicalizes the casing of known keys', () => {
            expect(normalizeKey('select')).to.equal('Select');
            expect(normalizeKey('INSTANTREPLAY')).to.equal('InstantReplay');
        });

        it('rejects unknown keys with the list of valid ones, before sending anything', async () => {
            const events: string[] = [];
            const tool = createSendKeysTool(makeContext(), { sender: makeSender(events) });
            let message: string;
            try {
                await tool.handler({ keys: ['Down', 'Okay'] });
            } catch (error) {
                message = (error as Error).message;
            }
            expect(message).to.contain(`Unknown key 'Okay'`);
            for (const key of ['Home', 'Select', 'Back', 'InstantReplay']) {
                expect(message).to.contain(key);
            }
            expect(VALID_KEYS).to.include('Select');
            expect(events).to.be.empty;
        });

        it('requires keys or text, and text only with press', async () => {
            const tool = createSendKeysTool(makeContext(), { sender: makeSender([]) });
            for (const [args, expected] of [
                [{}, 'Pass keys, text, or both'],
                [{ text: 'abc', action: 'down' }, 'text can only be sent with action "press"'],
                [{ keys: ['Up'], action: 'hold' }, `'action' must be one of`],
                [{ keys: 'Up' }, 'must be an array of strings']
            ] as Array<[Record<string, unknown>, string]>) {
                let message: string;
                try {
                    await tool.handler(args);
                } catch (error) {
                    message = (error as Error).message;
                }
                expect(message, JSON.stringify(args)).to.contain(expected);
            }
        });
    });

    describe('sending', () => {
        it('sends the keys in order to the device of the session, then the text, pausing delayMs between steps', async () => {
            const events: string[] = [];
            const delays: number[] = [];
            const tool = createSendKeysTool(makeContext(), {
                sender: makeSender(events),
                sleep: (milliseconds) => {
                    delays.push(milliseconds);
                    events.push('sleep');
                    return Promise.resolve();
                }
            });
            const result: any = await tool.handler({ keys: ['down', 'Down', 'Select'], text: 'hi' });
            const device = JSON.stringify(LAN_DEVICE);
            expect(events).to.eql([`press:Down:${device}`, 'sleep', `press:Down:${device}`, 'sleep', `press:Select:${device}`, 'sleep', `press:Lit_h:${device}`, `press:Lit_i:${device}`]);
            expect(delays).to.eql([150, 150, 150]);
            expect(result).to.include({ ok: true, sessionId: 'brs1', action: 'press', textSent: 'hi' });
            expect(result.keysSent).to.eql(['Down', 'Down', 'Select']);
            expect(result.device).to.equal('192.168.1.50');
        });

        it('honors delayMs, including none, and does not pause before the first key or after the last', async () => {
            const delays: number[] = [];
            const sleep = (milliseconds: number) => {
                delays.push(milliseconds);
                return Promise.resolve();
            };
            const tool = createSendKeysTool(makeContext(), { sender: makeSender([]), sleep: sleep });
            await tool.handler({ keys: ['Up'] });
            expect(delays).to.be.empty;
            await tool.handler({ keys: ['Up', 'Up'], delayMs: 40 });
            expect(delays).to.eql([40]);
            await tool.handler({ keys: ['Up', 'Up'], delayMs: 0 });
            expect(delays).to.eql([40]);
        });

        it('really waits between keys with the default sleep', async () => {
            const stamps: number[] = [];
            const sender: KeySender = {
                sendKey: () => {
                    stamps.push(Date.now());
                    return Promise.resolve(200);
                }
            };
            await createSendKeysTool(makeContext(), { sender: sender }).handler({ keys: ['Up', 'Down'], delayMs: 60 });
            expect(stamps[1] - stamps[0]).to.be.at.least(50);
        });

        it('sends key down and up actions', async () => {
            const events: string[] = [];
            const tool = createSendKeysTool(makeContext(), { sender: makeSender(events), sleep: () => Promise.resolve() });
            await tool.handler({ keys: ['Right'], action: 'down' });
            await tool.handler({ keys: ['Right'], action: 'up' });
            expect(events.map((event) => event.split(':').slice(0, 2).join(':'))).to.eql(['down:Right', 'up:Right']);
        });

        it('uses the device of the targeted BrightScript session, including a cloud emulator device, and never reports its token', async () => {
            const events: string[] = [];
            const session = makeBrightScriptSession(CLOUD_DEVICE);
            const tool = createSendKeysTool(makeContext(session), { sender: makeSender(events), getRceToken: getRceToken });
            const result: any = await tool.handler({ keys: ['Home'] });
            expect(events[0]).to.equal(`press:Home:${JSON.stringify({ ...CLOUD_DEVICE, rceToken: CLOUD_TOKEN })}`);
            expect(result.device).to.equal('cloud emulator 83');
            expect(JSON.stringify(result)).not.to.contain(CLOUD_TOKEN);
            expect(session.configuration.device).to.eql(CLOUD_DEVICE);
        });

        it('fails clearly when a cloud emulator device has no token available', async () => {
            const events: string[] = [];
            const tool = createSendKeysTool(makeContext(makeBrightScriptSession(CLOUD_DEVICE)), { sender: makeSender(events), getRceToken: () => Promise.resolve(undefined) });
            let message: string;
            try {
                await tool.handler({ keys: ['Home'] });
            } catch (error) {
                message = (error as Error).message;
            }
            expect(message).to.contain('No Cloud Emulator token is available');
            expect(events).to.be.empty;
        });

        it('keeps a token the configuration already carries', async () => {
            const events: string[] = [];
            const device = { id: 5, rceToken: 'own-token' };
            await createSendKeysTool(makeContext(makeBrightScriptSession(device)), { sender: makeSender(events), getRceToken: getRceToken }).handler({ keys: ['Home'] });
            expect(events[0]).to.contain('own-token');
        });

        it('falls back to the launch configuration host when there is no device config', async () => {
            const events: string[] = [];
            const session = { ...makeBrightScriptSession(), configuration: { host: '10.0.0.9' } };
            await createSendKeysTool(makeContext(session), { sender: makeSender(events) }).handler({ keys: ['Back'] });
            expect(events[0]).to.equal(`press:Back:${JSON.stringify({ host: '10.0.0.9' })}`);
            const bare = { ...makeBrightScriptSession(), configuration: {} };
            let message: string;
            try {
                await createSendKeysTool(makeContext(bare), { sender: makeSender([]) }).handler({ keys: ['Back'] });
            } catch (error) {
                message = (error as Error).message;
            }
            expect(message).to.contain('no device');
        });

        it('stops at the first failure, naming the key, the step and what was already sent', async () => {
            const events: string[] = [];
            const tool = createSendKeysTool(makeContext(), { sender: makeSender(events, { failOn: 'Down' }), sleep: () => Promise.resolve() });
            let message: string;
            try {
                await tool.handler({ keys: ['Up', 'Down', 'Select'] });
            } catch (error) {
                message = (error as Error).message;
            }
            expect(message).to.contain(`Key 'Down' (step 2 of 3) failed: device unreachable`);
            expect(message).to.contain('Already sent: Up');
            expect(events).to.have.length(2);
        });

        it('treats a missing device response as a failure', async () => {
            const sender: KeySender = { sendKey: () => Promise.resolve(undefined) };
            let message: string;
            try {
                await createSendKeysTool(makeContext(), { sender: sender }).handler({ keys: ['Up'] });
            } catch (error) {
                message = (error as Error).message;
            }
            expect(message).to.contain('no response from device');
        });

        it('rejects text longer than 200 characters, and counts characters rather than code units', async () => {
            const events: string[] = [];
            const tool = createSendKeysTool(makeContext(), { sender: makeSender(events) });
            let message: string;
            try {
                await tool.handler({ text: 'a'.repeat(201) });
            } catch (error) {
                message = (error as Error).message;
            }
            expect(message).to.contain('at most 200 characters');
            expect(events).to.be.empty;
            await tool.handler({ text: '\u{1F600}'.repeat(200) });
            expect(events).to.have.length(200);
        });

        it('checks the status of every typed character and stops at the first failure', async () => {
            const events: string[] = [];
            const sender: KeySender = {
                sendKey: (_action, _device, key) => {
                    events.push(key);
                    return Promise.resolve(key === 'Lit_b' ? 500 : 200);
                }
            };
            let message: string;
            try {
                await createSendKeysTool(makeContext(), { sender: sender }).handler({ text: 'abc' });
            } catch (error) {
                message = (error as Error).message;
            }
            expect(message).to.contain(`Character 'b' (step 2 of 3) failed (status 500)`);
            expect(message).to.contain('text "a"');
            expect(events).to.eql(['Lit_a', 'Lit_b']);
        });

        it('stops typing when the request is cancelled between characters', async () => {
            const events: string[] = [];
            const controller = new AbortController();
            const sender: KeySender = {
                sendKey: (_action, _device, key) => {
                    events.push(key);
                    controller.abort();
                    return Promise.resolve(200);
                }
            };
            let message: string;
            try {
                await createSendKeysTool(makeContext(), { sender: sender }).handler({ text: 'abc' }, { signal: controller.signal });
            } catch (error) {
                message = (error as Error).message;
            }
            expect(message).to.equal('The request was cancelled.');
            expect(events).to.eql(['Lit_a']);
        });

        it('treats a non-2xx device status as a failure', async () => {
            const tool = createSendKeysTool(makeContext(), { sender: makeSender([], { failOn: 'status:Up', status: 403 }) });
            let message: string;
            try {
                await tool.handler({ keys: ['Up'] });
            } catch (error) {
                message = (error as Error).message;
            }
            expect(message).to.contain('status 403');
        });

        it('stops sending when the request is cancelled between keys', async () => {
            const events: string[] = [];
            const controller = new AbortController();
            const tool = createSendKeysTool(makeContext(), {
                sender: makeSender(events),
                sleep: () => {
                    controller.abort();
                    return Promise.resolve();
                }
            });
            let message: string;
            try {
                await tool.handler({ keys: ['Up', 'Down', 'Select'] }, { signal: controller.signal });
            } catch (error) {
                message = (error as Error).message;
            }
            expect(message).to.equal('The request was cancelled.');
            expect(events).to.have.length(1);
        });

        it('passes the device and raw key to roku-deploy for each action', async () => {
            const keyPress = sinon.stub(rokuDeploy, 'keyPress').resolves({ status: 200 } as any);
            const keyDown = sinon.stub(rokuDeploy, 'keyDown').resolves({ status: 200 } as any);
            const keyUp = sinon.stub(rokuDeploy, 'keyUp').resolves({ status: 200 } as any);
            expect(await rokuDeploySender.sendKey('press', CLOUD_DEVICE, 'Home')).to.equal(200);
            await rokuDeploySender.sendKey('down', LAN_DEVICE, 'Left');
            await rokuDeploySender.sendKey('up', LAN_DEVICE, 'Left');
            await rokuDeploySender.sendKey('press', LAN_DEVICE, 'Lit_a');
            expect(keyPress.firstCall.args[0]).to.eql({ device: CLOUD_DEVICE, key: 'Home' });
            expect(keyDown.firstCall.args[0]).to.eql({ device: LAN_DEVICE, key: 'Left' });
            expect(keyUp.firstCall.args[0]).to.eql({ device: LAN_DEVICE, key: 'Left' });
            expect(keyPress.secondCall.args[0]).to.eql({ device: LAN_DEVICE, key: 'Lit_a' });
        });
    });

    describe('waitForStop', () => {
        it('registers the stop wait before the first key, so a stop caused by the key is returned', async () => {
            const stateStore = new DebugStateStore();
            const session = makeBrightScriptSession();
            session.customRequest = (command: string) => Promise.resolve(command === 'stackTrace' ? { stackFrames: [{ id: 1, name: 'onKey', line: 12, column: 1, source: { path: '/p/Scene.brs' } }] } : {});
            const context = makeContext(session, stateStore);
            const order: string[] = [];
            const originalWait = stateStore.waitForStop.bind(stateStore);
            stateStore.waitForStop = (options) => {
                order.push(`wait(onlyNewStops=${options.onlyNewStops})`);
                return originalWait(options);
            };
            const sender: KeySender = {
                sendKey: (_action, _device, key) => {
                    order.push(`key:${key}`);
                    //the device hits a breakpoint as the key arrives
                    stateStore.handleMessage('brs1', { type: 'event', event: 'stopped', body: { reason: 'breakpoint', threadId: 1 } });
                    return Promise.resolve(200);
                }
            };
            const result: any = await createSendKeysTool(context, { sender: sender }).handler({ keys: ['Select'], waitForStop: true, timeoutMs: 1000 });
            expect(order).to.eql(['wait(onlyNewStops=true)', 'key:Select']);
            expect(result).to.include({ stopped: true, reason: 'breakpoint', runtime: 'brs' });
            expect(result.frames[0].line).to.equal(12);
            expect(result.sent).to.include({ device: '192.168.1.50' });
            expect(result.sent.keysSent).to.eql(['Select']);
            stateStore.dispose();
        });

        it('does not return a stop that was already in place before the keys', async () => {
            const stateStore = new DebugStateStore();
            const context = makeContext(makeBrightScriptSession(), stateStore);
            stateStore.handleMessage('brs1', { type: 'event', event: 'stopped', body: { reason: 'entry', threadId: 1 } });
            const result: any = await createSendKeysTool(context, { sender: makeSender([]) }).handler({ keys: ['Up'], waitForStop: true, timeoutMs: 20 });
            expect(result.timedOut).to.be.true;
            stateStore.dispose();
        });

        it('releases the wait when sending fails', async () => {
            const stateStore = new DebugStateStore();
            const context = makeContext(makeBrightScriptSession(), stateStore);
            let message: string;
            try {
                await createSendKeysTool(context, { sender: makeSender([], { failOn: 'Up' }) }).handler({ keys: ['Up'], waitForStop: true, timeoutMs: 60000 });
            } catch (error) {
                message = (error as Error).message;
            }
            expect(message).to.contain('failed');
            expect((stateStore as any).waiters.size).to.equal(0);
            stateStore.dispose();
        });
    });
});
