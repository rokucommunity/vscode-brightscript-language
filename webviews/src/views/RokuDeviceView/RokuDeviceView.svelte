<!-- svelte-ignore a11y-click-events-have-key-events -->
<script lang="ts">
    import { onDestroy } from 'svelte';
    import { intermediary } from '../../ExtensionIntermediary';
    import ConnectToDeviceButton from '../../shared/ConnectToDeviceButton.svelte';
    import { ViewProviderId } from '../../../../src/viewProviders/ViewProviderId';
    import { ViewProviderEvent } from '../../../../src/viewProviders/ViewProviderEvent';
    import { ViewProviderCommand } from '../../../../src/viewProviders/ViewProviderCommand';
    import type { AppUIResponseChild, AppUIResponse } from 'roku-test-automation';
    import { utils as rtaUtils } from 'roku-test-automation/dist/utils';
    import { VscodeCommand } from '../../../../src/commands/VscodeCommand';
    import { utils } from '../../utils';
    import RceStreamView from '../../shared/RceStreamView.svelte';
    import { copyImageToClipboard, copyRceStreamScreenshot, reportScreenshotMessage, requestScreenshot as requestScreenshotFromHost } from '../../shared/screenshotClipboard';

    window.vscode = acquireVsCodeApi();

    let deviceAvailable = false;
    intermediary.observeEvent(ViewProviderEvent.onDeviceAvailabilityChange, (message) => {
        deviceAvailable = message.context.deviceAvailable;
        //the held image may be of a previous device, so every availability change starts over
        resetScreenshotState();
        requestScreenshot();
    });

    //Roku Cloud Emulator video stream mode: entered when the extension host negotiates a Janus
    //session and posts its offer here; replaces the screenshot view until Stop is clicked. The
    //stream itself (peer connection, header, error banner) lives in the shared RceStreamView
    //component - this view only tracks whether stream mode is active so it can route between the
    //stream and the screenshot/setup views.
    let rceStreamActive = false;
    let rceStreamView: RceStreamView;

    intermediary.observeEvent(ViewProviderEvent.onRceStreamConnecting, () => {
        rceStreamActive = true;
        resetScreenshotState();
    });

    intermediary.observeEvent(ViewProviderEvent.onRceStreamError, () => {
        //an early failure (before onRceStreamConnecting reached this webview instance) still enters
        //stream mode so RceStreamView has somewhere to show the error
        rceStreamActive = true;
        resetScreenshotState();
    });

    function onRceStreamStopped() {
        rceStreamActive = false;
        if (enableScreenshotCaptureAutoRefresh) {
            requestScreenshot();
        }
    }

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

    let currentScreenshot: Blob | undefined;

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
            clearTimeout(nextCaptureTimer);
            nextCaptureTimer = undefined;
        } else if (name === VscodeCommand.rokuDeviceViewResumeScreenshotCapture) {
            enableScreenshotCaptureAutoRefresh = true;
            await requestScreenshot();
        } else if (name === VscodeCommand.rokuDeviceViewRefreshScreenshot) {
            await requestScreenshot();
        } else if (name === VscodeCommand.rokuDeviceViewCopyScreenshot) {
            await copyScreenshot();
        }
    });

    async function copyScreenshot() {
        if (rceStreamActive) {
            await copyRceStreamScreenshot(() => rceStreamView.captureFrame());
            return;
        }

        if (!currentScreenshot) {
            // Joins the capture already in flight, or starts one
            await requestScreenshot();
        }

        const screenshotToCopy = currentScreenshot;
        if (!screenshotToCopy) {
            reportScreenshotMessage('error', lastCaptureFailureMessage ? `Unable to copy a screenshot: ${lastCaptureFailureMessage}` : 'No screenshot is available to copy yet.');
            return;
        }
        await copyImageToClipboard(screenshotToCopy);
    }

    const defaultCaptureDelayMs = 500;
    const retryCaptureDelayMs = 200;

    //the capture in progress, shared so a copy can join it rather than start a competing one
    let inFlightCapture: Promise<void> | undefined;
    //bumped whenever in-flight work is abandoned (stream mode, device gone) so its result is discarded
    let captureSequence = 0;
    let nextCaptureTimer: ReturnType<typeof setTimeout> | undefined;
    let lastCaptureFailureMessage: string | undefined;

    onDestroy(() => {
        abandonCaptures();
    });

    function abandonCaptures() {
        captureSequence++;
        inFlightCapture = undefined;
        clearTimeout(nextCaptureTimer);
        nextCaptureTimer = undefined;
    }

    function resetScreenshotState() {
        abandonCaptures();
        currentScreenshot = undefined;
        URL.revokeObjectURL(screenshotUrl);
        screenshotUrl = '';
    }

    function scheduleNextCapture(delayMs: number) {
        clearTimeout(nextCaptureTimer);
        nextCaptureTimer = setTimeout(() => {
            nextCaptureTimer = undefined;
            void requestScreenshot();
        }, delayMs);
    }

    function requestScreenshot(): Promise<void> {
        if (!deviceAvailable || rceStreamActive) {
            return Promise.resolve();
        }
        if (inFlightCapture) {
            return inFlightCapture;
        }

        clearTimeout(nextCaptureTimer);
        nextCaptureTimer = undefined;
        const sequence = ++captureSequence;
        const capture = captureScreenshot(sequence).finally(() => {
            if (captureSequence === sequence) {
                inFlightCapture = undefined;
            }
        });
        inFlightCapture = capture;
        return capture;
    }

    async function captureScreenshot(sequence: number) {
        try {
            const result = await requestScreenshotFromHost({ streaming: false });
            if (sequence !== captureSequence) {
                return;
            }

            lastCaptureFailureMessage = result.success ? undefined : result.message;
            if (result.success) {
                if (isInspectingNodes) {
                    const appUiResponse = await intermediary.getAppUI();
                    if (sequence !== captureSequence) {
                        return;
                    }
                    lastAppUiResponse = appUiResponse;
                }

                currentScreenshot = result.blob;
                const newScreenshotUrl = URL.createObjectURL(currentScreenshot);
                URL.revokeObjectURL(screenshotUrl);
                screenshotUrl = newScreenshotUrl;

                if (enableScreenshotCaptureAutoRefresh) {
                    scheduleNextCapture(result.nextCaptureDelay ?? defaultCaptureDelayMs);
                }
            } else {
                scheduleNextCapture(retryCaptureDelayMs);
            }
        } catch(e) {
            console.error('Error requesting screenshot', e);

            if (sequence === captureSequence) {
                scheduleNextCapture(retryCaptureDelayMs);
            }
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

    // Required by any view so we can know that the view is ready to receive messages
    intermediary.sendViewReady();
</script>

<style>
    #container {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
    }

    /* reserves exactly the space left over in the column for the screenshot/connect box, top-docked
       like RceStreamView's stage so any leftover space lands below it; container-type: size feeds
       the cq calc below */
    .screenshotStage {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        container-type: size;
    }

    #screenshotContainer {
        --overlayStrokeSize: 3px;
        --overlayColor: orange;
        position: relative;
        aspect-ratio: 16 / 9;
        /* the largest 16:9 box that fits the stage's height, capped at its width */
        width: min(100%, calc(100cqh * 16 / 9));
        background-color: black;
        overflow: hidden;
    }

    #screenshot {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
    }

    .screenshotPlaceholder {
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        text-align: center;
        padding: 10px;
    }

    .connectDeviceBox {
        aspect-ratio: 16 / 9;
        /* the largest 16:9 box that fits the stage's height minus the button row below it */
        width: min(100%, calc((100cqh - 40px) * 16 / 9));
        background-color: black;
    }

    .connectDeviceButtonRow {
        display: flex;
        justify-content: center;
        padding: 8px 10px;
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
</style>

<svelte:window on:keydown={onKeydown} />
<div id="container" on:mouseenter="{onMouseEnter}" on:mouseleave="{onMouseLeave}">
    <RceStreamView bind:this={rceStreamView} showCloseButton={true} on:stopped={onRceStreamStopped} />
    {#if rceStreamActive}
        <!-- RceStreamView above renders the stream; nothing else shows in stream mode -->
    {:else if deviceAvailable}
    <div class="screenshotStage">
        <div
            id="screenshotContainer"
            class:isInspectingNodes="{isInspectingNodes}"
            bind:clientWidth={screenshotContainerWidth}
            bind:clientHeight={screenshotContainerHeight}
            on:mousemove={onImageMouseMove}
            on:mousedown={onMouseDown}
            data-vscode-context={'{"preventDefaultContextMenuItems": true}'}>

            <div class:hide={!mouseIsOverView} id="nodeSelectionCursor" style="left: {nodeSelectionCursorLeft}px; top: {nodeSelectionCursorTop}px;"></div>
            <div class:hide={!focusedNode} id="nodeOutline" style="left: {nodeLeft}px; top: {nodeTop}px; width: {nodeWidth}px; height: {nodeHeight}px"></div>

            <!-- only show image if we have a url to avoid showing as broken image -->
            {#if screenshotUrl}
                <img
                    id="screenshot"
                    alt="Screenshot from Roku device"
                    src="{screenshotUrl}" />
            {:else}
                <div class="screenshotPlaceholder">Waiting for a screenshot</div>
            {/if}

        </div>
    </div>
    {:else}
        <div class="screenshotStage">
            <div class="connectDeviceBox"></div>
            <div class="connectDeviceButtonRow">
                <ConnectToDeviceButton showCaption={false} />
            </div>
        </div>
    {/if}
</div>

{#if focusedNode && !rceStreamActive}
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
