import { rokuDeploy, RemoteKey } from 'roku-deploy';
import type { DeviceConfig, RemoteKeyText } from 'roku-deploy';
import type { DebugMcpTool, ToolCallContext } from '../core/DebugMcpServer';
import { waitAndDescribe } from '../core/stopReport';
import {
    CANCELLED_MESSAGE, DEFAULT_WAIT_TIMEOUT_MS, MAX_WAIT_TIMEOUT_MS, SESSION_ID_PROPERTY,
    readBoundedNumber, readOptionalBoolean, readOptionalString, readStringList
} from '../core/toolSupport';
import type { DebugMcpToolContext } from '../core/toolSupport';
import { describeDevice, getSessionDevice, resolveBrightScriptTarget } from './deviceTarget';
import type { RceTokenSource } from './deviceTarget';

export const DEFAULT_KEY_DELAY_MS = 150;
const MAX_KEY_DELAY_MS = 10000;
const MAX_KEYS_PER_CALL = 100;
export const MAX_TEXT_LENGTH = 200;
export const VALID_KEYS: string[] = Object.values(RemoteKey);

/** Sends one key event to a device. */
export interface KeySender {
    /** Resolves with the HTTP status when the device answered with one. */
    sendKey(action: KeyAction, device: DeviceConfig, key: string): Promise<number | undefined>;
}

export type KeyAction = 'press' | 'down' | 'up';

export interface SendKeysDependencies {
    /** Supplies the Cloud Emulator token the session configuration does not carry. */
    getRceToken?: RceTokenSource;
    sender?: KeySender;
    /** Waits between keys; resolves early when `signal` aborts. */
    sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

type Sleep = NonNullable<SendKeysDependencies['sleep']>;

/** Sends through roku-deploy, which reaches LAN devices over ECP and cloud emulator devices through the instance API. */
export const rokuDeploySender: KeySender = {
    sendKey: async (action, device, key) => {
        const options = { device: device, key: key as RemoteKeyText };
        let result: { status?: number };
        switch (action) {
            case 'down':
                result = await rokuDeploy.keyDown(options);
                break;
            case 'up':
                result = await rokuDeploy.keyUp(options);
                break;
            default:
                result = await rokuDeploy.keyPress(options);
        }
        return result?.status;
    }
};

export function createSendKeysTool(context: DebugMcpToolContext, dependencies: SendKeysDependencies = {}): DebugMcpTool {
    const tools = {
        sender: dependencies.sender ?? rokuDeploySender,
        sleep: dependencies.sleep ?? sleepUnlessAborted,
        getRceToken: dependencies.getRceToken ?? (() => Promise.resolve(undefined))
    };
    return {
        name: 'send_keys',
        description: `Sends remote-control keys and/or literal text to the Roku device of a BrightScript debug session, as if pressed on the physical remote. Works for LAN devices and Roku Cloud Emulator devices. keys are sent in order with delayMs between them (default ${DEFAULT_KEY_DELAY_MS}); valid keys: ${VALID_KEYS.join(', ')} (case-insensitive). text types characters after the keys, one key press per character (at most ${MAX_TEXT_LENGTH}). action "press" (default) presses and releases a key; "down" and "up" hold and release it. Set waitForStop: true to register for the next stop before sending, so a key that triggers a breakpoint returns the stop (like wait_for_stop) in one call; otherwise pair it with wait_for_stop. Needs an active debug session.`,
        inputSchema: {
            type: 'object',
            properties: {
                sessionId: SESSION_ID_PROPERTY,
                keys: { type: 'array', items: { type: 'string' }, description: 'Remote keys to send in order, e.g. ["Down", "Down", "Select"].' },
                text: { type: 'string', description: `Literal text to type, sent character by character after the keys. Only with action "press". At most ${MAX_TEXT_LENGTH} characters.` },
                delayMs: { type: 'number', description: `Pause between keys. Default ${DEFAULT_KEY_DELAY_MS}.` },
                action: { type: 'string', enum: ['press', 'down', 'up'], description: 'Default "press".' },
                waitForStop: { type: 'boolean', description: 'Wait for the next stop after sending and return it. Default false.' },
                timeoutMs: { type: 'number', description: `Wait limit when waitForStop is set. Default ${DEFAULT_WAIT_TIMEOUT_MS}, maximum ${MAX_WAIT_TIMEOUT_MS}.` }
            }
        },
        handler: (args, call) => sendKeys(context, args, call, tools)
    };
}

/** The canonical `RemoteKey` casing of `key`, or a clear error listing the valid keys. */
export function normalizeKey(key: string): string {
    const canonical = VALID_KEYS.find((candidate) => candidate.toLowerCase() === key.toLowerCase());
    if (!canonical) {
        throw new Error(`Unknown key '${key}'. Valid keys: ${VALID_KEYS.join(', ')}. Use text to type characters.`);
    }
    return canonical;
}

async function sendKeys(context: DebugMcpToolContext, args: Record<string, unknown>, call: ToolCallContext | undefined, tools: { sender: KeySender; sleep: Sleep; getRceToken: RceTokenSource }): Promise<Record<string, unknown>> {
    const keys = readStringList(args, 'keys').map((key) => normalizeKey(key));
    const text = readOptionalString(args, 'text');
    const characters = text ? [...text] : [];
    const action = (readOptionalString(args, 'action') ?? 'press') as KeyAction;
    if (!['press', 'down', 'up'].includes(action)) {
        throw new Error(`'action' must be one of: press, down, up.`);
    }
    if (keys.length === 0 && !text) {
        throw new Error(`Pass keys, text, or both.`);
    }
    if (keys.length > MAX_KEYS_PER_CALL) {
        throw new Error(`At most ${MAX_KEYS_PER_CALL} keys can be sent in one call.`);
    }
    if (characters.length > MAX_TEXT_LENGTH) {
        throw new Error(`text can be at most ${MAX_TEXT_LENGTH} characters; send longer text in several calls.`);
    }
    if (text && action !== 'press') {
        throw new Error(`text can only be sent with action "press".`);
    }
    const delayMs = readBoundedNumber(args, 'delayMs', DEFAULT_KEY_DELAY_MS, 0, MAX_KEY_DELAY_MS);
    const timeoutMs = readBoundedNumber(args, 'timeoutMs', DEFAULT_WAIT_TIMEOUT_MS, 1, MAX_WAIT_TIMEOUT_MS);
    const shouldWait = readOptionalBoolean(args, 'waitForStop') ?? false;

    const target = resolveBrightScriptTarget(context, args);
    const device = await getSessionDevice(target.session, tools.getRceToken);
    const stepCount = keys.length + characters.length;

    const sendStep = async (stepIndex: number, stepAction: KeyAction, key: string, label: string) => {
        const status = await tools.sender.sendKey(stepAction, device, key).catch((error) => {
            throw new Error(`${label} (step ${stepIndex + 1} of ${stepCount}) failed: ${(error as Error).message}`);
        });
        if (status === undefined) {
            throw new Error(`${label} (step ${stepIndex + 1} of ${stepCount}) failed: no response from device.`);
        }
        if (status < 200 || status >= 300) {
            throw new Error(`${label} (step ${stepIndex + 1} of ${stepCount}) failed (status ${status}).`);
        }
    };

    //the wait is registered before the first key so a fast stop cannot be missed
    const wait = shouldWait
        ? context.stateStore.waitForStop({ groupId: target.group.id, timeoutMs: timeoutMs, onlyNewStops: true, signal: call?.signal })
        : undefined;
    const sent: string[] = [];
    let typed = '';
    try {
        for (const [index, key] of keys.entries()) {
            await pauseBetweenSteps(index, delayMs, call?.signal, tools.sleep);
            await sendStep(index, action, key, `Key '${key}'`);
            sent.push(key);
        }
        for (const [index, character] of characters.entries()) {
            //one pause between the keys and the text, none between characters
            if (index === 0) {
                await pauseBetweenSteps(keys.length, delayMs, call?.signal, tools.sleep);
            } else if (call?.signal?.aborted) {
                throw new Error(CANCELLED_MESSAGE);
            }
            await sendStep(keys.length + index, 'press', `Lit_${character}`, `Character '${character}'`);
            typed += character;
        }
    } catch (error) {
        wait?.cancel();
        const message = (error as Error).message;
        const alreadySent = [...sent, ...(typed ? [`text "${typed}"`] : [])];
        const sentNote = alreadySent.length > 0 ? ` Already sent: ${alreadySent.join(', ')}.` : '';
        throw new Error(message === CANCELLED_MESSAGE ? message : `${message}${sentNote}`);
    }
    const summary = { device: describeDevice(device), action: action, keysSent: sent, textSent: text };
    if (!wait) {
        return { ok: true, sessionId: target.session.id, ...summary };
    }
    return { ...await waitAndDescribe(context, target, wait, timeoutMs, call), sent: summary };
}

async function pauseBetweenSteps(stepIndex: number, delayMs: number, signal: AbortSignal | undefined, sleep: Sleep): Promise<void> {
    if (stepIndex > 0 && delayMs > 0) {
        await sleep(delayMs, signal);
    }
    if (signal?.aborted) {
        throw new Error(CANCELLED_MESSAGE);
    }
}

function sleepUnlessAborted(milliseconds: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, milliseconds);
        signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            resolve();
        }, { once: true });
    });
}
