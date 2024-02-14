
<script lang="ts">
    import { File, Database, Folder, Question } from 'svelte-codicons';
    import { createEventDispatcher } from 'svelte';
    import type { PathContentsInfo } from '../../shared/types';
    const dispatch = createEventDispatcher();

    export let entry: PathContentsInfo;
    export let columnsToShow = {} as {
        name?: true,
        size?: true,
        dateModified?: true,
        dateCreated?: true
    };

    function onDoubleClick() {
        dispatch('open', entry);
    }

    function padNum(number: number) {
        return number.toString().padStart(2, '0');
    }

    function formatDate(iso8601) {
        const date = new Date(iso8601);
        // 2024-01-19, 05:39:23
        return `${date.getFullYear()}-${padNum(date.getMonth() + 1)}-${padNum(date.getDate())}, ${padNum(date.getHours())}:${padNum(date.getMinutes())}:${padNum(date.getSeconds())}`;
    }

    function formatSize(size) {
        if (size >= 1048576) {
            return (size / 1048576).toFixed(1) + ' MB';
        }
        if (size >= 1024) {
            return (size / 1024).toFixed(1) + ' KB';
        }
        return size + ' B'
    }
</script>
<style>
    vscode-data-grid-cell {
        padding: 5px;
    }
</style>

<vscode-data-grid-row on:dblclick={onDoubleClick}>
    <vscode-data-grid-cell grid-column="1">
        {#if entry.type === 'file'}
            <File />
        {:else if entry.type === 'directory'}
            <Folder />
        {:else if entry.type === 'fileSystem'}
            <Database />
        {:else}
            <Question />
        {/if}
    </vscode-data-grid-cell>
    {#if columnsToShow.name}
        <vscode-data-grid-cell grid-column="2">{entry.name}</vscode-data-grid-cell>
    {/if}
{#if entry.type === 'file'}
    {#if columnsToShow.size}
        <vscode-data-grid-cell grid-column="3">{formatSize(entry.size)}</vscode-data-grid-cell>
    {/if}
    {#if columnsToShow.dateModified}
        <vscode-data-grid-cell grid-column="4">{formatDate(entry.mtime)}</vscode-data-grid-cell>
    {/if}
    {#if columnsToShow.dateCreated}
        <vscode-data-grid-cell grid-column="5">{formatDate(entry.ctime)}</vscode-data-grid-cell>
    {/if}
{/if}
</vscode-data-grid-row>
