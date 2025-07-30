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
        if (!deviceAvailable || currentlyCapturingScreenshot) {
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
    {#if deviceAvailable}
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
    <div id="nodeInfo">
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
