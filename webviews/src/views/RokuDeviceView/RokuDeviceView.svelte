<!-- svelte-ignore a11y-click-events-have-key-events -->
<script lang="ts">
    import { odc, intermediary } from '../../ExtensionIntermediary';
    import OdcSetManualIpAddress from '../../shared/OdcSetManualIpAddress.svelte';
    import { ViewProviderId } from '../../../../src/viewProviders/ViewProviderId';
    import { ViewProviderEvent } from '../../../../src/viewProviders/ViewProviderEvent';
    import { ViewProviderCommand } from '../../../../src/viewProviders/ViewProviderCommand';
    import type { TreeNode, FindNodesAtLocationArgs } from 'roku-test-automation';
    import { OnDeviceComponent } from 'roku-test-automation/client/dist/OnDeviceComponent';
    import { VscodeCommand } from '../../../../src/commands/VscodeCommand';
    import { utils } from '../../utils';

    window.vscode = acquireVsCodeApi();

    let deviceAvailable = false;
    intermediary.observeEvent(ViewProviderEvent.onDeviceAvailabilityChange, (message) => {
        deviceAvailable = message.context.deviceAvailable;
        if (deviceAvailable) {
            // We want to always request a screenshot when someone first opens the panel so we are forcing it
            requestScreenshot(true);
        }
    });

    let wasRunningScreenshotCaptureBeforeInspect: boolean | undefined;

    let screenshotUrl = '';

    let screenshotOutOfDate = false;

    let isInspectingNodes = false;
    $:{
        // Gets called on initial load even though value is already false so we use undefined value on wasRunningScreenshotCaptureBeforeInspect to avoid issues
        if (!isInspectingNodes && wasRunningScreenshotCaptureBeforeInspect !== undefined) {
            enableScreenshotCapture = wasRunningScreenshotCaptureBeforeInspect;
            requestScreenshot();
        }
        intermediary.setVscodeContext('brightscript.rokuDeviceView.isInspectingNodes', isInspectingNodes);
    }

    let enableScreenshotCapture = utils.getStorageBooleanValue('enableScreenshotCapture', true);
    $:{
        intermediary.setVscodeContext('brightscript.rokuDeviceView.enableScreenshotCapture', enableScreenshotCapture);
        utils.setStorageValue('enableScreenshotCapture', enableScreenshotCapture);
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
    let lastFocusedTreeNodeRef = -1;
    let focusedTreeNode: TreeNode | null;
    $: {
        if (mouseIsOverView && isInspectingNodes) {
            if (focusedTreeNode && lastFocusedTreeNodeRef !== focusedTreeNode.ref) {
                lastFocusedTreeNodeRef = focusedTreeNode.ref;
                sendOnTreeNodeFocusedEvent(focusedTreeNode);
            }
        }
    }

    function sendOnTreeNodeFocusedEvent(treeNode, shouldOpen = false) {
        if (!shouldOpen) {
            treeNode = {
                // Optimization since we only need the keyPath for linking with the sceneGraphInspectorView unless we are opening that node
                keyPath: treeNode?.keyPath
            }
        }
        const message = intermediary.createEventMessage(ViewProviderEvent.onTreeNodeFocused, {
            // Keeping outer treeNode structure just so the events being sent from this view to the sceneGraphInspectorView are the same as we receive
            treeNode: treeNode,
            shouldOpen: shouldOpen
        });
        intermediary.sendMessageToWebviews(ViewProviderId.sceneGraphInspectorView, message);
    }

    intermediary.observeEvent(ViewProviderEvent.onTreeNodeFocused, (message) => {
        focusedTreeNode = message.context.treeNode;
    });

    intermediary.observeEvent(ViewProviderEvent.onStoredNodeReferencesUpdated, async (message) => {
        if (focusedTreeNode) {
            const result = await intermediary.getStoredNodeReferences();
            for (const treeNode of result.flatTree) {
                if (treeNode.keyPath === focusedTreeNode.keyPath) {
                    focusedTreeNode = treeNode;
                    break;
                }
            }
        }
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
    const onDeviceComponent = new OnDeviceComponent({} as any);
    let lastStoreNodesResponse;
    async function onImageMouseMove(event) {
        if (!isInspectingNodes || !lastStoreNodesResponse) {
            return;
        }

        const offset = getOffset(this);
        const imageX = event.x - offset.left;
        const imageY = event.y - offset.top;

        nodeSelectionCursorLeft = imageX;
        nodeSelectionCursorTop = imageY;

        const x = Math.round(imageX / imageWidth * 1920);
        const y = Math.round(imageY / imageHeight * 1080);

        if (lastFindNodesAtLocationArgs && lastFindNodesAtLocationArgs.x === x && lastFindNodesAtLocationArgs.y === y) {
            return;
        }

        const args: FindNodesAtLocationArgs = {
            x: x,
            y: y,
            nodeTreeResponse: lastStoreNodesResponse
        }
        lastFindNodesAtLocationArgs = args;

        const {matches} = await onDeviceComponent.findNodesAtLocation(args);
        focusedTreeNode = matches[0];
    }

    function onMouseEnter() {
        mouseIsOverView = true;
    }

    function onMouseLeave() {
        mouseIsOverView = false;
    }

    function onMouseDown() {
        // We want to send one last event that will also trigger the node
        if(isInspectingNodes && focusedTreeNode) {
            sendOnTreeNodeFocusedEvent(focusedTreeNode, true);
        }

        isInspectingNodes = false;
    }

    let currentScreenshot: Blob;

    intermediary.observeEvent(ViewProviderEvent.onVscodeCommandReceived, async (message) => {
        const name = message.context.commandName;
        if (name === VscodeCommand.rokuDeviceViewEnableNodeInspector) {
            wasRunningScreenshotCaptureBeforeInspect = enableScreenshotCapture;
            isInspectingNodes = true;
            enableScreenshotCapture = true;
            requestScreenshot();
            enableScreenshotCapture = false;

            lastStoreNodesResponse = await odc.storeNodeReferences({
                includeNodeCountInfo: true,
                includeArrayGridChildren: true,
                includeBoundingRectInfo: true
            });
        } else if (name === VscodeCommand.rokuDeviceViewPauseScreenshotCapture) {
            enableScreenshotCapture = false;
        } else if (name === VscodeCommand.rokuDeviceViewResumeScreenshotCapture || name === VscodeCommand.rokuDeviceViewDisableNodeInspector) {
            isInspectingNodes = false;
            enableScreenshotCapture = true;
            requestScreenshot();
        } else if (name === VscodeCommand.rokuDeviceViewRefreshScreenshot) {
            enableScreenshotCapture = true;
            requestScreenshot();
            enableScreenshotCapture = false;

            if (isInspectingNodes) {
                lastStoreNodesResponse = await odc.storeNodeReferences({
                    includeNodeCountInfo: true,
                    includeArrayGridChildren: true,
                    includeBoundingRectInfo: true
                });
            }
        } else if (name === VscodeCommand.rokuDeviceViewCopyScreenshot) {
            if(!currentScreenshot) {
                await requestScreenshot(true);
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

    let screenshotOutOfDateTimeOut;
    let currentlyCapturingScreenshot = false;
    async function requestScreenshot(force = false) {
        if (!enableScreenshotCapture || !deviceAvailable) {
            if (!force || currentlyCapturingScreenshot) {
                return;
            }
        }
        currentlyCapturingScreenshot = true;
        try {
            const {success, arrayBuffer} = await intermediary.sendCommand(ViewProviderCommand.getScreenshot);
            if (success) {
                currentScreenshot = new Blob(
                    [new Uint8Array(arrayBuffer)],
                    { type: 'image/png' } // jpg isn't supported for clipboard and png seems to work for both so ¯\_(ツ)_/¯
                );
                const newScreenshotUrl = URL.createObjectURL(currentScreenshot);
                URL.revokeObjectURL(screenshotUrl);
                screenshotUrl = newScreenshotUrl;
                currentlyCapturingScreenshot = false;

                requestScreenshot();
                screenshotOutOfDate = false;
                clearTimeout(screenshotOutOfDateTimeOut);
                screenshotOutOfDateTimeOut = undefined;
            } else {
                if (!screenshotOutOfDateTimeOut) {
                    screenshotOutOfDateTimeOut = setTimeout(() => {
                        // screenshotOutOfDate = true;
                        console.log('screenshot out of date')
                    }, 10000);
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

    .hide {
        display: none;
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
        on:mousedown={onMouseDown}
        data-vscode-context={'{"preventDefaultContextMenuItems": true}'}>
        {#if focusedTreeNode}
            <div class:hide={!mouseIsOverView} id="nodeSelectionCursor" style="left: {nodeSelectionCursorLeft}px; top: {nodeSelectionCursorTop}px;" />
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
