<script lang="ts">
    window.vscode = acquireVsCodeApi();

    import { onDestroy } from 'svelte';
    import type { DeviceOut, DeviceRun, SnapshotOut } from 'roku-deploy';
    import { Refresh, Edit, Check, Close, Trash } from 'svelte-codicons';
    import { intermediary } from '../../ExtensionIntermediary';
    import Loader from '../../shared/Loader.svelte';
    import { ViewProviderCommand } from '../../../../src/viewProviders/ViewProviderCommand';
    import { ViewProviderEvent } from '../../../../src/viewProviders/ViewProviderEvent';

    let loading = true;

    let accounts: string[] = [];
    let activeAccountName: string | undefined = undefined;
    let hasToken = false;
    let devices: DeviceOut[] | undefined = undefined;
    let stateError: string | undefined = undefined;

    let showCreateDeviceForm = false;
    let creatingDevice = false;
    let createDeviceError: string | undefined = undefined;
    let newDeviceName = '';
    let newDeviceType: 'tv' | 'stb' = 'tv';
    let newDeviceNote = '';

    let deviceActionError: string | undefined = undefined;
    let deviceActionsInFlight: Record<number, boolean> = {};

    let expandedDeviceId: number | undefined = undefined;
    let deviceDetailsByDeviceId: Record<number, DeviceDetailsState> = {};

    let editingDeviceId: number | undefined = undefined;
    let editName = '';
    let editNote = '';
    let savingDeviceEdit = false;
    let editDeviceError: string | undefined = undefined;

    let deletingSnapshotId: number | undefined = undefined;

    let enablingDevModeInFlight: Record<number, boolean> = {};

    //recomputed on an interval so running-device runtime labels and progress bars stay current
    //without refetching device state
    let nowTimestamp = Date.now();
    const runtimeTickIntervalId = setInterval(() => {
        nowTimestamp = Date.now();
    }, 30000);
    onDestroy(() => {
        clearInterval(runtimeTickIntervalId);
    });

    function applyState(state) {
        accounts = state.accounts ?? [];
        activeAccountName = state.activeAccountName;
        hasToken = state.hasToken;
        devices = state.devices;
        stateError = state.error;
        loading = false;
    }

    async function loadState() {
        const state = await intermediary.sendCommand(ViewProviderCommand.getRceState);
        applyState(state);
    }

    intermediary.observeEvent(ViewProviderEvent.onRceStateChanged, (message) => {
        applyState(message.context);
        if (expandedDeviceId !== undefined) {
            loadDeviceDetails(expandedDeviceId);
        }
    });

    async function onActiveAccountChange(event) {
        const accountName = event.target.value;
        await intermediary.sendCommand(ViewProviderCommand.setRceActiveAccount, {
            name: accountName
        });
    }

    async function runAccountCommand(accountCommand: 'addAccount' | 'switchAccount' | 'removeAccount') {
        await intermediary.sendCommand(ViewProviderCommand.runRceAccountCommand, {
            command: accountCommand
        });
    }

    function toggleCreateDeviceForm() {
        showCreateDeviceForm = !showCreateDeviceForm;
        createDeviceError = undefined;
    }

    async function createDevice() {
        creatingDevice = true;
        createDeviceError = undefined;
        try {
            await intermediary.sendCommand(ViewProviderCommand.createRceDevice, {
                name: newDeviceName,
                deviceType: newDeviceType,
                note: newDeviceNote || undefined
            });
            newDeviceName = '';
            newDeviceNote = '';
            newDeviceType = 'tv';
            showCreateDeviceForm = false;
        } catch (error) {
            createDeviceError = error.message;
        } finally {
            creatingDevice = false;
        }
    }

    async function startDevice(device: DeviceOut, snapshotId: number | undefined = undefined) {
        deviceActionError = undefined;
        deviceActionsInFlight = { ...deviceActionsInFlight, [device.id]: true };
        try {
            await intermediary.sendCommand(ViewProviderCommand.startRceDevice, {
                deviceId: device.id,
                snapshotId: snapshotId
            });
        } catch (error) {
            deviceActionError = error.message;
        } finally {
            deviceActionsInFlight = { ...deviceActionsInFlight, [device.id]: false };
        }
    }

    async function stopDevice(device: DeviceOut) {
        deviceActionError = undefined;
        deviceActionsInFlight = { ...deviceActionsInFlight, [device.id]: true };
        try {
            await intermediary.sendCommand(ViewProviderCommand.stopRceDevice, {
                deviceId: device.id
            });
        } catch (error) {
            deviceActionError = error.message;
        } finally {
            deviceActionsInFlight = { ...deviceActionsInFlight, [device.id]: false };
        }
    }

    function formatHoursCompact(totalSeconds: number): string {
        const hours = Math.round((totalSeconds / 3600) * 10) / 10;
        const value = Number.isInteger(hours) ? hours.toFixed(0) : hours.toFixed(1);
        return `${value}h`;
    }

    function formatMinutesCompact(totalSeconds: number): string {
        return `${Math.floor(totalSeconds / 60)}m`;
    }

    function formatRuntimeLabel(elapsedSeconds: number, maxRuntimeSeconds: number): string {
        if (elapsedSeconds >= 3600) {
            return `${formatHoursCompact(elapsedSeconds)} / ${formatHoursCompact(maxRuntimeSeconds)}`;
        }
        return `${formatMinutesCompact(elapsedSeconds)} / ${formatMinutesCompact(maxRuntimeSeconds)}`;
    }

    function runtimeInfo(device: DeviceOut, currentTimestamp: number): { label: string; percent: number } | undefined {
        const runningDevice = device.running_device;
        if (!runningDevice?.started_at || !runningDevice?.max_runtime) {
            return undefined;
        }
        const elapsedSeconds = Math.max(0, (currentTimestamp - new Date(runningDevice.started_at).getTime()) / 1000);
        const maxRuntimeSeconds = runningDevice.max_runtime;
        return {
            label: formatRuntimeLabel(elapsedSeconds, maxRuntimeSeconds),
            percent: Math.min(100, (elapsedSeconds / maxRuntimeSeconds) * 100)
        };
    }

    function formatDateTime(isoString: string | null | undefined): string {
        if (!isoString) {
            return 'Unknown';
        }
        return new Date(isoString).toLocaleString();
    }

    function formatDurationFromSeconds(totalSeconds: number | undefined): string {
        if (totalSeconds === undefined || totalSeconds === null) {
            return 'Unknown';
        }
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        const parts = [];
        if (hours > 0) {
            parts.push(`${hours}h`);
        }
        if (hours > 0 || minutes > 0) {
            parts.push(`${minutes}m`);
        }
        parts.push(`${seconds}s`);
        return parts.join(' ');
    }

    function runDuration(run: DeviceRun): string {
        if (typeof run.runtime === 'number') {
            return formatDurationFromSeconds(run.runtime);
        }
        if (run.started_at && run.ended_at) {
            const durationSeconds = (new Date(run.ended_at as string).getTime() - new Date(run.started_at as string).getTime()) / 1000;
            return formatDurationFromSeconds(durationSeconds);
        }
        return 'Unknown';
    }

    function sortedRuns(runs: DeviceRun[] | undefined): DeviceRun[] {
        if (!runs) {
            return [];
        }
        return [...runs].sort((firstRun, secondRun) => {
            const firstTimestamp = firstRun.started_at ? new Date(firstRun.started_at as string).getTime() : 0;
            const secondTimestamp = secondRun.started_at ? new Date(secondRun.started_at as string).getTime() : 0;
            return secondTimestamp - firstTimestamp;
        });
    }

    async function toggleDeviceExpanded(device: DeviceOut) {
        if (expandedDeviceId === device.id) {
            expandedDeviceId = undefined;
            //collapsing dismisses the "developer settings opened" hint so it does not linger forever
            if (deviceDetailsByDeviceId[device.id]?.devModeEnabledHintVisible) {
                deviceDetailsByDeviceId = {
                    ...deviceDetailsByDeviceId,
                    [device.id]: { ...deviceDetailsByDeviceId[device.id], devModeEnabledHintVisible: false }
                };
            }
            return;
        }
        expandedDeviceId = device.id;
        if (!deviceDetailsByDeviceId[device.id]) {
            await loadDeviceDetails(device.id);
        }
    }

    /**
     * Resolves which snapshot the Start picker should have selected: the preserved selection when it
     * still exists in the refreshed list, otherwise the user's remembered pick, otherwise the device's
     * live snapshot, otherwise its last_snapshot_id, otherwise the first ready snapshot, otherwise
     * undefined. This keeps the selection from going stale after a snapshot is deleted (elsewhere, or
     * via this same view), and defaults an untouched picker to the live snapshot rather than whatever
     * happens to be last_snapshot_id.
     */
    function resolveSelectedSnapshotId(
        snapshots: SnapshotOut[] | undefined,
        preferredSnapshotId: number | undefined,
        lastUsedSnapshotId: number | undefined,
        deviceLastSnapshotId: number | null | undefined
    ): number | undefined {
        const availableSnapshotIds = new Set((snapshots ?? []).map((snapshot) => snapshot.id));
        const liveSnapshotId = (snapshots ?? []).find((snapshot) => snapshot.live)?.id;
        const candidateSnapshotIds = [preferredSnapshotId, lastUsedSnapshotId, liveSnapshotId, deviceLastSnapshotId ?? undefined];
        for (const candidateSnapshotId of candidateSnapshotIds) {
            if (candidateSnapshotId !== undefined && availableSnapshotIds.has(candidateSnapshotId)) {
                return candidateSnapshotId;
            }
        }
        return (snapshots ?? []).find((snapshot) => snapshot.ready !== false)?.id;
    }

    async function loadDeviceDetails(deviceId: number) {
        const existingSelection = deviceDetailsByDeviceId[deviceId]?.selectedSnapshotId;
        const existingUserPickedSnapshotId = deviceDetailsByDeviceId[deviceId]?.userPickedSnapshotId ?? false;
        //preserved across the refetch: the onRceStateChanged push that follows a successful
        //enableRceDevMode call would otherwise refetch details immediately and wipe this out before
        //the user ever sees it. It is cleared explicitly instead, when the device is collapsed or
        //stops running (see toggleDeviceExpanded and the {#if device.status === 'running'} guard).
        const existingDevModeEnabledHintVisible = deviceDetailsByDeviceId[deviceId]?.devModeEnabledHintVisible ?? false;
        deviceDetailsByDeviceId = {
            ...deviceDetailsByDeviceId,
            [deviceId]: {
                ...(deviceDetailsByDeviceId[deviceId] ?? { snapshots: undefined, runs: undefined, lastUsedSnapshotId: undefined, error: undefined, selectedSnapshotId: undefined, userPickedSnapshotId: false, devModeEnabledHintVisible: false }),
                loading: true
            }
        };

        const details = await intermediary.sendCommand(ViewProviderCommand.getRceDeviceDetails, {
            deviceId: deviceId
        });

        const device = devices?.find((candidateDevice) => candidateDevice.id === deviceId);
        const resolvedSnapshotId = resolveSelectedSnapshotId(details.snapshots, existingSelection, details.lastUsedSnapshotId, device?.last_snapshot_id);
        //the "user picked" flag only survives when the preserved selection is what actually won; any other
        //outcome means the picker landed on a freshly-resolved default, not something the user chose
        const preservedSelectionSurvived = existingSelection !== undefined && resolvedSnapshotId === existingSelection;

        deviceDetailsByDeviceId = {
            ...deviceDetailsByDeviceId,
            [deviceId]: {
                loading: false,
                snapshots: details.snapshots,
                runs: details.runs,
                lastUsedSnapshotId: details.lastUsedSnapshotId,
                error: details.error,
                selectedSnapshotId: resolvedSnapshotId,
                userPickedSnapshotId: preservedSelectionSurvived ? existingUserPickedSnapshotId : false,
                devModeEnabledHintVisible: existingDevModeEnabledHintVisible
            }
        };
    }

    /**
     * The dropdown's change handler: any change here is a deliberate user pick, even one that lands back
     * on the value that was already selected, so the flag is always set unconditionally.
     */
    function updateSelectedSnapshot(deviceId: number, rawSnapshotId: string) {
        const snapshotId = rawSnapshotId ? Number(rawSnapshotId) : undefined;
        deviceDetailsByDeviceId = {
            ...deviceDetailsByDeviceId,
            [deviceId]: { ...deviceDetailsByDeviceId[deviceId], selectedSnapshotId: snapshotId, userPickedSnapshotId: true }
        };
    }

    function startEditingDevice(device: DeviceOut) {
        editingDeviceId = device.id;
        editName = device.name;
        editNote = device.note ?? '';
        editDeviceError = undefined;
    }

    function cancelEditingDevice() {
        editingDeviceId = undefined;
    }

    async function saveDeviceEdits(device: DeviceOut) {
        savingDeviceEdit = true;
        editDeviceError = undefined;
        try {
            await intermediary.sendCommand(ViewProviderCommand.updateRceDevice, {
                deviceId: device.id,
                name: editName,
                note: editNote || undefined
            });
            editingDeviceId = undefined;
        } catch (error) {
            editDeviceError = error.message;
        } finally {
            savingDeviceEdit = false;
        }
    }

    async function deleteSnapshot(device: DeviceOut, snapshot: SnapshotOut) {
        deletingSnapshotId = snapshot.id;
        try {
            await intermediary.sendCommand(ViewProviderCommand.deleteRceSnapshot, {
                deviceId: device.id,
                snapshotId: snapshot.id,
                snapshotName: snapshot.name
            });
            await loadDeviceDetails(device.id);
        } catch (error) {
            deviceActionError = error.message;
        } finally {
            deletingSnapshotId = undefined;
        }
    }

    async function enableDevMode(device: DeviceOut) {
        deviceActionError = undefined;
        enablingDevModeInFlight = { ...enablingDevModeInFlight, [device.id]: true };
        try {
            await intermediary.sendCommand(ViewProviderCommand.enableRceDevMode, {
                deviceId: device.id
            });
            //surfaced until the details are refetched (loadDeviceDetails always clears it)
            deviceDetailsByDeviceId = {
                ...deviceDetailsByDeviceId,
                [device.id]: { ...deviceDetailsByDeviceId[device.id], devModeEnabledHintVisible: true }
            };
        } catch (error) {
            deviceActionError = error.message;
        } finally {
            enablingDevModeInFlight = { ...enablingDevModeInFlight, [device.id]: false };
        }
    }

    // Required by any view so we can know that the view is ready to receive messages
    intermediary.sendViewReady();
    loadState();

    interface DeviceDetailsState {
        loading: boolean;
        snapshots: SnapshotOut[] | undefined;
        runs: DeviceRun[] | undefined;
        lastUsedSnapshotId: number | undefined;
        error: string | undefined;
        selectedSnapshotId: number | undefined;
        /** Whether selectedSnapshotId reflects a deliberate dropdown pick rather than a resolved default */
        userPickedSnapshotId: boolean;
        /** Shown after a successful enableRceDevMode call, until the details are next refetched */
        devModeEnabledHintVisible: boolean;
    }
</script>

<style>
    #container {
        padding: 10px;
    }

    .sectionTitle {
        font-weight: bold;
        display: block;
        margin-bottom: 6px;
    }

    #accountSection {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        margin-bottom: 10px;
    }

    #accountSection vscode-dropdown {
        flex: 1;
        min-width: 120px;
    }

    #devicesHeader {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 10px 0 6px 0;
    }

    #devicesHeader .sectionTitle {
        flex: 1;
        margin-bottom: 0;
    }

    #createDeviceForm {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 8px;
        margin-bottom: 10px;
        background-color: var(--vscode-sideBar-background);
    }

    .empty-state {
        padding: 10px 0;
        opacity: 0.7;
    }

    .errorBanner {
        color: var(--vscode-debugConsole-errorForeground);
        margin-bottom: 10px;
        overflow-wrap: anywhere;
    }

    .deviceRow {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 0;
    }

    .deviceInfo {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        cursor: pointer;
    }

    .deviceName {
        font-weight: bold;
        overflow-wrap: anywhere;
    }

    .deviceMeta {
        opacity: 0.7;
        font-size: 0.9em;
    }

    .deviceRuntime {
        opacity: 0.7;
        font-size: 0.85em;
        margin-top: 2px;
    }

    .runtimeBarTrack {
        margin-top: 2px;
        width: 100%;
        max-width: 160px;
        height: 2px;
        background-color: var(--vscode-sideBar-background);
        border-radius: 1px;
        overflow: hidden;
    }

    .runtimeBarFill {
        height: 100%;
        background-color: var(--vscode-progressBar-background);
    }

    .deviceDetails {
        padding: 8px 8px 8px 16px;
        margin-bottom: 4px;
        background-color: var(--vscode-sideBar-background);
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .detailsSectionTitle {
        font-weight: bold;
        font-size: 0.9em;
        opacity: 0.85;
        margin-bottom: 4px;
    }

    .detailsMeta {
        font-size: 0.9em;
        opacity: 0.8;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .editRow {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .editFields {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .startControl {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .startControl vscode-dropdown {
        flex: 1;
        min-width: 100px;
    }

    .snapshotRow, .historyRow {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.9em;
        padding: 3px 0;
    }

    .snapshotInfo, .historyInfo {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
    }

    .snapshotName {
        font-weight: bold;
    }

    .snapshotMeta, .historyMeta {
        opacity: 0.7;
        font-size: 0.9em;
        overflow-wrap: anywhere;
    }

    .mutedNote {
        opacity: 0.6;
        font-size: 0.85em;
    }
</style>

{#if loading}
    <Loader />
{:else}
    <div id="container">
        {#if accounts.length === 0 && !hasToken}
            <div class="empty-state">
                <p>No Cloud Emulator accounts are configured yet.</p>
                <vscode-button on:click={() => runAccountCommand('addAccount')}>Add Account</vscode-button>
            </div>
        {:else}
            <div id="accountSection">
                <vscode-dropdown value={activeAccountName} on:change={onActiveAccountChange}>
                    {#each accounts as accountName}
                        <vscode-option value={accountName}>{accountName}</vscode-option>
                    {/each}
                </vscode-dropdown>
                <vscode-button appearance="secondary" on:click={() => runAccountCommand('addAccount')}>Add Account</vscode-button>
                <vscode-button appearance="secondary" on:click={() => runAccountCommand('removeAccount')}>Remove Account</vscode-button>
            </div>

            <vscode-divider />

            {#if stateError}
                <div class="errorBanner">{stateError}</div>
            {/if}

            {#if deviceActionError}
                <div class="errorBanner">{deviceActionError}</div>
            {/if}

            <div id="devicesHeader">
                <span class="sectionTitle">Devices</span>
                <vscode-button appearance="icon" title="Refresh" on:click={loadState}>
                    <Refresh />
                </vscode-button>
                <vscode-button appearance="secondary" on:click={toggleCreateDeviceForm}>
                    {showCreateDeviceForm ? 'Cancel' : 'Create Device'}
                </vscode-button>
            </div>

            {#if showCreateDeviceForm}
                <div id="createDeviceForm">
                    <vscode-text-field placeholder="Name" value={newDeviceName} on:input={(event) => (newDeviceName = event.target.value)} />
                    <vscode-dropdown value={newDeviceType} on:change={(event) => (newDeviceType = event.target.value)}>
                        <vscode-option value="tv">tv</vscode-option>
                        <vscode-option value="stb">stb</vscode-option>
                    </vscode-dropdown>
                    <vscode-text-field placeholder="Note (optional)" value={newDeviceNote} on:input={(event) => (newDeviceNote = event.target.value)} />
                    {#if createDeviceError}
                        <div class="errorBanner">{createDeviceError}</div>
                    {/if}
                    <vscode-button disabled={!newDeviceName || creatingDevice} on:click={createDevice}>Create</vscode-button>
                </div>
            {/if}

            {#if devices === undefined || devices.length === 0}
                <p class="empty-state">This account has no devices yet.</p>
            {:else}
                {#each devices as device (device.id)}
                    {@const runtime = runtimeInfo(device, nowTimestamp)}
                    {@const detailsState = deviceDetailsByDeviceId[device.id]}
                    <div class="deviceRow">
                        <div class="deviceInfo" on:click={() => toggleDeviceExpanded(device)}>
                            <span class="deviceName">{device.name}</span>
                            <span class="deviceMeta">{device.device_type} &middot; {device.status ?? 'unknown'} &middot; {device.last_snapshot_name ?? 'no snapshot'}</span>
                            {#if runtime}
                                <span class="deviceRuntime">{runtime.label}</span>
                                <div class="runtimeBarTrack">
                                    <div class="runtimeBarFill" style="width: {runtime.percent}%" />
                                </div>
                            {/if}
                        </div>
                        {#if device.status === 'shutdown'}
                            <vscode-button disabled={deviceActionsInFlight[device.id]} on:click={() => startDevice(device)}>Start</vscode-button>
                        {:else if device.status === 'running' || device.status === 'pending'}
                            <vscode-button disabled={deviceActionsInFlight[device.id]} on:click={() => stopDevice(device)}>Stop</vscode-button>
                        {/if}
                    </div>

                    {#if expandedDeviceId === device.id}
                        <div class="deviceDetails">
                            {#if !detailsState || detailsState.loading}
                                <Loader />
                            {:else}
                                {#if detailsState.error}
                                    <div class="errorBanner">{detailsState.error}</div>
                                {/if}

                                <div class="detailsMeta">
                                    <span>Created: {formatDateTime(device.created_at)}</span>
                                    {#if device.serial_number}
                                        <span>Serial number: {device.serial_number}</span>
                                    {/if}
                                </div>

                                {#if device.status === 'running'}
                                    <div class="editRow">
                                        <vscode-button
                                            appearance="secondary"
                                            disabled={enablingDevModeInFlight[device.id]}
                                            on:click={() => enableDevMode(device)}>
                                            Enable Dev Mode
                                        </vscode-button>
                                    </div>
                                    {#if detailsState.devModeEnabledHintVisible}
                                        <span class="mutedNote">Developer settings opened on the device. Complete the setup on screen.</span>
                                    {/if}
                                {/if}

                                {#if editingDeviceId === device.id}
                                    <div class="editFields">
                                        <vscode-text-field placeholder="Name" value={editName} on:input={(event) => (editName = event.target.value)} />
                                        <vscode-text-field placeholder="Note" value={editNote} on:input={(event) => (editNote = event.target.value)} />
                                        {#if editDeviceError}
                                            <div class="errorBanner">{editDeviceError}</div>
                                        {/if}
                                        <div class="editRow">
                                            <vscode-button appearance="icon" title="Save" disabled={!editName || savingDeviceEdit} on:click={() => saveDeviceEdits(device)}>
                                                <Check />
                                            </vscode-button>
                                            <vscode-button appearance="icon" title="Cancel" disabled={savingDeviceEdit} on:click={cancelEditingDevice}>
                                                <Close />
                                            </vscode-button>
                                        </div>
                                    </div>
                                {:else}
                                    <div class="editRow">
                                        <span>Note: {device.note || 'No note'}</span>
                                        <vscode-button appearance="icon" title="Edit name and note" on:click={() => startEditingDevice(device)}>
                                            <Edit />
                                        </vscode-button>
                                    </div>
                                {/if}

                                {#if device.status === 'shutdown'}
                                    <div class="startControl">
                                        <vscode-dropdown
                                            value={detailsState.selectedSnapshotId !== undefined ? String(detailsState.selectedSnapshotId) : ''}
                                            on:change={(event) => updateSelectedSnapshot(device.id, event.target.value)}>
                                            {#each detailsState.snapshots ?? [] as snapshot}
                                                <vscode-option value={String(snapshot.id)} disabled={snapshot.ready === false}>
                                                    {snapshot.name ?? `Snapshot ${snapshot.id}`}{snapshot.ready === false ? ' (not ready)' : ''}
                                                </vscode-option>
                                            {/each}
                                        </vscode-dropdown>
                                        <vscode-button
                                            disabled={deviceActionsInFlight[device.id] || !detailsState.selectedSnapshotId}
                                            on:click={() => startDevice(device, detailsState.userPickedSnapshotId ? detailsState.selectedSnapshotId : undefined)}>
                                            Start
                                        </vscode-button>
                                    </div>
                                {/if}

                                <div>
                                    <div class="detailsSectionTitle">Snapshots</div>
                                    {#if (detailsState.snapshots ?? []).length === 0}
                                        <span class="mutedNote">No snapshots yet.</span>
                                    {:else}
                                        {#each detailsState.snapshots as snapshot (snapshot.id)}
                                            <div class="snapshotRow">
                                                <div class="snapshotInfo">
                                                    <span class="snapshotName">
                                                        {snapshot.name ?? `Snapshot ${snapshot.id}`}
                                                        {#if snapshot.live}
                                                            <span class="mutedNote">(live)</span>
                                                        {/if}
                                                        {#if snapshot.base}
                                                            <span class="mutedNote">(base)</span>
                                                        {/if}
                                                    </span>
                                                    <span class="snapshotMeta">
                                                        {formatDateTime(snapshot.created_at)}
                                                        {#if snapshot.firmware_version_display_name}
                                                            &middot; {snapshot.firmware_version_display_name}
                                                        {/if}
                                                        {#if snapshot.note}
                                                            &middot; {snapshot.note}
                                                        {/if}
                                                    </span>
                                                </div>
                                                {#if !snapshot.live && !snapshot.base}
                                                    <vscode-button
                                                        appearance="icon"
                                                        title="Delete snapshot"
                                                        disabled={deletingSnapshotId === snapshot.id}
                                                        on:click={() => deleteSnapshot(device, snapshot)}>
                                                        <Trash />
                                                    </vscode-button>
                                                {/if}
                                            </div>
                                        {/each}
                                    {/if}
                                </div>

                                <div>
                                    <div class="detailsSectionTitle">History</div>
                                    {#if sortedRuns(detailsState.runs).length === 0}
                                        <span class="mutedNote">No run history yet.</span>
                                    {:else}
                                        {#each sortedRuns(detailsState.runs).slice(0, 10) as run}
                                            <div class="historyRow">
                                                <div class="historyInfo">
                                                    <span>{run.creator_username ?? 'Unknown user'} &middot; {run.snapshot_name ?? 'Unknown snapshot'}</span>
                                                    <span class="historyMeta">{formatDateTime(run.started_at as string)} &middot; {runDuration(run)}</span>
                                                </div>
                                            </div>
                                        {/each}
                                        {#if sortedRuns(detailsState.runs).length > 10}
                                            <span class="mutedNote">+{sortedRuns(detailsState.runs).length - 10} more</span>
                                        {/if}
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    {/if}

                    <vscode-divider />
                {/each}
            {/if}
        {/if}
    </div>
{/if}
