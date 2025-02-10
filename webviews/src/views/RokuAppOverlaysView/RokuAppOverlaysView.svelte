<!-- svelte-ignore a11y-click-events-have-key-events -->
<script lang="ts">
    import type * as rta from 'roku-test-automation';
    import { odc, intermediary } from '../../ExtensionIntermediary';
    import OdcSetupSteps from '../../shared/OdcSetupSteps.svelte';
    import { NewFile, Trash } from 'svelte-codicons';
    import { ViewProviderCommand } from '../../../../src/viewProviders/ViewProviderCommand';
    import { ViewProviderEvent } from '../../../../src/viewProviders/ViewProviderEvent';
    import { VscodeCommand } from '../../../../src/commands/VscodeCommand';
    import { WorkspaceStateKey } from '../../../../src/viewProviders/WorkspaceStateKey';

    window.vscode = acquireVsCodeApi();

    const containerId = 'vscodeContainer';
    const containerKeyPath = `#${containerId}`;

    const overlaysFolder = 'tmp:/__vscode_overlays';

    let deployedOverlayIds = {}

    type OverlayInfo = {
        id: string;
        name: string;
        sourcePath: string;
        destinationFileName: string;
        visible: boolean;
        opacity: number;
        imageData: any;
    }

    let overlays = [] as OverlayInfo[]
    $: {
        intermediary.updateWorkspaceState(WorkspaceStateKey.rokuAppOverlays, overlays);
    }

    intermediary.getWorkspaceState(WorkspaceStateKey.rokuAppOverlays).then((storedOverlays) => {
        if (storedOverlays !== undefined) {
            overlays = storedOverlays;
        }
    })

    /** Adds overlays container only if it doesn't already exist */
    async function addVscodeOverlaysContainer() {
        const {found} = await odc.getValue({keyPath: containerKeyPath});
        if (!found) {
            await odc.setValue({
                field: '',
                keyPath: '',
                value: {
                    children: [{
                        subtype: 'Group',
                        id: containerId
                    }]
                }
            });
        }
    }

    async function deployOverlay(overlayInfo: OverlayInfo, index: number | undefined = undefined) {
        const destinationPath = `${overlaysFolder}/${overlayInfo.destinationFileName}`;
        try {
            await odc.writeFile({
                sourcePath: overlayInfo.sourcePath,
                destinationPath: destinationPath
            });

            await addVscodeOverlaysContainer();

            const posterNode = {
                subtype: 'Poster',
                id: overlayInfo.id,
                uri: destinationPath
            } as Partial<rta.NodeRepresentation>

            if (overlayInfo.visible !== undefined) {
                posterNode.visible = overlayInfo.visible
            } else {
                overlayInfo.visible = true;
            }

            if (overlayInfo.opacity !== undefined) {
                posterNode.opacity = overlayInfo.opacity
            } else {
                overlayInfo.opacity = 1.0;
            }

            await odc.setValue({
                field: '',
                keyPath: containerKeyPath,
                value: {
                    children: [posterNode]
                }
            });

            deployedOverlayIds[overlayInfo.id] = true;
            if (index !== undefined) {
                overlays[index] = overlayInfo;
            } else {
                overlays = [overlayInfo, ...overlays];
            }

        } catch (e) {
            debugger;
        }
        return overlayInfo;
    }

    async function conditionallyDeployOverlay(overlay: OverlayInfo, index: number | undefined = undefined) {
        const {value} = await odc.getValue({
            keyPath: `${containerKeyPath}.#${overlay.id}.id`
        });
        if (value !== overlay.id) {
            // We need to deploy it
            await deployOverlay(overlay, index)
        }
    }

    async function onOverlayVisibleChange() {
        const index = this.id;
        const overlay = overlays[index];
        overlay.visible = this.checked;
        overlays[index] = overlay;
        if (deployedOverlayIds[overlay.id]) {
            await odc.setValue({
                keyPath: `${containerKeyPath}.#${overlay.id}.visible`,
                value: overlay.visible
            });
        } else {
            await conditionallyDeployOverlay(overlay, index);
        }
    }

    function onOverlayNameChange() {
        const index = this.id;
        const overlay = overlays[index];
        overlay.name = this.value;
        overlays[index] = overlay;
    }

    async function onOverlayOpacityChange() {
        const index = this.id;
        const overlay = overlays[index];
        overlay.opacity = this.value / 100;
        overlays[index] = overlay;

        if (deployedOverlayIds[overlay.id]) {
            await odc.setValue({
                keyPath: `${containerKeyPath}.#${overlay.id}.opacity`,
                value: overlay.opacity
            });
        } else {
            await conditionallyDeployOverlay(overlay, index);
        }
    }

    /**
     * Used to delete a node from the node tree on the Roku device. Used both for removing a single overlay Poster as well as removing all overlays parented under `containerKeyPath`
     * @param id the id of the node we want to delete
     * @param parentKeypath the key path to get to the parent of the node we are trying to delete
     */
    async function deleteNode(id: string, parentKeypath = '') {
        // We have to figure out the index first so get all of the children and look for the matching id
        const {value} = await odc.getValue({
            keyPath: parentKeypath,
            responseMaxChildDepth: 1
        });
        for (const [index, node] of value.children.entries()) {
            if (node.id === id) {
                await odc.removeNodeChildren({
                    keyPath: parentKeypath,
                    index: index,
                    count: 1
                });
                break;
            }
        }
    }

    async function deleteOverlay() {
        // IMPROVEMENT remove overlay file on device
        const overlay = overlays[this.id];
        await deleteNode(overlay.id, containerKeyPath);
        overlays = overlays.filter((overlayB) => {
            return overlay.id !== overlayB.id;
        });
    }

    intermediary.observeEvent(ViewProviderEvent.onRokuAppOverlayAdded, async (message) => {
        await deployOverlay(message.context);
    });

    intermediary.observeEvent(ViewProviderEvent.onVscodeCommandReceived, async (message) => {
        const name = message.context.commandName;
        if (name === VscodeCommand.rokuAppOverlaysViewRemoveAllOverlays) {
            // IMPROVEMENT remove all overlay files on device
            await deleteNode(containerId);
            overlays = [];
        }
    });

    let odcAvailable = false;
    intermediary.observeEvent(ViewProviderEvent.onDeviceAvailabilityChange, async (message) => {
        odcAvailable = message.context.odcAvailable;
        if (odcAvailable) {
            for (const [index, overlay] of overlays.entries()) {
                await conditionallyDeployOverlay(overlay, index);
            }
        }
    });

    function onOpenFile(event) {
        const srcFilePath = event.target.getAttribute('data-file');
        const pathContentsInfo = { filePath: srcFilePath, type: 'file' };
        intermediary.sendCommand(ViewProviderCommand.openRokuFile, pathContentsInfo);
    }

    // Required by any view so we can know that the view is ready to receive messages
    intermediary.sendViewReady();
</script>

<style>
    #container {
        padding: 8px;
    }

    table {
        border-spacing: 0;
        width: 100%;
    }

    img:hover {
        cursor: pointer;
    }
</style>


<div id="container">
    {#if odcAvailable}
        {#if overlays.length }
            <table>
                {#each overlays as overlay, index}
                    <tr>
                        <td>
                            <vscode-checkbox id="{index}" on:change={onOverlayVisibleChange} checked={overlay.visible} />
                        </td>
                        <td>
                            <vscode-button id="{index}" appearance="icon" title="Open Overlay File" aria-label="Open Overlay File" on:click={onOpenFile}>
                                <img src="{overlay.imageData}" data-file="{overlay.sourcePath}" style="width:32px; min-width:16px; height:32px" />
                            </vscode-button>
                        </td>
                        <td>
                            <vscode-text-field id="{index}" on:input={onOverlayNameChange} value="{overlay.name}" />
                        </td>
                        <td>
                            <input id="{index.toString()}" type="range" min="0" max="100" value="{overlay.opacity * 100}" class="slider" on:input={onOverlayOpacityChange}>
                        </td>
                        <td>
                            <vscode-button id="{index}" appearance="icon" title="Delete Overlay" aria-label="Delete Overlay" on:click={deleteOverlay}>
                                <Trash />
                            </vscode-button>
                        </td>
                    </tr>
                    <tr>
                        <td colspan="4">
                            <vscode-divider />
                        </td>
                    </tr>
                {/each}
            </table>
        {:else}
            <span style="padding:10px">
                You haven't added any overlays. Add one by clicking <NewFile />
            </span>
        {/if}
    {:else}
        <OdcSetupSteps />
    {/if}
</div>
