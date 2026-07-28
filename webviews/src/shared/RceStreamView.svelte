<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { intermediary } from '../ExtensionIntermediary';
    import { ViewProviderEvent } from '../../../src/viewProviders/ViewProviderEvent';
    import { ViewProviderCommand } from '../../../src/viewProviders/ViewProviderCommand';
    import { RceStreamPeer } from './RceStreamPeer';
    import type { RceStreamJsep } from './RceStreamPeer';
    import type { IceServer } from 'roku-deploy';

    //Roku Cloud Emulator video stream renderer, shared by the Roku Device View's stream mode and
    //the per-device video editor tabs. All Janus signaling runs extension-side (see
    //RceStreamSession, which the owning provider/panel hosts); this component only ever holds the
    //RTCPeerConnection, exchanging SDP/ICE with the extension host over the message commands/events
    //below rather than talking to Janus directly. Renders nothing until the extension host posts
    //onRceStreamConnecting (or an early onRceStreamError).
    const dispatch = createEventDispatcher();

    let rceStreamDeviceId: number | undefined = undefined;
    let rceStreamDeviceName: string | undefined = undefined;
    let rceStreamPeer: RceStreamPeer | undefined = undefined;
    let rceStreamStatus: 'connecting' | 'streaming' = 'connecting';
    let rceStreamError: string | undefined = undefined;
    let rceMediaStream: MediaStream | undefined = undefined;
    let rceVideoElement: HTMLVideoElement;
    let rceStreamMuted = true;

    $: if (rceVideoElement) {
        rceVideoElement.srcObject = rceMediaStream ?? null;
    }

    //posted at the very start of the extension host's negotiation, before it has anything else to
    //report (even before it knows whether an account token is available) - this is what makes any
    //failure before an offer (no token, a connect() failure, a negotiation timeout) visible at all,
    //rather than the session dying silently
    intermediary.observeEvent(ViewProviderEvent.onRceStreamConnecting, (message) => {
        enterRceStreamMode(message.context.deviceId, message.context.deviceName);
    });

    intermediary.observeEvent(ViewProviderEvent.onRceStreamOffer, (message) => {
        startRceStreamPeer(message.context);
    });

    intermediary.observeEvent(ViewProviderEvent.onRceStreamError, (message) => {
        //an error can arrive before onRceStreamConnecting's own webview instance ever saw it (a queued
        //message flushed out of order, or a genuinely unexpected error), so if this webview is not
        //already showing stream mode, enter it here too rather than letting the error go nowhere
        if (rceStreamDeviceName === undefined) {
            enterRceStreamMode(message.context.deviceId, message.context.deviceName ?? 'Cloud Emulator device');
        }
        rceStreamError = message.context.message;
    });

    intermediary.observeEvent(ViewProviderEvent.onRceStreamClosed, () => {
        rceStreamError = rceStreamError ?? 'The video stream closed unexpectedly';
    });

    function teardownRceStreamPeer() {
        rceStreamPeer?.stop();
        rceStreamPeer = undefined;
        rceMediaStream = undefined;
    }

    //enters (or re-enters) stream mode: tears down any previous peer connection, shows the header for
    //the given device, and clears any previous error so a fresh attempt starts from a clean banner
    function enterRceStreamMode(deviceId: number | undefined, deviceName: string) {
        teardownRceStreamPeer();

        rceStreamDeviceId = deviceId;
        rceStreamDeviceName = deviceName;
        rceStreamStatus = 'connecting';
        rceStreamError = undefined;
        rceStreamMuted = true;
    }

    function startRceStreamPeer(offer: { deviceId: number; deviceName: string; offer: RceStreamJsep; iceServers: IceServer[] }) {
        //a new offer while already streaming tears down the old peer connection first
        enterRceStreamMode(offer.deviceId, offer.deviceName);

        const peer = new RceStreamPeer();
        rceStreamPeer = peer;

        peer.on('answer', (jsep) => {
            intermediary.sendCommand(ViewProviderCommand.sendRceStreamAnswer, { jsep: jsep });
        });
        peer.on('candidate', (candidateMessage) => {
            intermediary.sendCommand(ViewProviderCommand.sendRceStreamIceCandidate, candidateMessage);
        });
        peer.on('track', (mediaStream) => {
            rceMediaStream = mediaStream;
            rceStreamStatus = 'streaming';
        });
        peer.on('error', (error) => {
            rceStreamError = error.message;
        });

        peer.answerOffer(offer.offer, offer.iceServers).catch((error) => {
            rceStreamError = error.message;
        });
    }

    function stopRceStream() {
        teardownRceStreamPeer();
        rceStreamDeviceId = undefined;
        rceStreamDeviceName = undefined;
        intermediary.sendCommand(ViewProviderCommand.stopRceStream);
        //lets the owning view react to leaving stream mode (the Roku Device View resumes its
        //screenshot flow; a video editor tab is closed by its extension-side panel instead)
        dispatch('stopped');
    }

    function retryRceStream() {
        if (rceStreamDeviceId === undefined) {
            return;
        }
        //re-runs the whole negotiation rather than reusing anything remembered locally, since the
        //extension host re-resolves the device's current stream details fresh
        intermediary.sendCommand(ViewProviderCommand.stopRceStream);
        intermediary.sendCommand(ViewProviderCommand.watchRceDevice, { deviceId: rceStreamDeviceId });
    }

    function toggleRceStreamMute() {
        rceStreamMuted = !rceStreamMuted;
    }
</script>

<style>
    #rceStreamContainer {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
    }

    #rceStreamHeader {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        background-color: var(--vscode-breadcrumb-background);
    }

    #rceStreamDeviceName {
        font-weight: bold;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    #rceStreamStatusLabel {
        opacity: 0.7;
        font-size: 0.9em;
    }

    #rceStreamErrorBanner {
        color: var(--vscode-debugConsole-errorForeground);
        padding: 10px;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    #rceStreamVideo {
        max-width: 100vw;
        max-height: 100vh;
        margin-left: auto;
        margin-right: auto;
        background-color: black;
    }
</style>

{#if rceStreamDeviceName !== undefined}
    <div id="rceStreamContainer">
        <div id="rceStreamHeader">
            <span id="rceStreamDeviceName">{rceStreamDeviceName}</span>
            <span id="rceStreamStatusLabel">{rceStreamStatus}</span>
            <vscode-button appearance="secondary" on:click={toggleRceStreamMute}>
                {rceStreamMuted ? 'Unmute' : 'Mute'}
            </vscode-button>
            <vscode-button appearance="secondary" on:click={stopRceStream}>Stop</vscode-button>
        </div>
        {#if rceStreamError}
            <div id="rceStreamErrorBanner">
                <span>{rceStreamError}</span>
                <vscode-button appearance="secondary" on:click={retryRceStream}>Retry</vscode-button>
            </div>
        {/if}
        <!-- svelte-ignore a11y-media-has-caption -->
        <video id="rceStreamVideo" bind:this={rceVideoElement} autoplay playsinline muted={rceStreamMuted} />
    </div>
{/if}
