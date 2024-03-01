<!-- svelte-ignore a11y-click-events-have-key-events -->
<script lang="ts">
    import { odc, intermediary } from '../../ExtensionIntermediary';
    import OdcSetupSteps from '../../shared/OdcSetupSteps.svelte';
    import { Database, ChevronUp, ChevronDown } from 'svelte-codicons';
    import { ViewProviderEvent } from '../../../../src/viewProviders/ViewProviderEvent';
    import Loader from '../../shared/Loader.svelte';
    import SortableGridHeader from '../../shared/SortableGridHeader.svelte';
    import FileSystemEntry from './FileSystemEntry.svelte';
    import { VscodeCommand } from '../../../../src/commands/VscodeCommand';
    import { ViewProviderCommand } from '../../../../src/viewProviders/ViewProviderCommand';
    import type { PathContentsInfo } from '../../shared/types';
    import { WorkspaceStateKey } from '../../../../src/viewProviders/WorkspaceStateKey';

    window.vscode = acquireVsCodeApi();

    let loading = false;

    let containerWidth = 0;

    let gridTemplateColumns = ''

    let columnsToShow = {} as {
        name?: true,
        size?: true,
        dateModified?: true,
        dateCreated?: true
    };

    $:{
        if(containerWidth > 600) {
            gridTemplateColumns = '24px 6fr 2fr 4fr 4fr'
            columnsToShow = {
                name: true,
                size: true,
                dateModified: true,
                dateCreated: true
            }
        } else if(containerWidth > 400) {
            gridTemplateColumns = '24px 6fr 2fr 4fr 0'
            columnsToShow = {
                name: true,
                size: true,
                dateModified: true,
            }
        } else if(containerWidth > 300) {
            gridTemplateColumns = '24px 6fr 2fr 0 0'
            columnsToShow = {
                name: true,
                size: true
            }
        } else {
            gridTemplateColumns = '24px 6fr 0 0 0'
            columnsToShow = {
                name: true
            }
        }
    }

    let currentPath = 'pkg:/';
    $: {
        intermediary.updateWorkspaceState(WorkspaceStateKey.rokuFileSystemCurrentPath, currentPath);
    }
    intermediary.getWorkspaceState(WorkspaceStateKey.rokuFileSystemCurrentPath).then((value) => {
        currentPath = value;
    })

    let currentPathBreadcrumbs = [] as {
        name: string;
        path: string;
    }[];

    let currentPathContentsInfo = [] as PathContentsInfo[];

    let currentSortHeader: SortableGridHeader | undefined;

    function buildBreadcrumbsForPath(path) {
        const pathParts = path.split('/');

        // If we have a trailing slash then we want to remove it. We check for this by seeing if we have an empty string
        if (pathParts.at(-1) === '') {
            pathParts.pop();
        }


        let currentBreadcrumbPath = '';
        return pathParts.map((name) => {
            currentBreadcrumbPath += name + '/';
            return {
                path: currentBreadcrumbPath,
                name: name
            }
        })
    }

    function onOpen(event: CustomEvent<PathContentsInfo>) {
        const pathContentsInfo = event.detail;
        if (pathContentsInfo.type === 'file') {
            intermediary.sendCommand(ViewProviderCommand.openRokuFile, pathContentsInfo);
        } else {
            updateCurrentPath(pathContentsInfo.path);
        }
    }

    /**
     * Handles retrieving info about the current path from the Roku device and updating the UI accordingly
     * @param path the path we want to update the UI based on
     * @param forceReload whether we should still update even if the path is the same as the existing
     */
    async function updateCurrentPath(path: string, forceReload = false) {
        // You need to make sure it has a trailing slash
        if (path.length > 0 && path.slice(-1) !== '/') {
            path += '/';
        }

        // Check if path is already equal
        if (path === currentPath && !forceReload) {
            return;
        }

        currentPathBreadcrumbs = buildBreadcrumbsForPath(path);
        currentPath = path;

        if (path === '') {
            loading = true;
            // We use an empty path to serve as the top level
            const {list} = await odc.getVolumeList({});
            currentPathContentsInfo = list.map((volume) => {
                return {
                    name: volume,
                    path: volume + '/',
                    type: 'fileSystem'
                }
            });
            loading = false;
        } else {
            loading = true;

            const {list} = await odc.getDirectoryListing({
                path: path
            });

            currentPathContentsInfo = list.map((name) => {
                return {
                    name: name,
                    path: path + name
                }
            });

            loading = false;


            for (const [index, info] of currentPathContentsInfo.entries()) {
                const statInfo = await odc.statPath({
                    path: info.path
                }) as PathContentsInfo;
                currentPathContentsInfo[index] = {...info, ...statInfo};
            }
        }
    }

    async function refresh() {
        await updateCurrentPath(currentPath, true);
    }

    function onSortColumnChange() {
        const newSortHeader = this;

        if (currentSortHeader && newSortHeader.column === currentSortHeader.column) {
            let sortDirection = currentSortHeader.sortDirection;
            if (sortDirection === 'none' || sortDirection === 'desc') {
                sortDirection = 'asc';
            } else if (sortDirection === 'asc') {
                sortDirection = 'desc';
            }
            currentSortHeader.sortDirection = sortDirection
        } else {
            if (currentSortHeader) {
                currentSortHeader.sortDirection = 'none';
            }

            newSortHeader.sortDirection = 'asc';
            currentSortHeader = newSortHeader;
        }

        currentPathContentsInfo = currentPathContentsInfo.sort((a, b) => {
            let sortKey = 'name'
            if (newSortHeader.column === 2) {
                // Name
                sortKey = 'name';
            } else if (newSortHeader.column === 3) {
                // Size
                sortKey = 'size';
            } else if (newSortHeader.column === 4) {
                // Date Modified
                sortKey = 'mtime';
            } else if (newSortHeader.column === 5) {
                // Date Created
                sortKey = 'ctime';
            }

            let sortOrder = 1;
            if (newSortHeader.sortDirection === 'desc') {
                sortOrder = -1
            }


            if (a[sortKey] > b[sortKey]) {
                return sortOrder;
            } else if (a[sortKey] < b[sortKey]) {
                return sortOrder * -1;
            } else {
                return 0;
            }
        });
    }

    intermediary.observeEvent(ViewProviderEvent.onVscodeCommandReceived, async (message) => {
        const name = message.context.commandName;
        if (name === VscodeCommand.rokuFileSystemViewRefresh) {
            await refresh();
        }
    });

    let odcAvailable = false;
    intermediary.observeEvent(ViewProviderEvent.onDeviceAvailabilityChange, async (message) => {
        odcAvailable = message.context.odcAvailable;
        if (odcAvailable) {
            await refresh();
        }
    });

    // Required by any view so we can know that the view is ready to receive messages
    intermediary.sendViewReady();
</script>

<style>
    #breadcrumbs {
        position: fixed;
        top: 0;
        width: 100%;
        padding: 5px 2px;
        background-color: var(--vscode-breadcrumb-background); /** or --vscode-sideBar-background*/
        z-index: 1;
    }

    #currentPathContents {
        --headerHeight: 36px;
        padding-top: var(--headerHeight);
    }

    #emptyFolder {
        padding: 10px;
    }

    #headerRow {
        position: sticky;
        top: var(--headerHeight);
        z-index: 1000;
        background-color: var(--vscode-sideBar-background);
    }

    .hide {
        display: none;
    }
</style>
<div bind:clientWidth={containerWidth}>
    {#if odcAvailable}
        {#if loading}
            <Loader />
        {:else}
            <div id=breadcrumbs>
                <vscode-button appearance="secondary" on:click={() => {updateCurrentPath('')}}><span style="margin: 0 -8px"><Database /></span></vscode-button>
                {#each currentPathBreadcrumbs as breadcrumb, i}
                    <vscode-button appearance="secondary" on:click={() => {updateCurrentPath(breadcrumb.path)}}>{breadcrumb.name}</vscode-button>
                    {#if i + 1 < currentPathBreadcrumbs.length}
                        <vscode-button appearance="icon" disabled style="cursor: default;">/</vscode-button>
                    {/if}
                {/each}
            </div>
            <div id="currentPathContents">
                <div id="emptyFolder" class:hide={currentPathContentsInfo.length > 0}>
                    This folder is empty.
                </div>
                <vscode-data-grid class:hide={currentPathContentsInfo.length === 0} grid-template-columns={gridTemplateColumns}>
                    <vscode-data-grid-row id="headerRow" row-type="header">
                        {#if columnsToShow.name}
                            <SortableGridHeader on:click={onSortColumnChange} title="Name" column={2} />
                        {/if}
                        {#if columnsToShow.size}
                            <SortableGridHeader on:click={onSortColumnChange} title="Size" column={3} />
                        {/if}
                        {#if columnsToShow.dateModified}
                            <SortableGridHeader on:click={onSortColumnChange} title="Date Modified" column={4} />
                        {/if}
                        {#if columnsToShow.dateCreated}
                            <SortableGridHeader on:click={onSortColumnChange} title="Date Created" column={5} />
                        {/if}
                    </vscode-data-grid-row>

                    {#each currentPathContentsInfo as entry}
                        <FileSystemEntry on:open={onOpen} entry={entry} columnsToShow={columnsToShow} />
                    {/each}
                </vscode-data-grid>
            </div>
        {/if}
    {:else}
        <OdcSetupSteps />
    {/if}
</div>
