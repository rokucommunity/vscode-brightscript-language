<!-- svelte-ignore a11y-click-events-have-key-events -->
<script lang="ts">
    import type { ODC } from 'roku-test-automation';
    import { odc, intermediary } from '../../ExtensionIntermediary';
    import OdcSetManualIpAddress from '../../shared/OdcSetManualIpAddress.svelte';

    window.vscode = acquireVsCodeApi();

    let deviceAvailable = false;
    intermediary.observeEvent('onDeviceAvailabilityChange', (message) => {
        deviceAvailable = message.deviceAvailable;

        enableScreenshotCapture = true
        requestScreenshot();
    });

    let wasRunningScreenshotCaptureBeforeInspect = false;

    let enableScreenshotCapture = false;
    $:{
        intermediary.setVscodeContext('brightscript.rokuDeviceView.enableScreenshotCapture', enableScreenshotCapture);
    }

    let screenshotUrl = '';

    let screenshotOutOfDate = false;

    let isInspectingNodes = false;
    $:{
        if (!isInspectingNodes) {
            enableScreenshotCapture = wasRunningScreenshotCaptureBeforeInspect;
            requestScreenshot();
        }
        intermediary.setVscodeContext('brightscript.rokuDeviceView.isInspectingNodes', isInspectingNodes);
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
            imageSizeAdjust = imageWidth / 1920
        }
    }

    let mouseIsOverView = false;
    let focusedNodeTree: ODC.NodeTree | null;
    $: {
        if (mouseIsOverView && isInspectingNodes) {
            let nodeTree = undefined
            if (focusedNodeTree) {
                nodeTree = {
                    // Optimization since we only need the reference for linking with the sceneGraphInspectorView
                    ref: focusedNodeTree.ref
                }
            }
            intermediary.sendMessageToWebviews('sceneGraphInspectorView', {
                event: 'onNodeTreeFocused',
                nodeTree: nodeTree
            });
        }
    }

    intermediary.observeEvent('onNodeTreeFocused', (message) => {
        focusedNodeTree = message.nodeTree;
    });

    intermediary.observeEvent('storedNodeReferencesUpdated', (message) => {
        focusedNodeTree = null;
    });

    let nodeSelectionCursorLeft = 0;
    let nodeSelectionCursorTop = 0;

    let nodeTop: number;
    $: {
        nodeTop = focusedNodeTree?.sceneRect.y * imageSizeAdjust;
    }

    let nodeLeft: number;
    $: {
        nodeLeft = focusedNodeTree?.sceneRect.x * imageSizeAdjust;
    }

    let nodeWidth: number;
    $: {
        nodeWidth = focusedNodeTree?.sceneRect.width * imageSizeAdjust;
    }

    let nodeHeight: number;
    $: {
        nodeHeight = focusedNodeTree?.sceneRect.height * imageSizeAdjust;
    }

    function getOffset(obj){
        let left = obj.offsetLeft;
        let top = obj.offsetTop;

        while (obj = obj.offsetParent) {
            left += obj.offsetLeft;
            top += obj.offsetTop;
        }

        return {left, top};
    }

    let lastFindNodesAtLocationArgs;
    let currentlyRunningFindNodesAtLocation = false;
    async function onImageMouseMove(event) {
        if (!isInspectingNodes) {
            return;
        }

        const offset = getOffset(this);
        const imageX = event.x - offset.left;
        const imageY = event.y - offset.top;

        nodeSelectionCursorLeft = imageX;
        nodeSelectionCursorTop = imageY;

        const x = Math.round(imageX / imageWidth * 1920);
        const y = Math.round(imageY / imageHeight * 1080);
        const args = {x: x, y: y}

        if (currentlyRunningFindNodesAtLocation) {
            lastFindNodesAtLocationArgs = args;
            return;
        }

        currentlyRunningFindNodesAtLocation = true;
        await findNodesAtLocation(args);
        currentlyRunningFindNodesAtLocation = false;

        if (lastFindNodesAtLocationArgs) {
            if (lastFindNodesAtLocationArgs.x !== args.x || lastFindNodesAtLocationArgs.y !== args.y) {
                findNodesAtLocation(lastFindNodesAtLocationArgs);
            }
            lastFindNodesAtLocationArgs = undefined;
        }
    }

    async function findNodesAtLocation(args) {
        try {
            const result = await odc.findNodesAtLocation(args);
            focusedNodeTree = result.matches[0];
        } catch(e) {
            console.error(e);
        }
    }

    function onMouseEnter() {
        mouseIsOverView = true;
    }

    function onMouseLeave() {
        mouseIsOverView = false;
    }

    function onMouseDown() {
        isInspectingNodes = false;
    }

    intermediary.observeEvent('onVscodeCommandReceived', async (message) => {
        const name = message.commandName;
        if (name === 'extension.brightscript.rokuDeviceView.inspectNodes') {
            wasRunningScreenshotCaptureBeforeInspect = enableScreenshotCapture;
            isInspectingNodes = true;
            enableScreenshotCapture = true;
            requestScreenshot();
            enableScreenshotCapture = false;

            // IMPROVEMENT in the future we could either do calculations for finding nodes at location locally or switch to only telling SG inspector view to refresh
            // We also want to update the node information to current state
            await odc.storeNodeReferences({
                includeNodeCountInfo: true,
                includeArrayGridChildren: true,
                includeBoundingRectInfo: true
            });

        } else if (name === 'extension.brightscript.rokuDeviceView.pauseScreenshotCapture') {
            enableScreenshotCapture = false;
        } else if (name === 'extension.brightscript.rokuDeviceView.resumeScreenshotCapture') {
            isInspectingNodes = false;
            enableScreenshotCapture = true;
            requestScreenshot();
        } else if (name === 'extension.brightscript.rokuDeviceView.refreshScreenshot') {
            enableScreenshotCapture = true;
            requestScreenshot();
            enableScreenshotCapture = false;

            if (isInspectingNodes) {
                // IMPROVEMENT in the future we could either do calculations for finding nodes at location locally or switch to only telling SG inspector view to refresh
                // We also want to update the node information to current state
                odc.storeNodeReferences({
                    includeNodeCountInfo: true,
                    includeArrayGridChildren: true,
                    includeBoundingRectInfo: true
                });
            }
        }
    });

    let screenshotOutOfDateTimeOut;
    let currentlyCapturingScreenshot = false;
    async function requestScreenshot() {
        if (!enableScreenshotCapture || currentlyCapturingScreenshot) {
            return;
        }
        currentlyCapturingScreenshot = true;
        try {
            const {success, arrayBuffer} = await intermediary.sendMessage('getScreenshot') as any;
            if (success) {
            const newScreenshotUrl = URL.createObjectURL(new Blob(
                [new Uint8Array(arrayBuffer)],
                { type: 'image/jpeg' }
            ));
            URL.revokeObjectURL(screenshotUrl);
            screenshotUrl = newScreenshotUrl;

            requestScreenshot();
            screenshotOutOfDate = false;
            clearTimeout(screenshotOutOfDateTimeOut);
            screenshotOutOfDateTimeOut = undefined;
        } else {
            if (!screenshotOutOfDateTimeOut) {
                screenshotOutOfDateTimeOut = setTimeout(() => {
                    screenshotOutOfDate = true;
                }, 2000);
            }
            setTimeout(() => {
                requestScreenshot();
            }, 200);
        }
        } finally {
            currentlyCapturingScreenshot = false;
        }
    }

    function onKeydown(event) {
        const key = event.key;

        switch (key) {
            case 'Escape':
                isInspectingNodes = false;
                focusedNodeTree = null;
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
        left: 0;
        bottom: 0;
        background-color: #00000055;
        padding: 10px;
        color: #FFFFFF;
    }

    #nodeInfo b {
        color: #AAAAAA;
    }

    #nodeOutline {
        outline: var(--overlayStrokeSize) var(--overlayColor) solid;
        box-shadow: 2px 2px black;
    }

    .screenshotOutOfDate {
        opacity: 0.3;
    }

    .isInspectingNodes #nodeSelectionCursor {
        position: absolute;
        width: 6px;
        height: 6px;
        background-color: black;
        margin-left: -3px;
        margin-top: -3px;
    }
</style>

<svelte:window on:keydown={onKeydown} />
<div id="container" on:mouseenter="{onMouseEnter}" on:mouseleave="{onMouseLeave}">
    {#if deviceAvailable}
    <div
        id="screenshotContainer"
        class:screenshotOutOfDate="{screenshotOutOfDate}"
        class:isInspectingNodes="{isInspectingNodes}"
        bind:clientWidth={screenshotContainerWidth}
        bind:clientHeight={screenshotContainerHeight}
        on:mousemove={onImageMouseMove}
        on:mousedown={onMouseDown}>
        {#if focusedNodeTree}
            <div id="nodeSelectionCursor" style="left: {nodeSelectionCursorLeft}px; top: {nodeSelectionCursorTop}px;" />
            <div id="nodeOutline" style="left: {nodeLeft}px; top: {nodeTop}px; width: {nodeWidth}px; height: {nodeHeight}px" />

            <div id="nodeInfo">
                <b>subtype:</b> {focusedNodeTree.subtype},
                <b>id:</b> {focusedNodeTree.id}<br>
                <b>x:</b> {focusedNodeTree.sceneRect.x},
                <b>y:</b> {focusedNodeTree.sceneRect.y},
                <b>width:</b> {focusedNodeTree.sceneRect.width},
                <b>height:</b> {focusedNodeTree.sceneRect.height}
            </div>
        {/if}
            <img
                id="screenshot"
                src="{screenshotUrl}" />

    </div>
    {:else}
        <div style="margin: 0 10px">
            <OdcSetManualIpAddress />
        </div>
    {/if}
</div>
