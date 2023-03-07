<!-- svelte-ignore a11y-click-events-have-key-events -->
<script lang="ts">
    import { odc, intermediary } from '../../ExtensionIntermediary';
    import OdcSetManualIpAddress from '../../shared/OdcSetManualIpAddress.svelte';
    import { ViewProviderId } from '../../../../src/viewProviders/ViewProviderId';
    import { ViewProviderEvent } from '../../../../src/viewProviders/ViewProviderEvent';
    import { ViewProviderCommand } from '../../../../src/viewProviders/ViewProviderCommand';
    import type { TreeNode } from 'roku-test-automation';
    import { VscodeCommand } from '../../../../src/commands/VscodeCommand';

    window.vscode = acquireVsCodeApi();

    let deviceAvailable = false;
    intermediary.observeEvent(ViewProviderEvent.onDeviceAvailabilityChange, (message) => {
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
    let focusedTreeNode: TreeNode | null;
    $: {
        if (mouseIsOverView && isInspectingNodes) {
            let treeNode = undefined
            if (focusedTreeNode) {
                treeNode = {
                    // Optimization since we only need the reference for linking with the sceneGraphInspectorView
                    ref: focusedTreeNode.ref
                }
            }
            intermediary.sendMessageToWebviews(ViewProviderId.sceneGraphInspectorView, {
                event: ViewProviderEvent.onTreeNodeFocused,
                treeNode: treeNode
            });
        }
    }

    intermediary.observeEvent(ViewProviderEvent.onTreeNodeFocused, (message) => {
        focusedTreeNode = message.treeNode;
    });

    intermediary.observeEvent(ViewProviderEvent.onStoredNodeReferencesUpdated, (message) => {
        focusedTreeNode = null;
    });

    let nodeSelectionCursorLeft = 0;
    let nodeSelectionCursorTop = 0;

    let nodeTop: number;
    $: {
        nodeTop = focusedTreeNode?.sceneRect.y * imageSizeAdjust;
    }

    let nodeLeft: number;
    $: {
        nodeLeft = focusedTreeNode?.sceneRect.x * imageSizeAdjust;
    }

    let nodeWidth: number;
    $: {
        nodeWidth = focusedTreeNode?.sceneRect.width * imageSizeAdjust;
    }

    let nodeHeight: number;
    $: {
        nodeHeight = focusedTreeNode?.sceneRect.height * imageSizeAdjust;
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
            focusedTreeNode = result.matches[0];
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

    intermediary.observeEvent(ViewProviderEvent.onVscodeCommandReceived, async (message) => {
        const name = message.commandName;
        if (name === VscodeCommand.rokuDeviceViewInspectNodes) {
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

        } else if (name === VscodeCommand.rokuDeviceViewPauseScreenshotCapture) {
            enableScreenshotCapture = false;
        } else if (name === VscodeCommand.rokuDeviceViewResumeScreenshotCapture) {
            isInspectingNodes = false;
            enableScreenshotCapture = true;
            requestScreenshot();
        } else if (name === VscodeCommand.rokuDeviceViewRefreshScreenshot) {
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
            const {success, arrayBuffer} = await intermediary.sendCommand(ViewProviderCommand.getScreenshot) as any;
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
                focusedTreeNode = null;
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
        {#if focusedTreeNode}
            <div id="nodeSelectionCursor" style="left: {nodeSelectionCursorLeft}px; top: {nodeSelectionCursorTop}px;" />
            <div id="nodeOutline" style="left: {nodeLeft}px; top: {nodeTop}px; width: {nodeWidth}px; height: {nodeHeight}px" />

            <div id="nodeInfo">
                <b>subtype:</b> {focusedTreeNode.subtype},
                <b>id:</b> {focusedTreeNode.id}<br>
                <b>x:</b> {focusedTreeNode.sceneRect.x},
                <b>y:</b> {focusedTreeNode.sceneRect.y},
                <b>width:</b> {focusedTreeNode.sceneRect.width},
                <b>height:</b> {focusedTreeNode.sceneRect.height}
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
