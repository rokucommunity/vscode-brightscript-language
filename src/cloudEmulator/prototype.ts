/* eslint-disable no-console */
import { RokuCloudEmulatorClient } from './RokuCloudEmulatorClient';
import { RokuCloudEmulatorLogStream } from './RokuCloudEmulatorLogStream';
import { RokuCloudEmulatorRemote } from './RokuCloudEmulatorRemote';
import { RokuCloudEmulatorVideoStream } from './RokuCloudEmulatorVideoStream';
import type { WebRtcPeerConnectionFactory } from './RokuCloudEmulatorVideoStream';

/**
 * Manual prototype harness for the Cloud Emulator integration. This is not part of the extension
 * runtime or the test suite; it is a way to exercise the client against the live service as soon as
 * an API key is available.
 *
 * Run it with:
 *   ROKU_RCE_API_KEY=<key> npx ts-node src/cloudEmulator/prototype.ts
 *
 * Optional environment variables:
 *   ROKU_RCE_DEVICE_ID   act on this device (stream logs, send remote input, or open the video stream)
 *   ROKU_RCE_REMOTE_KEYS comma-separated ECP keys to tap on the device, for example: Home,Down,Down,Select
 *   ROKU_RCE_VIDEO=1     negotiate the WebRTC video stream and report when it connects
 *   ROKU_RCE_BASE_URL    override the service origin (defaults to developer.roku.com)
 *
 * Mode precedence when ROKU_RCE_DEVICE_ID is set: remote keys, then video, otherwise log streaming.
 * The video mode needs a Node WebRTC implementation; install one first, for example:
 *   npm install --no-save @roamhq/wrtc
 */
export async function runPrototype(): Promise<void> {
    const apiKey = process.env.ROKU_RCE_API_KEY;
    if (!apiKey) {
        throw new Error('Set ROKU_RCE_API_KEY to run the Cloud Emulator prototype');
    }

    const client = new RokuCloudEmulatorClient({
        apiKey: apiKey,
        baseUrl: process.env.ROKU_RCE_BASE_URL
    });

    console.log('Fetching devices...');
    const devices = await client.getDevices();
    if (devices.length === 0) {
        console.log('No devices found for this account.');
        return;
    }
    for (const device of devices) {
        const running = device.runningDevice ? ` instance=${device.runningDevice.instanceId}` : '';
        console.log(`  ${device.id}  ${device.name}  [${device.deviceType}]  status=${device.status}${running}`);
    }

    const deviceId = process.env.ROKU_RCE_DEVICE_ID;
    if (!deviceId) {
        console.log('\nSet ROKU_RCE_DEVICE_ID to stream that device\'s log or send it remote input.');
        return;
    }

    const remoteKeys = (process.env.ROKU_RCE_REMOTE_KEYS ?? '').split(',').map((key) => key.trim()).filter((key) => key.length > 0);
    if (remoteKeys.length > 0) {
        await sendRemoteKeys(client, deviceId, remoteKeys);
        return;
    }

    if (process.env.ROKU_RCE_VIDEO === '1') {
        await openVideoStream(client, deviceId);
        return;
    }

    console.log(`\nConnecting to log stream for device ${deviceId} (Ctrl+C to stop)...`);
    await streamLogsUntilInterrupted(client, deviceId);
}

async function openVideoStream(client: RokuCloudEmulatorClient, deviceId: string): Promise<void> {
    const createPeerConnection = loadNodePeerConnectionFactory();
    if (!createPeerConnection) {
        console.log('No Node WebRTC implementation found. Install one to run the video prototype, for example:');
        console.log('  npm install --no-save @roamhq/wrtc');
        console.log('(In the real integration the stream renders in a VS Code webview, which has RTCPeerConnection built in.)');
        return;
    }

    const video = new RokuCloudEmulatorVideoStream(client, deviceId, createPeerConnection);
    video.on('iceConnectionStateChange', (state) => console.log(`[ice] ${state}`));
    video.on('track', () => console.log('[track received] media is flowing'));
    video.on('error', (error) => console.error('[video error]', error.message));

    console.log(`\nNegotiating video stream for device ${deviceId}...`);
    await video.connect();
    console.log('[started] WebRTC stream negotiated. Waiting 5s to observe ICE/track events...');
    await new Promise((resolve) => {
        setTimeout(resolve, 5000);
    });
    video.disconnect();
}

/**
 * Try to load an optional Node WebRTC implementation and adapt it to the peer-connection factory.
 * Returns undefined when none is installed.
 */
function loadNodePeerConnectionFactory(): WebRtcPeerConnectionFactory | undefined {
    for (const moduleName of ['@roamhq/wrtc', 'wrtc']) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
            const wrtc = require(moduleName);
            const PeerConnection = wrtc.RTCPeerConnection;
            return (configuration) => new PeerConnection(configuration);
        } catch {
            // try the next candidate
        }
    }
    return undefined;
}

async function sendRemoteKeys(client: RokuCloudEmulatorClient, deviceId: string, keys: string[]): Promise<void> {
    const remote = new RokuCloudEmulatorRemote(client, deviceId);
    remote.on('remoteError', (message) => console.error('[remote error]', message));
    console.log(`\nConnecting remote for device ${deviceId}...`);
    await remote.connect();
    console.log('[remote ready]');
    for (const key of keys) {
        console.log(`  press ${key}`);
        remote.sendKeypress(key);
    }
    remote.disconnect();
}

function streamLogsUntilInterrupted(client: RokuCloudEmulatorClient, deviceId: string): Promise<void> {
    return new Promise<void>((resolve) => {
        const logStream = new RokuCloudEmulatorLogStream(client, deviceId);
        logStream.on('open', () => console.log('[log stream connected]'));
        logStream.on('output', (line) => console.log(line));
        logStream.on('control', (frame) => console.log(`[${frame.code}] ${frame.message}`));
        logStream.on('error', (error) => console.error('[log stream error]', error.message));
        logStream.on('close', (event) => {
            console.log(`[log stream closed] code=${event.code} reason=${event.reason}`);
            resolve();
        });

        process.once('SIGINT', () => {
            console.log('\n[stopping]');
            logStream.disconnect();
            resolve();
        });

        logStream.connect();
    });
}

if (require.main === module) {
    runPrototype().catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    });
}
