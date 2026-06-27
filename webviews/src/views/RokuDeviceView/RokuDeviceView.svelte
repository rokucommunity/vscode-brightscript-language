<!-- svelte-ignore a11y-click-events-have-key-events -->
<script lang="ts">
    import { intermediary } from '../../ExtensionIntermediary';
    import OdcSetManualIpAddress from '../../shared/OdcSetManualIpAddress.svelte';
    import { ViewProviderId } from '../../../../src/viewProviders/ViewProviderId';
    import { ViewProviderEvent } from '../../../../src/viewProviders/ViewProviderEvent';
    import { ViewProviderCommand } from '../../../../src/viewProviders/ViewProviderCommand';
    import type { AppUIResponseChild, AppUIResponse } from 'roku-test-automation';
    import { utils as rtaUtils } from 'roku-test-automation/client/dist/utils';
    import { VscodeCommand } from '../../../../src/commands/VscodeCommand';
    import { utils } from '../../utils';

    window.vscode = acquireVsCodeApi();

    let deviceAvailable = false;
    intermediary.observeEvent(ViewProviderEvent.onDeviceAvailabilityChange, (message) => {
        deviceAvailable = message.context.deviceAvailable;
        requestScreenshot();
    });

    let shouldRepositionNodeInfo = false;

    let screenshotUrl = '';

    let isInspectingNodes = false;
    $:{
        intermediary.setVscodeContext('brightscript.rokuDeviceView.isInspectingNodes', isInspectingNodes, ViewProviderId.sceneGraphInspectorView);
    }

    let enableScreenshotCaptureAutoRefresh = utils.getStorageBooleanValue('enableScreenshotCaptureAutoRefresh', true);
    $:{
        intermediary.setVscodeContext('brightscript.rokuDeviceView.enableScreenshotCaptureAutoRefresh', enableScreenshotCaptureAutoRefresh);
        utils.setStorageValue('enableScreenshotCaptureAutoRefresh', enableScreenshotCaptureAutoRefresh);
    }

    // Which source the view renders: live device screenshots (default) or a WebRTC stream
    type RokuDeviceViewMode = 'screenshot' | 'webrtc';
    let viewMode: RokuDeviceViewMode = utils.getStorageValue('rokuDeviceViewMode', 'screenshot') as RokuDeviceViewMode;
    $: utils.setStorageValue('rokuDeviceViewMode', viewMode);

    function onViewModeChange() {
        if (viewMode === 'screenshot') {
            // Leaving WebRTC mode: tear down the stream and resume screenshot capture
            stopWebrtc();
            void requestScreenshot();
        }
        // Entering WebRTC mode: the screenshot loop is gated on viewMode and stops on its own
    }

    // We can't observe the image height directly so we observe the surrounding div instead
    let screenshotContainerWidth = 0;
    let screenshotContainerHeight = 0;
    $: {
        const screenshot = document.getElementById('screenshot');

        // Need 2nd and 3rd conditions to trigger it to update
        if (screenshot && screenshotContainerWidth && screenshotContainerHeight) {
            imageWidth = screenshot.clientWidth;
            imageHeight = screenshot.clientHeight;
        }
    }

    let imageWidth = 0;
    let imageHeight = 0;


    let imageSizeAdjust = 1;
    $: {
        if (imageWidth) {
            imageSizeAdjust = imageWidth / 1920;
        }
    }

    let mouseIsOverView = false;
    let lastFocusedNodeKeyPath: string;
    let focusedNode: AppUIResponseChild | null;
    let currentPositionMatches: AppUIResponseChild[] = [];
    let currentPositionMatchesIndex = 0;

    $: {
        if (mouseIsOverView && isInspectingNodes) {
            if (focusedNode && lastFocusedNodeKeyPath !== focusedNode.keyPath) {
                lastFocusedNodeKeyPath = focusedNode.keyPath;
                sendOnNodeFocusedEvent(focusedNode);
            }
        }
    }

    function sendOnNodeFocusedEvent(node: AppUIResponseChild, shouldOpen = false) {
        if (!shouldOpen) {
            node = {
                // Optimization since we only need the keyPath for linking with the sceneGraphInspectorView unless we are opening that node
                base: node.base,
                keyPath: node.keyPath
            } as any;
        }

        const message = intermediary.createEventMessage(ViewProviderEvent.onNodeFocused, {
            node: node,
            shouldOpen: shouldOpen
        });
        intermediary.sendMessageToWebviews(ViewProviderId.sceneGraphInspectorView, message);
    }

    intermediary.observeEvent(ViewProviderEvent.onNodeFocused, (message) => {
        currentPositionMatches = [];
        focusedNode = message.context.node;
    });

    intermediary.observeEvent(ViewProviderEvent.onStoredAppUIUpdated, async (message) => {
        lastAppUiResponse = await intermediary.getStoredAppUI();
    });

    let nodeSelectionCursorLeft = 0;
    let nodeSelectionCursorTop = 0;

    let nodeTop: number;
    $: {
        nodeTop = focusedNode?.sceneRect.y * imageSizeAdjust;
    }

    let nodeLeft: number;
    $: {
        nodeLeft = focusedNode?.sceneRect.x * imageSizeAdjust;
    }

    let nodeWidth: number;
    $: {
        nodeWidth = focusedNode?.sceneRect.width * imageSizeAdjust;
    }

    let nodeHeight: number;
    $: {
        nodeHeight = focusedNode?.sceneRect.height * imageSizeAdjust;
    }

    let lastFindNodesAtLocationCoordinates;

    let lastAppUiResponse: AppUIResponse;

    function getOffset(obj){
        let left = obj.offsetLeft;
        let top = obj.offsetTop;

        while (obj = obj.offsetParent) {
            left += obj.offsetLeft;
            top += obj.offsetTop;
        }

        return {left, top};
    }

    async function onImageMouseMove(event) {
        if (!isInspectingNodes || !lastAppUiResponse) {
            return;
        }

        const offset = getOffset(this);
        const imageX = event.x - offset.left;
        const imageY = event.y - offset.top;

        // If we are in the bottom half of the image we want to reposition the node info to the top
        shouldRepositionNodeInfo = imageY > imageHeight / 2;

        nodeSelectionCursorLeft = imageX;
        nodeSelectionCursorTop = imageY;

        const x = Math.round(imageX / imageWidth * 1920);
        const y = Math.round(imageY / imageHeight * 1080);

        if (lastFindNodesAtLocationCoordinates && lastFindNodesAtLocationCoordinates.x === x && lastFindNodesAtLocationCoordinates.y === y) {
            return;
        }

        lastFindNodesAtLocationCoordinates = {
            x: x,
            y: y
        };
        // console.log(lastAppUiResponse);
        // console.log('findNodesAtLocation', x, y);

        const {matches} = await rtaUtils.findNodesAtLocation({appUIResponse: lastAppUiResponse, x: x, y: y});
        // console.log('matches', matches);

        currentPositionMatches = matches;

        currentPositionMatchesIndex = 0;

        focusedNode = currentPositionMatches[currentPositionMatchesIndex];
    }

    function onMouseEnter() {
        mouseIsOverView = true;
    }

    function onMouseLeave() {
        mouseIsOverView = false;
    }

    function onMouseDown() {
        // We want to send one last event that will also trigger the node
        if(isInspectingNodes && focusedNode) {
            sendOnNodeFocusedEvent(focusedNode, true);
        }

        isInspectingNodes = false;
    }

    let currentScreenshot: Blob;

    intermediary.observeEvent(ViewProviderEvent.onVscodeCommandReceived, async (message) => {
        const name = message.context.commandName;
        if (name === VscodeCommand.rokuDeviceViewEnableNodeInspector) {
            isInspectingNodes = true;

            if (!enableScreenshotCaptureAutoRefresh) {

                // We only need to request screenshot if we are not already capturing
                await requestScreenshot();
            }
        } else if (name === VscodeCommand.rokuDeviceViewDisableNodeInspector) {
            isInspectingNodes = false;
        } else if (name === VscodeCommand.rokuDeviceViewPauseScreenshotCapture) {
            enableScreenshotCaptureAutoRefresh = false;
        } else if (name === VscodeCommand.rokuDeviceViewResumeScreenshotCapture) {
            enableScreenshotCaptureAutoRefresh = true;
            await requestScreenshot();
        } else if (name === VscodeCommand.rokuDeviceViewRefreshScreenshot) {
            await requestScreenshot();
        } else if (name === VscodeCommand.rokuDeviceViewCopyScreenshot) {
            if(!currentScreenshot) {
                await requestScreenshot();
            }

            // Need time for the DOM to become focused before clipboard seems to work
            setTimeout(async () => {
                const clipboardItem = new ClipboardItem({
                    [currentScreenshot.type]: currentScreenshot
                });
                await navigator.clipboard.write([clipboardItem]);
            }, 100);
        }
    });

    let currentlyCapturingScreenshot = false;
    async function requestScreenshot() {
        if (viewMode !== 'screenshot' || !deviceAvailable || currentlyCapturingScreenshot) {
            return;
        }

        try {
            currentlyCapturingScreenshot = true;
            const {success, arrayBuffer} = await intermediary.sendCommand(ViewProviderCommand.getScreenshot);
            currentlyCapturingScreenshot = false;

            if (success) {
                if (isInspectingNodes) {
                    lastAppUiResponse = await intermediary.getAppUI();
                }

                currentScreenshot = new Blob(
                    [new Uint8Array(arrayBuffer)],
                    { type: 'image/png' } // jpg isn't supported for clipboard and png seems to work for both so ¯\_(ツ)_/¯
                );
                const newScreenshotUrl = URL.createObjectURL(currentScreenshot);
                URL.revokeObjectURL(screenshotUrl);
                screenshotUrl = newScreenshotUrl;

                if (enableScreenshotCaptureAutoRefresh) {
                    requestScreenshot();
                }
            } else {
                setTimeout(() => {
                    requestScreenshot();
                }, 200);
            }
        } catch(e) {
            currentlyCapturingScreenshot = false;
            console.error('Error requesting screenshot', e);

            setTimeout(() => {
                requestScreenshot();
            }, 200);
        }
    }

    function onKeydown(event) {
        const key = event.key;
        switch (key) {
            case 'ArrowUp':
            case 'ArrowLeft':
                if (currentPositionMatches) {
                    if (currentPositionMatchesIndex > 0) {
                        currentPositionMatchesIndex--;
                        focusedNode = currentPositionMatches[currentPositionMatchesIndex];
                    }

                    event.preventDefault();
                }
                break;
            case 'ArrowDown':
            case 'ArrowRight':
                if (currentPositionMatches) {
                    if (currentPositionMatchesIndex < currentPositionMatches.length - 1) {
                        currentPositionMatchesIndex++;
                        focusedNode = currentPositionMatches[currentPositionMatchesIndex];
                    }

                    event.preventDefault();
                }
                break;
            case 'Escape':
                isInspectingNodes = false;
                break;
        }
    }

    // #region WebRTC stream prototype
    // Receives a WebRTC stream via WHEP (WebRTC-HTTP Egress Protocol): POST an SDP offer
    // to the URL, get an SDP answer back, then render the resulting track in a <video>.
    // This runs entirely in the webview's Chromium context (no extension host involvement).
    let webrtcStreamUrl = utils.getStorageValue('webrtcStreamUrl', '');
    $: utils.setStorageValue('webrtcStreamUrl', webrtcStreamUrl);

    let isWebrtcActive = false;
    let webrtcStatusText = '';
    let videoElement: HTMLVideoElement;
    let peerConnection: RTCPeerConnection | null = null;
    let whepResourceUrl: string | null = null;

    // Wait for ICE gathering to finish so the offer carries all candidates (non-trickle WHEP)
    function waitForIceGathering(connection: RTCPeerConnection) {
        return new Promise<void>((resolve) => {
            if (connection.iceGatheringState === 'complete') {
                resolve();
                return;
            }
            const onStateChange = () => {
                if (connection.iceGatheringState === 'complete') {
                    connection.removeEventListener('icegatheringstatechange', onStateChange);
                    resolve();
                }
            };
            connection.addEventListener('icegatheringstatechange', onStateChange);
            // Fallback in case gathering stalls behind a slow/unreachable STUN server
            setTimeout(resolve, 2000);
        });
    }

    async function startWebrtc() {
        if (isWebrtcActive) {
            return;
        }
        if (!webrtcStreamUrl) {
            webrtcStatusText = 'Enter a WHEP stream URL first';
            return;
        }

        try {
            webrtcStatusText = 'Connecting…';
            const connection = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            peerConnection = connection;

            // We only want to receive media, not send any
            connection.addTransceiver('video', { direction: 'recvonly' });
            connection.addTransceiver('audio', { direction: 'recvonly' });

            connection.ontrack = (event) => {
                if (videoElement && event.streams[0]) {
                    videoElement.srcObject = event.streams[0];
                }
            };

            connection.onconnectionstatechange = () => {
                webrtcStatusText = connection.connectionState;
                if (['failed', 'disconnected', 'closed'].includes(connection.connectionState)) {
                    stopWebrtc();
                }
            };

            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);
            await waitForIceGathering(connection);

            const response = await fetch(webrtcStreamUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/sdp' },
                body: connection.localDescription.sdp
            });

            if (!response.ok) {
                throw new Error(`WHEP request failed: ${response.status} ${response.statusText}`);
            }

            // WHEP returns a resource URL we DELETE later to tear the session down cleanly
            const location = response.headers.get('Location');
            if (location) {
                whepResourceUrl = new URL(location, webrtcStreamUrl).toString();
            }

            const answerSdp = await response.text();
            await connection.setRemoteDescription({ type: 'answer', sdp: answerSdp });

            isWebrtcActive = true;
            webrtcStatusText = 'Streaming';
        } catch (e) {
            webrtcStatusText = `Error: ${e.message}`;
            console.error('WebRTC start error', e);
            stopWebrtc();
        }
    }

    function stopWebrtc() {
        if (whepResourceUrl) {
            // Best-effort teardown of the server-side WHEP session
            void fetch(whepResourceUrl, { method: 'DELETE' }).catch(() => {});
            whepResourceUrl = null;
        }
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        if (videoElement) {
            videoElement.srcObject = null;
        }
        isWebrtcActive = false;
    }
    // #endregion

    // Required by any view so we can know that the view is ready to receive messages
    intermediary.sendViewReady();
</script>

<style>
    #container {
        width: 100%;
        height: 100%;
    }

    img {
        max-width: 100vw;
        max-height: 100vh;
    }

    #screenshotContainer {
        margin-left: auto;
        margin-right: auto;
        --overlayStrokeSize: 3px;
        --overlayColor: orange;
        position: relative;
    }

    .isInspectingNodes {
        cursor: crosshair;
    }

    #screenshotContainer div {
        position: absolute;
    }

    #nodeInfo {
        right: 0;
        bottom: 0;
        position: absolute;
        background-color: #00000055;
        padding: 10px;
        text-align: right;
        color: #FFFFFF;
    }

    #nodeInfo.reposition {
        bottom: auto;
        top: 0;
    }

    #nodeInfo b {
        color: #AAAAAA;
    }

    #nodeOutline {
        outline: var(--overlayStrokeSize) var(--overlayColor) solid;
        box-shadow: 2px 2px black;
    }

    .isInspectingNodes #nodeSelectionCursor {
        position: absolute;
        width: 6px;
        height: 6px;
        background-color: black;
        margin-left: -3px;
        margin-top: -3px;
    }

    .note {
        font-size: 9px;
    }

    .hide {
        display: none;
    }

    #modeBar {
        display: flex;
        gap: 6px;
        align-items: center;
        padding: 6px 10px;
    }

    #webrtcControls {
        display: flex;
        gap: 6px;
        align-items: center;
        padding: 0 10px 6px;
    }

    #webrtcControls input {
        flex: 1 1 auto;
        min-width: 0;
    }

    #webrtcControls .webrtcStatus {
        font-size: 11px;
        opacity: 0.8;
        white-space: nowrap;
    }

    #webrtcVideo {
        display: block;
        width: 100%;
        max-width: 100vw;
        max-height: 100vh;
    }
</style>

<svelte:window on:keydown={onKeydown} />
<div id="container" on:mouseenter="{onMouseEnter}" on:mouseleave="{onMouseLeave}">
    <div id="modeBar">
        <label for="deviceViewMode">Mode:</label>
        <!-- svelte-ignore a11y-no-onchange -->
        <select id="deviceViewMode" bind:value={viewMode} on:change={onViewModeChange}>
            <option value="screenshot">Screenshot</option>
            <option value="webrtc">WebRTC</option>
        </select>
    </div>

    {#if viewMode === 'webrtc'}
        <div id="webrtcControls">
            <input
                type="text"
                placeholder="WHEP stream URL (e.g. http://host:8889/mystream/whep)"
                bind:value={webrtcStreamUrl}
                disabled={isWebrtcActive} />
            {#if isWebrtcActive}
                <button on:click={stopWebrtc}>Stop</button>
            {:else}
                <button on:click={startWebrtc}>Start</button>
            {/if}
            {#if webrtcStatusText}
                <span class="webrtcStatus">{webrtcStatusText}</span>
            {/if}
        </div>

        <!-- svelte-ignore a11y-media-has-caption -->
        <video
            bind:this={videoElement}
            class:hide={!isWebrtcActive}
            id="webrtcVideo"
            autoplay
            playsinline
            muted
            controls>
        </video>
    {:else if deviceAvailable}
    <div
        id="screenshotContainer"
        class:isInspectingNodes="{isInspectingNodes}"
        bind:clientWidth={screenshotContainerWidth}
        bind:clientHeight={screenshotContainerHeight}
        on:mousemove={onImageMouseMove}
        on:mousedown={onMouseDown}
        data-vscode-context={'{"preventDefaultContextMenuItems": true}'}>

        <div class:hide={!mouseIsOverView} id="nodeSelectionCursor" style="left: {nodeSelectionCursorLeft}px; top: {nodeSelectionCursorTop}px;" />
        <div class:hide={!focusedNode} id="nodeOutline" style="left: {nodeLeft}px; top: {nodeTop}px; width: {nodeWidth}px; height: {nodeHeight}px" />

        <!-- only show image if we have a url to avoid showing as broken image -->
        {#if screenshotUrl}
            <img
                id="screenshot"
                alt="Screenshot from Roku device"
                src="{screenshotUrl}" />
        {/if}

    </div>
    {:else}
        <div style="margin: 0 10px">
            <OdcSetManualIpAddress />
        </div>
    {/if}
</div>

{#if focusedNode}
    <div id="nodeInfo" class:reposition={shouldRepositionNodeInfo}>
        {#if currentPositionMatches.length}
            {currentPositionMatchesIndex + 1} of {currentPositionMatches.length} <span class="note">(use arrow keys to see others)</span><br>
        {/if}
        {#if focusedNode.keyPath}
            {focusedNode.keyPath}<br>
        {/if}
        <b>subtype:</b> {focusedNode.subtype},
        {#if focusedNode.id}<b>id:</b> {focusedNode.id}{/if}
        <b>x:</b> {focusedNode.sceneRect.x},
        <b>y:</b> {focusedNode.sceneRect.y},
        <b>width:</b> {focusedNode.sceneRect.width},
        <b>height:</b> {focusedNode.sceneRect.height}
    </div>
{/if}
