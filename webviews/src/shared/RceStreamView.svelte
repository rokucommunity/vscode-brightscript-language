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
    let rceStreamStatus: 'connecting' | 'reconnecting' | 'waiting' | 'streaming' | 'stopped' = 'connecting';
    let rceStreamError: string | undefined = undefined;
    let rceStreamStoppedMessage: string | undefined = undefined;
    let rceStreamReconnectAttempt: number | undefined = undefined;
    let rceStreamReconnectAttemptLimit: number | undefined = undefined;
    let rceMediaStream: MediaStream | undefined = undefined;
    let rceVideoElement: HTMLVideoElement;
    let rceStreamMuted = true;

    $: if (rceVideoElement) {
        rceVideoElement.srcObject = rceMediaStream ?? null;
    }

    $: rceStreamStatusLabel =
        rceStreamStatus === 'reconnecting' && rceStreamReconnectAttempt !== undefined
            ? `reconnecting (${rceStreamReconnectAttempt}/${rceStreamReconnectAttemptLimit})`
            : rceStreamStatus === 'waiting'
                ? 'waiting for the device to start'
                : rceStreamStatus === 'stopped'
                    ? 'device stopped'
                    : rceStreamStatus;

    //posted at the very start of the extension host's negotiation, before it has anything else to
    //report (even before it knows whether an account token is available) - this is what makes any
    //failure before an offer (no token, a connect() failure, a negotiation timeout) visible at all,
    //rather than the session dying silently. Reconnect attempts (the extension host's automatic
    //recovery after a dropped stream) arrive as this same event with a reconnectAttempt counter.
    intermediary.observeEvent(ViewProviderEvent.onRceStreamConnecting, (message) => {
        const isRetry = message.context.reconnectAttempt !== undefined || message.context.waitingForDevice === true;
        //a retry keeps the user's mute choice; a fresh watch starts muted again
        enterRceStreamMode(message.context.deviceId, message.context.deviceName, { preserveMute: isRetry });
        if (message.context.waitingForDevice) {
            //the device is still starting; the extension host is polling its status and will
            //connect once it reaches running
            rceStreamStatus = 'waiting';
        } else if (message.context.reconnectAttempt !== undefined) {
            rceStreamStatus = 'reconnecting';
            rceStreamReconnectAttempt = message.context.reconnectAttempt;
            rceStreamReconnectAttemptLimit = message.context.reconnectAttemptLimit;
        }
    });

    //the device is not running anymore (stopped by the user or its runtime limit); rendered as a
    //neutral device-stopped state (with its resumes-automatically hint) rather than an error banner
    intermediary.observeEvent(ViewProviderEvent.onRceStreamDeviceStopped, (message) => {
        if (rceStreamDeviceName === undefined) {
            enterRceStreamMode(message.context.deviceId, message.context.deviceName ?? 'Cloud Emulator device');
        }
        teardownRceStreamPeer();
        rceStreamStatus = 'stopped';
        rceStreamError = undefined;
        rceStreamStoppedMessage = message.context.message ?? `Device '${rceStreamDeviceName}' is no longer running`;
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
        //a stopped device already explains itself; the generic closed message is for everything else
        if (rceStreamStatus === 'stopped') {
            return;
        }
        rceStreamError = rceStreamError ?? 'The video stream closed unexpectedly';
    });

    function teardownRceStreamPeer() {
        rceStreamPeer?.stop();
        rceStreamPeer = undefined;
        rceMediaStream = undefined;
    }

    //enters (or re-enters) stream mode: tears down any previous peer connection, shows the header for
    //the given device, and clears any previous error so a fresh attempt starts from a clean banner
    function enterRceStreamMode(deviceId: number | undefined, deviceName: string, options: { preserveMute?: boolean } = {}) {
        teardownRceStreamPeer();

        rceStreamDeviceId = deviceId;
        rceStreamDeviceName = deviceName;
        rceStreamStatus = 'connecting';
        rceStreamError = undefined;
        rceStreamStoppedMessage = undefined;
        rceStreamReconnectAttempt = undefined;
        rceStreamReconnectAttemptLimit = undefined;
        if (!options.preserveMute) {
            rceStreamMuted = true;
        }
    }

    function startRceStreamPeer(offer: { deviceId: number; deviceName: string; offer: RceStreamJsep; iceServers: IceServer[] }) {
        //a new offer while already streaming tears down the old peer connection first. The mute
        //choice is preserved here because the preceding onRceStreamConnecting already reset it when
        //this negotiation was a fresh watch rather than a reconnect.
        enterRceStreamMode(offer.deviceId, offer.deviceName, { preserveMute: true });

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
            //show the failure, but also report it to the extension host, which owns the automatic
            //reconnect loop; when a reconnect does start, its connecting event clears this banner
            rceStreamError = error.message;
            intermediary.sendCommand(ViewProviderCommand.reportRceStreamFailure, { message: error.message });
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
        //extension host re-resolves the device's current stream details fresh. The host stops any
        //lingering session itself when it starts the new one, so nothing is sent ahead of this
        //(stopRceStream in particular must not be sent: the editor tab host treats it as "close
        //the tab")
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

    #rceStreamStoppedBanner {
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    #rceStreamStoppedHint {
        opacity: 0.7;
        font-size: 0.9em;
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
            <span id="rceStreamStatusLabel">{rceStreamStatusLabel}</span>
            {#if rceStreamStatus !== 'stopped'}
                <vscode-button appearance="secondary" on:click={toggleRceStreamMute}>
                    {rceStreamMuted ? 'Unmute' : 'Mute'}
                </vscode-button>
            {/if}
            <!-- with nothing streaming there is nothing to "stop", but this is still the only
                in-view exit (the Device View leaves stream mode, a video tab closes), so it stays
                with a label matching what it does -->
            <vscode-button appearance="secondary" on:click={stopRceStream}>
                {rceStreamStatus === 'stopped' ? 'Close' : 'Stop'}
            </vscode-button>
        </div>
        {#if rceStreamError}
            <div id="rceStreamErrorBanner">
                <span>{rceStreamError}</span>
                <vscode-button appearance="secondary" on:click={retryRceStream}>Retry</vscode-button>
            </div>
        {/if}
        {#if rceStreamStatus === 'stopped'}
            <div id="rceStreamStoppedBanner">
                <span>{rceStreamStoppedMessage}</span>
                <span id="rceStreamStoppedHint">The stream will resume automatically when the device starts</span>
            </div>
        {:else}
            <!-- svelte-ignore a11y-media-has-caption -->
            <video id="rceStreamVideo" bind:this={rceVideoElement} autoplay playsinline muted={rceStreamMuted} />
        {/if}
    </div>
{/if}
