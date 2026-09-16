<script lang="ts">
    import { createEventDispatcher, onDestroy } from 'svelte';
    import { Close, DebugStop, Mute, Play, Plug, Unmute } from 'svelte-codicons';
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

    //only the sidebar Roku Device View passes this: it is the sole way to leave stream mode and
    //return to the LAN screenshot flow, since it has no tab to close. The video editor tab has no
    //such exit (Chris's call) - it closes via the tab itself.
    export let showCloseButton = false;

    let rceStreamDeviceId: number | undefined = undefined;
    let rceStreamDeviceName: string | undefined = undefined;
    let rceStreamDeviceType: string | undefined = undefined;
    let rceStreamPeer: RceStreamPeer | undefined = undefined;
    let rceStreamStatus: 'connecting' | 'reconnecting' | 'waiting' | 'streaming' | 'stopped' = 'connecting';
    let rceStreamError: string | undefined = undefined;
    let rceStreamStoppedMessage: string | undefined = undefined;
    let rceStreamReconnectAttempt: number | undefined = undefined;
    let rceStreamReconnectAttemptLimit: number | undefined = undefined;
    let rceMediaStream: MediaStream | undefined = undefined;
    let rceVideoElement: HTMLVideoElement;
    let rceStreamMuted = true;

    //the current device's max-runtime progress, mirroring RceManagementView's runtime label/bar.
    //undefined (rather than 0) means "not running", which hides the whole runtime line
    let rceDeviceRuntimeStartedAt: string | undefined = undefined;
    let rceDeviceRuntimeMaxRuntime: number | undefined = undefined;

    //recomputed on an interval so the runtime label/bar stay current without a fresh event
    let nowTimestamp = Date.now();
    const runtimeTickIntervalId = setInterval(() => {
        nowTimestamp = Date.now();
    }, 30000);
    onDestroy(() => {
        clearInterval(runtimeTickIntervalId);
    });

    $: if (rceVideoElement) {
        rceVideoElement.srcObject = rceMediaStream ?? null;
    }

    $: rceDeviceRuntimeInfo = rceDeviceRuntimeStartedAt !== undefined && rceDeviceRuntimeMaxRuntime !== undefined
        ? runtimeInfo(rceDeviceRuntimeStartedAt, rceDeviceRuntimeMaxRuntime, nowTimestamp)
        : undefined;

    $: rceStreamStatusLabel =
        deviceStartRequested && (rceStreamStatus === 'stopped' || rceStreamStatus === 'waiting')
            ? 'device starting'
            : rceStreamStatus === 'reconnecting' && rceStreamReconnectAttempt !== undefined
                ? `reconnecting (${rceStreamReconnectAttempt}/${rceStreamReconnectAttemptLimit})`
                : rceStreamStatus === 'waiting'
                    ? 'waiting for the device to start'
                    : rceStreamStatus === 'stopped'
                        ? 'device stopped'
                        : rceStreamStatus;

    //a successful start flips the controls to the starting/stop presentation immediately (like the
    //management view) instead of waiting for the stream to notice; cleared once the stream progresses
    $: if (rceStreamStatus !== 'stopped' && rceStreamStatus !== 'waiting') {
        deviceStartRequested = false;
    }

    //a stream that actually starts flowing again means the Start/Stop banner is stale
    $: if (rceStreamStatus === 'streaming') {
        deviceActionError = undefined;
    }

    //posted at the very start of the extension host's negotiation, before it has anything else to
    //report (even before it knows whether an account token is available) - this is what makes any
    //failure before an offer (no token, a connect() failure, a negotiation timeout) visible at all,
    //rather than the session dying silently. Reconnect attempts (the extension host's automatic
    //recovery after a dropped stream) arrive as this same event with a reconnectAttempt counter.
    intermediary.observeEvent(ViewProviderEvent.onRceStreamConnecting, (message) => {
        const isRetry = message.context.reconnectAttempt !== undefined || message.context.waitingForDevice === true;
        //a fresh (non-retry) connect means whatever the Start/Stop buttons were doing is done with
        if (!isRetry) {
            deviceActionError = undefined;
        }
        //a retry keeps the user's mute choice; a fresh watch starts muted again
        enterRceStreamMode(message.context.deviceId, message.context.deviceName, { preserveMute: isRetry, deviceType: message.context.deviceType });
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
        //a genuine stopped push means the device is not starting anymore
        deviceStartRequested = false;
        rceStreamError = undefined;
        rceStreamStoppedMessage = message.context.message ?? `Device '${rceStreamDeviceName}' is no longer running`;
        rceDeviceRuntimeStartedAt = undefined;
        rceDeviceRuntimeMaxRuntime = undefined;
    });

    intermediary.observeEvent(ViewProviderEvent.onRceStreamOffer, (message) => {
        startRceStreamPeer(message.context);
    });

    //empty startedAt/maxRuntime (the device isn't running) clears the runtime line the same way a
    //present pair fills it in; other devices' updates are ignored
    intermediary.observeEvent(ViewProviderEvent.onRceDeviceRuntimeChanged, (message) => {
        if (message.context.deviceId !== rceStreamDeviceId) {
            return;
        }
        rceDeviceRuntimeStartedAt = message.context.startedAt ?? undefined;
        rceDeviceRuntimeMaxRuntime = message.context.maxRuntime ?? undefined;
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

    //the extension host stopped this session on its own (e.g. RTA was disconnected from the
    //device) rather than the user stopping it here, so this tears down without re-sending a
    //stop the host already acted on
    intermediary.observeEvent(ViewProviderEvent.onRceStreamStopped, () => {
        teardownRceStreamPeer();
        rceStreamDeviceId = undefined;
        rceStreamDeviceName = undefined;
        dispatch('stopped');
    });

    function teardownRceStreamPeer() {
        rceStreamPeer?.stop();
        rceStreamPeer = undefined;
        rceMediaStream = undefined;
    }

    //enters (or re-enters) stream mode: tears down any previous peer connection, shows the header for
    //the given device, and clears any previous error so a fresh attempt starts from a clean banner
    function enterRceStreamMode(deviceId: number | undefined, deviceName: string, options: { preserveMute?: boolean; deviceType?: string } = {}) {
        teardownRceStreamPeer();

        //a reconnect/fresh-connect on the SAME device keeps its last-known runtime showing (the
        //next finder poll refreshes it); only a genuinely different device clears it, otherwise the
        //bar flickers out and back on every connect
        const isSameDevice = deviceId !== undefined && deviceId === rceStreamDeviceId;

        //events on paths that don't carry the device type (a reconnect, the device-stopped state)
        //keep the type already known for this device; a different device starts unknown again
        rceStreamDeviceType = options.deviceType ?? (isSameDevice ? rceStreamDeviceType : undefined);
        rceStreamDeviceId = deviceId;
        rceStreamDeviceName = deviceName;
        rceStreamStatus = 'connecting';
        rceStreamError = undefined;
        rceStreamStoppedMessage = undefined;
        rceStreamReconnectAttempt = undefined;
        rceStreamReconnectAttemptLimit = undefined;
        if (!isSameDevice) {
            rceDeviceRuntimeStartedAt = undefined;
            rceDeviceRuntimeMaxRuntime = undefined;
        }
        if (!options.preserveMute) {
            rceStreamMuted = true;
        }
    }

    function startRceStreamPeer(offer: { deviceId: number; deviceName: string; deviceType?: string; offer: RceStreamJsep; iceServers: IceServer[] }) {
        //a new offer while already streaming tears down the old peer connection first. The mute
        //choice is preserved here because the preceding onRceStreamConnecting already reset it when
        //this negotiation was a fresh watch rather than a reconnect.
        enterRceStreamMode(offer.deviceId, offer.deviceName, { preserveMute: true, deviceType: offer.deviceType });

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

    let powerKeyInFlight = false;

    //presses the Power key on the streamed device (toggles the emulated display; the stream itself
    //keeps running either way)
    async function pressRceStreamPower() {
        if (rceStreamDeviceId === undefined || powerKeyInFlight) {
            return;
        }
        powerKeyInFlight = true;
        try {
            await intermediary.sendCommand(ViewProviderCommand.pressRceDevicePowerButton, {
                deviceId: rceStreamDeviceId
            });
        } catch (error) {
            rceStreamError = error.message;
        } finally {
            powerKeyInFlight = false;
        }
    }

    let deviceActionInFlight = false;
    let deviceActionError: string | undefined = undefined;
    let deviceStartRequested = false;

    async function startStreamedDevice() {
        if (rceStreamDeviceId === undefined || deviceActionInFlight) {
            return;
        }
        deviceActionInFlight = true;
        deviceActionError = undefined;
        try {
            await intermediary.sendCommand(ViewProviderCommand.startRceDevice, { deviceId: rceStreamDeviceId });
            deviceStartRequested = true;
        } catch (error) {
            //'waiting' can also mean the device is already pending startup, in which case this
            //fails server-side and lands here rather than actually starting anything
            deviceActionError = error.message;
        } finally {
            deviceActionInFlight = false;
        }
    }

    async function stopStreamedDevice() {
        if (rceStreamDeviceId === undefined || deviceActionInFlight) {
            return;
        }
        deviceActionInFlight = true;
        deviceActionError = undefined;
        try {
            await intermediary.sendCommand(ViewProviderCommand.stopRceDevice, { deviceId: rceStreamDeviceId });
            deviceStartRequested = false;
        } catch (error) {
            deviceActionError = error.message;
        } finally {
            deviceActionInFlight = false;
        }
    }

    //runtime label/bar math, duplicated from RceManagementView.svelte rather than importing across
    //view folders for a few small helpers
    function formatHoursCompact(totalSeconds: number): string {
        const hours = Math.round((totalSeconds / 3600) * 10) / 10;
        const value = Number.isInteger(hours) ? hours.toFixed(0) : hours.toFixed(1);
        return `${value}h`;
    }

    function formatMinutesCompact(totalSeconds: number): string {
        return `${Math.floor(totalSeconds / 60)}m`;
    }

    function formatRuntimeLabel(elapsedSeconds: number, maxRuntimeSeconds: number): string {
        if (elapsedSeconds >= 3600) {
            return `${formatHoursCompact(elapsedSeconds)} / ${formatHoursCompact(maxRuntimeSeconds)}`;
        }
        return `${formatMinutesCompact(elapsedSeconds)} / ${formatMinutesCompact(maxRuntimeSeconds)}`;
    }

    function runtimeInfo(startedAt: string, maxRuntimeSeconds: number, currentTimestamp: number): { label: string; percent: number } {
        const elapsedSeconds = Math.max(0, (currentTimestamp - new Date(startedAt).getTime()) / 1000);
        return {
            label: formatRuntimeLabel(elapsedSeconds, maxRuntimeSeconds),
            percent: Math.min(100, (elapsedSeconds / maxRuntimeSeconds) * 100)
        };
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

    .rceStreamErrorBanner {
        color: var(--vscode-debugConsole-errorForeground);
        padding: 10px;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    /* takes exactly the height left over in the column after the header/error banners, and stacks
       its own content (video, runtime, controls) top-aligned so leftover space lands at the
       bottom, not around the video; container-type: size feeds the cq units below */
    .rceStreamStage {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        container-type: size;
    }

    .rceStreamAspectBox {
        position: relative;
        aspect-ratio: 16 / 9;
        /* the largest 16:9 box that fits the stage's height, minus the ~80px the runtime and
           controls rows below it take up, capped at the stage's width */
        width: min(100%, calc((100cqh - 80px) * 16 / 9));
        background-color: black;
        overflow: hidden;
    }

    #rceStreamVideo {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
    }

    .rceStreamPlaceholder {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        color: white;
        text-align: center;
        padding: 10px;
    }

    .rceStreamPlaceholderHint {
        opacity: 0.7;
        font-size: 0.9em;
    }

    .rceStreamControls {
        display: flex;
        justify-content: center;
        padding: 8px 10px;
    }

    .buttonIcon {
        display: inline-flex;
        align-items: center;
    }

    .rceStreamRuntime {
        /* matches the aspect box's width so the bar lines up with the video above it */
        width: min(100%, calc((100cqh - 80px) * 16 / 9));
        box-sizing: border-box;
        padding: 4px 10px 0;
    }

    .rceStreamRuntimeLabel {
        opacity: 0.7;
        font-size: 0.85em;
    }

    .rceStreamRuntimeBarTrack {
        margin-top: 2px;
        width: 100%;
        height: 3px;
        background-color: var(--vscode-scrollbarSlider-background);
        border-radius: 2px;
        overflow: hidden;
    }

    .rceStreamRuntimeBarFill {
        height: 100%;
        background-color: var(--vscode-progressBar-background);
    }
</style>

{#if rceStreamDeviceName !== undefined}
    <div id="rceStreamContainer">
        <div id="rceStreamHeader">
            <span id="rceStreamDeviceName">{rceStreamDeviceName}</span>
            <span id="rceStreamStatusLabel">{rceStreamStatusLabel}</span>
            {#if rceStreamStatus !== 'stopped'}
                {#if rceStreamDeviceType === 'tv'}
                    <vscode-button appearance="icon" title="Press the Power button on the device" disabled={powerKeyInFlight} on:click={pressRceStreamPower}>
                        <Plug />
                    </vscode-button>
                {/if}
                <vscode-button appearance="icon" title={rceStreamMuted ? 'Unmute' : 'Mute'} on:click={toggleRceStreamMute}>
                    {#if rceStreamMuted}
                        <Mute />
                    {:else}
                        <Unmute />
                    {/if}
                </vscode-button>
            {/if}
            {#if showCloseButton}
                <!-- with nothing streaming there is nothing to "stop", but this is still the sidebar's
                    only in-view exit back to the LAN screenshot flow, so it stays with a tooltip
                    matching what it does -->
                <vscode-button appearance="icon" title={rceStreamStatus === 'stopped' ? 'Close' : 'Stop'} on:click={stopRceStream}>
                    {#if rceStreamStatus === 'stopped'}
                        <Close />
                    {:else}
                        <DebugStop />
                    {/if}
                </vscode-button>
            {/if}
        </div>
        {#if rceStreamError}
            <div class="rceStreamErrorBanner">
                <span>{rceStreamError}</span>
                <vscode-button appearance="secondary" on:click={retryRceStream}>Retry</vscode-button>
            </div>
        {/if}
        <div class="rceStreamStage">
            <div class="rceStreamAspectBox">
                <!-- svelte-ignore a11y-media-has-caption -->
                <video id="rceStreamVideo" bind:this={rceVideoElement} autoplay playsinline muted={rceStreamMuted}></video>
                {#if rceStreamStatus === 'stopped' && !deviceStartRequested}
                    <div class="rceStreamPlaceholder">
                        <span>{rceStreamStoppedMessage}</span>
                        <span class="rceStreamPlaceholderHint">The stream will resume automatically when the device starts</span>
                    </div>
                {:else if rceStreamStatus !== 'streaming'}
                    <div class="rceStreamPlaceholder">
                        <span>{rceStreamStatusLabel}</span>
                    </div>
                {/if}
            </div>
            {#if rceDeviceRuntimeInfo}
                <div class="rceStreamRuntime">
                    <span class="rceStreamRuntimeLabel">{rceDeviceRuntimeInfo.label}</span>
                    <div class="rceStreamRuntimeBarTrack">
                        <div class="rceStreamRuntimeBarFill" style="width: {rceDeviceRuntimeInfo.percent}%"></div>
                    </div>
                </div>
            {/if}
            <div class="rceStreamControls">
                {#if rceStreamStatus === 'stopped' && !deviceStartRequested}
                    <vscode-button appearance="primary" disabled={deviceActionInFlight} on:click={startStreamedDevice}>
                        <span slot="start" class="buttonIcon"><Play /></span>
                        Start Device
                    </vscode-button>
                {:else}
                    <vscode-button disabled={deviceActionInFlight} on:click={stopStreamedDevice}>
                        <span slot="start" class="buttonIcon"><DebugStop /></span>
                        Stop Device
                    </vscode-button>
                {/if}
            </div>
        </div>
        {#if deviceActionError}
            <div class="rceStreamErrorBanner">
                <span>{deviceActionError}</span>
            </div>
        {/if}
    </div>
{/if}
