<script lang="ts">
    import { odc, intermediary } from '../../ExtensionIntermediary';
    export let showScreenshotSelectPage: boolean;

    let screenshotImage: string;

    let imageWidth = 0
    let imageHeight = 0
    let imageSizeAdjust = 1;
    $: {
        imageSizeAdjust = imageWidth / 1920
        console.log('imageSizeAdjust', imageSizeAdjust);
    }

    let screenshotCaptureRunning = false;

    let matchingNodes: Awaited<ReturnType<typeof odc.findNodesAtLocation>>['matches'] = [];
    let currentNode: Awaited<ReturnType<typeof odc.findNodesAtLocation>>['matches'][0] | null;

    let currentNodeIndex = 0;
    $: {
        if (currentNodeIndex < 0) {
            currentNodeIndex = currentNodeIndex = matchingNodes.length - 1
        } else if (matchingNodes.length > currentNodeIndex) {
            currentNode = matchingNodes[currentNodeIndex];
        } else if (matchingNodes.length) {
            currentNodeIndex = 0;
        } else {
            currentNode = null;
        }
    }

    let displayScreenshotOverlay = false;
    $: {
        displayScreenshotOverlay = !!currentNode;
    }

    let nodeTop;
    $: {
        nodeTop = currentNode?.rect.y * imageSizeAdjust;
    }

    let nodeLeft;
    $: {
        nodeLeft = currentNode?.rect.x * imageSizeAdjust;
    }

    let nodeWidth;
    $: {
        nodeWidth = currentNode?.rect.width * imageSizeAdjust;
    }

    let nodeHeight;
    $: {
        nodeHeight = currentNode?.rect.height * imageSizeAdjust;
    }

    function close() {
        showScreenshotSelectPage = false;
    }

    function handleKeydown(event) {
        const key = event.key;

        switch (key) {
            case 'Escape':
                close();
                break;
        }
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

    function handleMouseWheel(event) {
        const y = event.deltaY
        if (!y) {
            // Can receive 0 if it was a horizontal scroll
            return;
        }
        if (y > 0) {
            currentNodeIndex++
        } else {
            currentNodeIndex--
        }
        console.log(event);
        event.preventDefault();
        return false;
    }

    let handleImageMouseMoveTimeout;
    function handleImageMouseMove(event) {
        clearTimeout(handleImageMouseMoveTimeout);
        handleImageMouseMoveTimeout = setTimeout(async ()=> {
            const offset = getOffset(this);
            const imageX = event.x - offset.left;
            const imageY = event.y - offset.top;

            const x = Math.round(imageX / imageWidth * 1920);
            const y = Math.round(imageY / imageHeight * 1080);

            // console.log('handleImageMouseMove', {x, y, imageWidth,imageHeight, imageX, imageY, offsetTop: this.offsetParent.offsetTop, findPos: getOffset(this)});

            const {matches} = await odc.findNodesAtLocation({x, y});
            matchingNodes = matches;
        }, 100);
    }

    function handleImageMouseOut() {
        clearTimeout(handleImageMouseMoveTimeout);
    }

    function requestScreenshot() {
        if (screenshotCaptureRunning) {
            console.log('Screenshot capture already running. Skipping');
            return;
        }
        console.log('requestScreenshot')
        intermediary.sendMessage('getScreenshot');
    }

    intermediary.observeEvent('screenshotFailed', () => {
        console.log('getScreenshot failed')
        screenshotCaptureRunning = false
        setTimeout(() => {
            requestScreenshot();
        }, 1000);
    });

    intermediary.observeEvent('screenshotAvailable', (message) => {
        console.log('getScreenshot succeeded')
        screenshotCaptureRunning = false
        screenshotImage = message.image;
        requestScreenshot();
    });

    intermediary.sendMessage('setManualIpAddress', {
        ipAddress: '192.168.10.192',
        password: 'aaaa'
    })

    requestScreenshot();
</script>

<style>
    #background {
        background-color: var(--vscode-sideBar-background);
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        width: 100%;
        height: 100%;
        z-index: 199;
    }

    #container {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        z-index: 200;
    }

    #header {
        font-weight: bold;
        font-size: large;
        padding: 0 10px;
        border-bottom: 2px solid rgb(190, 190, 190);
    }

    #instructions {
        padding: 10px;
        text-align: center;
    }

    #closeButton {
        font-size: small;
        float: right;
        cursor: pointer;
        padding-top: 3px;
    }

    #screenshotContainer {
        --overlayStrokeSize: 3px;
        --overlayColor: red;
        position: relative;
        cursor: crosshair;
    }

    #screenshotContainer div {
        position: absolute;
    }

    #leftLine {
        background-color: var(--overlayColor);
        height: var(--overlayStrokeSize);
        margin-top: calc(var(--overlayStrokeSize) / -2);
    }

    #topLine {
        background-color: var(--overlayColor);
        width: var(--overlayStrokeSize);
        margin-left: calc(var(--overlayStrokeSize) / -2);
    }

    #xText, #yText {
        color: white;
        filter: drop-shadow(4px 4px 4px #000);
        text-align: center;
    }

    #nodeOutline {
        outline: var(--overlayStrokeSize) var(--overlayColor) solid;
    }

    ul {
        margin: 0px;
        padding: 0px;
        list-style: none;
    }

    li {
        color: #FFFFFF;
        background-color: #000000;
    }

    li:hover {
        color: var(--vscode-list-hoverForeground);
        background-color: var(--vscode-list-hoverBackground);
    }

    li.selected {
        background-color: var(--vscode-list-activeSelectionBackground);
        color: var(--vscode-list-activeSelectionForeground);
    }

</style>

<svelte:window on:keydown={handleKeydown} on:wheel={handleMouseWheel} />
<div id="background" />
<div id="container">
    <div id="header">
        Screenshot Select
        <div id="closeButton" on:click={close}>X</div>
    </div>

    <div id="screenshotContainer"
        bind:clientWidth={imageWidth}
        bind:clientHeight={imageHeight}
        on:mousemove={handleImageMouseMove}
        on:mouseout={handleImageMouseOut}>
        {#if displayScreenshotOverlay}
        <div id="leftLine" style="top: {nodeTop + nodeHeight/2}px; width: {nodeLeft}px" />
        <div id="xText" style="top: {nodeTop + nodeHeight/2}px; width: {nodeLeft - 5}px">x: {currentNode?.rect.x}</div>

        <div id="topLine" style="left: {nodeLeft + nodeWidth/2}px; height: {nodeTop}px" />
        <div id="yText" style="left: {nodeLeft + nodeWidth/2}px; height: {nodeTop}px">y: {currentNode?.rect.y}</div>

        <div id="nodeOutline" style="left: {nodeLeft}px; top: {nodeTop}px; width: {nodeWidth}px; height: {nodeHeight}px" />
        {/if}
        <img
            id="screenshot"
            src="{screenshotImage}" />
    </div>
    <ul>
        {#each matchingNodes as matchingNode, i}
            <li class:selected={i === currentNodeIndex}>{matchingNode.node.subtype}({matchingNode.node.id})</li>
        {/each}
    </ul>
    <div id="instructions">Hover over the node you are interested in. Use scrollwheel to shift between nodes. Right click to jump to node</div>
</div>
