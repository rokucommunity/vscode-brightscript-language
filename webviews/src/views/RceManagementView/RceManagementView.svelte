<script lang="ts">
    window.vscode = acquireVsCodeApi();

    import { onDestroy } from 'svelte';
    import type { DeviceRun, SnapshotOut } from 'roku-deploy';
    import type { RceStateDevice } from '../../../../src/viewProviders/RceManagementViewProvider';
    import { Refresh, Edit, Check, Close, Trash, Play, DebugStop, ChevronRight, ChevronDown } from 'svelte-codicons';
    import { intermediary } from '../../ExtensionIntermediary';
    import Loader from '../../shared/Loader.svelte';
    import VscodeDropdown from '../../shared/vscode-ui-toolkit/VscodeDropdown.svelte';
    import { ViewProviderCommand } from '../../../../src/viewProviders/ViewProviderCommand';
    import { ViewProviderEvent } from '../../../../src/viewProviders/ViewProviderEvent';

    let loading = true;

    let accounts: string[] = [];
    let activeAccountName: string | undefined = undefined;
    let hasToken = false;
    let devices: RceStateDevice[] | undefined = undefined;
    let stateError: string | undefined = undefined;

    let showCreateDeviceForm = false;
    let creatingDevice = false;
    let createDeviceError: string | undefined = undefined;
    let newDeviceName = '';
    let newDeviceType: 'tv' | 'stb' = 'tv';
    let newDeviceNote = '';

    let deviceActionError: string | undefined = undefined;
    let deviceActionsInFlight: Record<number, boolean> = {};

    //max-runtime choices offered when starting a device, capped by the org's runtime limit; the
    //limit itself becomes the top choice when the presets don't land on it exactly. Picks are kept
    //outside DeviceDetailsState so a details refetch does not reset them
    const runtimeHourPresets = [1, 2, 4, 8, 16, 24, 48];
    const defaultRuntimeHours = 1;
    let selectedRuntimeHoursByDeviceId: Record<number, number> = {};
    let maxProjectRuntimeSeconds: number | undefined = undefined;
    $: runtimeHourOptions = buildRuntimeHourOptions(maxProjectRuntimeSeconds);

    function buildRuntimeHourOptions(orgMaxRuntimeSeconds: number | undefined): number[] {
        if (!orgMaxRuntimeSeconds) {
            return runtimeHourPresets;
        }
        const maxHours = orgMaxRuntimeSeconds / 3600;
        const options = runtimeHourPresets.filter((hours) => hours <= maxHours);
        if (!options.includes(maxHours)) {
            options.push(maxHours);
        }
        return options;
    }

    /**
     * Resolves the hours a start request should use: the user's pick when the current option list
     * still offers it (an account switch can lower the cap), otherwise the default.
     */
    function resolveRuntimeHours(pickedHours: number | undefined, availableOptions: number[]): number {
        if (pickedHours !== undefined && availableOptions.includes(pickedHours)) {
            return pickedHours;
        }
        return availableOptions.includes(defaultRuntimeHours) ? defaultRuntimeHours : availableOptions[0];
    }

    let expandedDeviceId: number | undefined = undefined;
    let deviceDetailsByDeviceId: Record<number, DeviceDetailsState> = {};
    let snapshotDropdownsByDeviceId: Record<number, VscodeDropdown | null> = {};
    let historyExpandedByDeviceId: Record<number, boolean> = {};

    let editingDeviceId: number | undefined = undefined;
    let editName = '';
    let editNote = '';
    let savingDeviceEdit = false;
    let editDeviceError: string | undefined = undefined;

    let deletingSnapshotId: number | undefined = undefined;

    let enablingDevModeInFlight: Record<number, boolean> = {};
    let watchingDeviceInFlight: Record<number, boolean> = {};

    //the running-device snapshot form; only one device's form is open at a time
    let snapshotFormDeviceId: number | undefined = undefined;
    let newSnapshotName = '';
    let newSnapshotNote = '';
    let creatingSnapshot = false;
    let createSnapshotError: string | undefined = undefined;

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
        maxProjectRuntimeSeconds = state.maxProjectRuntimeSeconds;
        stateError = state.error;
        loading = false;
        ensureRowSnapshotDetails(devices);
    }

    /**
     * Eagerly loads details for stopped devices so every row's snapshot picker has names without
     * expanding the device. State re-applies on every finder poll, so this only fetches when the
     * cache is missing or the device's snapshot id list no longer matches what was cached.
     */
    function ensureRowSnapshotDetails(currentDevices: RceStateDevice[] | undefined) {
        for (const device of currentDevices ?? []) {
            //the state observer separately refreshes the expanded device's details
            if (device.status !== 'shutdown' || device.id === expandedDeviceId) {
                continue;
            }
            const detailsState = deviceDetailsByDeviceId[device.id];
            if (detailsState?.loading) {
                continue;
            }
            const cachedSnapshotIds = (detailsState?.snapshots ?? []).map((snapshot) => snapshot.id);
            const deviceSnapshotIds = device.snapshots ?? [];
            const cacheIsCurrent = detailsState !== undefined &&
                cachedSnapshotIds.length === deviceSnapshotIds.length &&
                deviceSnapshotIds.every((snapshotId) => cachedSnapshotIds.includes(snapshotId));
            if (!cacheIsCurrent) {
                void loadDeviceDetails(device.id);
            }
        }
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

    async function startDevice(device: RceStateDevice, snapshotId: number | undefined = undefined) {
        deviceActionError = undefined;
        deviceActionsInFlight = { ...deviceActionsInFlight, [device.id]: true };
        try {
            await intermediary.sendCommand(ViewProviderCommand.startRceDevice, {
                deviceId: device.id,
                snapshotId: snapshotId,
                maxRuntimeSeconds: resolveRuntimeHours(selectedRuntimeHoursByDeviceId[device.id], runtimeHourOptions) * 3600
            });
        } catch (error) {
            deviceActionError = error.message;
        } finally {
            deviceActionsInFlight = { ...deviceActionsInFlight, [device.id]: false };
        }
    }

    async function stopDevice(device: RceStateDevice) {
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

    function runtimeInfo(device: RceStateDevice, currentTimestamp: number): { label: string; percent: number } | undefined {
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

    function statusDotClass(status: string | undefined): string {
        if (status === 'running') {
            return 'statusRunning';
        }
        if (status === 'pending') {
            return 'statusPending';
        }
        return 'statusStopped';
    }

    function toggleHistoryExpanded(deviceId: number) {
        historyExpandedByDeviceId = { ...historyExpandedByDeviceId, [deviceId]: !historyExpandedByDeviceId[deviceId] };
    }

    async function toggleDeviceExpanded(device: RceStateDevice) {
        if (expandedDeviceId === device.id) {
            expandedDeviceId = undefined;
            //collapsing dismisses the action hints so they do not linger forever
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
     * Resolves which snapshot the Start picker should have selected: the user's own in-session pick
     * when it still exists in the refreshed list, otherwise the snapshot the device's most recent run
     * actually started from (the run history is the authoritative cross-window record of "last one
     * used"), otherwise the extension's own remembered last-start (covers a missing or lagging run
     * record), otherwise the device's live snapshot, otherwise the first ready snapshot, otherwise
     * undefined. The api's last_snapshot_id (last CREATED, not last used) is deliberately not
     * consulted. Whatever this lands on is exactly what Start sends: the picker is the single source
     * of truth, the provider never resolves a snapshot itself.
     *
     * Only a deliberate pick may ride through as preferredSnapshotId. A stop rewrites the snapshot
     * list (the live flag moves to the just-saved state) across several transition-watch refetches,
     * and if a resolved default were fed back in as the preferred candidate, one mid-transition
     * resolution landing on live would stick there forever instead of returning to the last-started
     * snapshot once the list settles.
     */
    function resolveSelectedSnapshotId(
        snapshots: SnapshotOut[] | undefined,
        preferredSnapshotId: number | undefined,
        latestRunSnapshotId: number | undefined,
        rememberedSnapshotId: number | undefined
    ): number | undefined {
        const availableSnapshotIds = new Set((snapshots ?? []).map((snapshot) => snapshot.id));
        const liveSnapshotId = (snapshots ?? []).find((snapshot) => snapshot.live)?.id;
        const candidateSnapshotIds = [preferredSnapshotId, latestRunSnapshotId, rememberedSnapshotId, liveSnapshotId];
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

        const preferredSnapshotId = existingUserPickedSnapshotId ? existingSelection : undefined;
        const latestRunSnapshotId = sortedRuns(details.runs)[0]?.snapshot_id;
        const resolvedSnapshotId = resolveSelectedSnapshotId(details.snapshots, preferredSnapshotId, latestRunSnapshotId, details.lastUsedSnapshotId);
        //the pick flag only survives while the picked snapshot is what actually stays selected
        const pickSurvived = preferredSnapshotId !== undefined && resolvedSnapshotId === preferredSnapshotId;

        deviceDetailsByDeviceId = {
            ...deviceDetailsByDeviceId,
            [deviceId]: {
                loading: false,
                snapshots: details.snapshots,
                runs: details.runs,
                lastUsedSnapshotId: details.lastUsedSnapshotId,
                error: details.error,
                selectedSnapshotId: resolvedSnapshotId,
                userPickedSnapshotId: pickSurvived,
                devModeEnabledHintVisible: existingDevModeEnabledHintVisible
            }
        };
    }

    /**
     * True only while a device's very first details fetch is in flight (nothing cached yet, not even
     * an error). Refreshes after that keep showing the existing content and swap it in place when the
     * new details arrive, instead of collapsing the expanded section back to a spinner.
     */
    function isFirstDetailsLoad(detailsState: DeviceDetailsState | undefined): boolean {
        return !detailsState || (detailsState.loading && detailsState.snapshots === undefined && detailsState.error === undefined);
    }

    function updateSelectedRuntimeHours(deviceId: number, rawHours: string) {
        selectedRuntimeHoursByDeviceId = { ...selectedRuntimeHoursByDeviceId, [deviceId]: Number(rawHours) };
    }

    /**
     * The snapshot Start actually uses: read from the dropdown itself at click time, so what starts
     * is exactly what the user sees, even if the element's internal selection ever drifts from our
     * state mirror. The state mirror is only the fallback for a dropdown with no readable value.
     */
    function readDisplayedSnapshotId(deviceId: number): number | undefined {
        const rawValue = snapshotDropdownsByDeviceId[deviceId]?.readDisplayedValue();
        if (rawValue) {
            return Number(rawValue);
        }
        return deviceDetailsByDeviceId[deviceId]?.selectedSnapshotId;
    }

    function updateSelectedSnapshot(deviceId: number, rawSnapshotId: string) {
        const snapshotId = rawSnapshotId ? Number(rawSnapshotId) : undefined;
        deviceDetailsByDeviceId = {
            ...deviceDetailsByDeviceId,
            [deviceId]: { ...deviceDetailsByDeviceId[deviceId], selectedSnapshotId: snapshotId, userPickedSnapshotId: snapshotId !== undefined }
        };
    }

    function startEditingDevice(device: RceStateDevice) {
        editingDeviceId = device.id;
        editName = device.name;
        editNote = device.note ?? '';
        editDeviceError = undefined;
    }

    function cancelEditingDevice() {
        editingDeviceId = undefined;
    }

    async function saveDeviceEdits(device: RceStateDevice) {
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

    async function deleteSnapshot(device: RceStateDevice, snapshot: SnapshotOut) {
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

    async function enableDevMode(device: RceStateDevice) {
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

    function toggleSnapshotForm(device: RceStateDevice) {
        if (snapshotFormDeviceId === device.id) {
            snapshotFormDeviceId = undefined;
            return;
        }
        snapshotFormDeviceId = device.id;
        newSnapshotName = '';
        newSnapshotNote = '';
        createSnapshotError = undefined;
    }

    async function createSnapshot(device: RceStateDevice) {
        creatingSnapshot = true;
        createSnapshotError = undefined;
        try {
            await intermediary.sendCommand(ViewProviderCommand.createRceSnapshot, {
                deviceId: device.id,
                name: newSnapshotName,
                note: newSnapshotNote || undefined
            });
            snapshotFormDeviceId = undefined;
            //running devices sit outside ensureRowSnapshotDetails' staleness sweep (it only walks
            //stopped devices), so a cached snapshot list has to be refreshed here explicitly
            if (deviceDetailsByDeviceId[device.id]) {
                await loadDeviceDetails(device.id);
            }
        } catch (error) {
            createSnapshotError = error.message;
        } finally {
            creatingSnapshot = false;
        }
    }

    async function watchDevice(device: RceStateDevice) {
        deviceActionError = undefined;
        watchingDeviceInFlight = { ...watchingDeviceInFlight, [device.id]: true };
        try {
            await intermediary.sendCommand(ViewProviderCommand.watchRceDevice, {
                deviceId: device.id,
                //lets the editor tab title itself before the stream details resolve
                deviceName: device.name
            });
        } catch (error) {
            deviceActionError = error.message;
        } finally {
            watchingDeviceInFlight = { ...watchingDeviceInFlight, [device.id]: false };
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
        /** What the Start picker shows, and therefore exactly what Start will send */
        selectedSnapshotId: number | undefined;
        /**
         * Whether selectedSnapshotId is a deliberate in-session dropdown pick. Gates whether the
         * selection is fed back into resolveSelectedSnapshotId as the preferred candidate on the
         * next refetch; never sent to the provider (Start always sends selectedSnapshotId as-is)
         */
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

    #createDeviceForm, .snapshotForm {
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
        /* the start control wraps under the device info when the sidebar is too narrow for one line */
        flex-wrap: wrap;
    }

    .deviceInfo {
        flex: 1;
        min-width: 140px;
        display: flex;
        flex-direction: column;
        cursor: pointer;
    }

    .deviceName {
        font-weight: bold;
        overflow-wrap: anywhere;
        display: flex;
        align-items: center;
        gap: 2px;
    }

    .expandCaret {
        display: inline-flex;
        align-items: center;
        flex-shrink: 0;
    }

    .expandCaret :global(svg) {
        width: 14px;
        height: 14px;
    }

    .expandableSectionTitle {
        display: flex;
        align-items: center;
        gap: 2px;
        cursor: pointer;
        user-select: none;
    }

    .statusDot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
        margin-right: 2px;
    }

    .statusDot.statusRunning {
        background-color: var(--vscode-testing-iconPassed);
    }

    .statusDot.statusPending {
        background-color: var(--vscode-charts-yellow);
    }

    .statusDot.statusStopped {
        background-color: var(--vscode-disabledForeground);
    }

    .indented {
        margin-left: 20px;
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
        height: 3px;
        /* the details panel behind this bar is sideBar-background, so the track needs a
           contrasting color of its own or the fill has nothing to read against */
        background-color: var(--vscode-scrollbarSlider-background);
        border-radius: 2px;
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
        flex: 1;
    }

    .startControl vscode-dropdown {
        flex: 1;
        min-width: 100px;
    }

    .startControl .runtimeDropdown {
        flex: 0 0 auto;
        min-width: 62px;
    }

    .snapshotRow, .historyRow {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.9em;
        padding: 3px 0;
        margin-left: 20px;
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
                <vscode-button on:click={() => runAccountCommand('addAccount')}>Add Account</vscode-button>
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
                <vscode-button appearance={showCreateDeviceForm ? 'secondary' : undefined} on:click={toggleCreateDeviceForm}>
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
                            <span class="deviceName">
                                <span class="expandCaret">
                                    {#if expandedDeviceId === device.id}<ChevronDown />{:else}<ChevronRight />{/if}
                                </span>
                                <span class="statusDot {statusDotClass(device.status)}" title={device.status ?? 'unknown'}></span>
                                {device.name}
                            </span>
                            <span class="deviceMeta">{device.device_type} &middot; {device.status ?? 'unknown'} &middot; {device.last_snapshot_name ?? 'no snapshot'}</span>
                            {#if runtime}
                                <span class="deviceRuntime">{runtime.label}</span>
                                <div class="runtimeBarTrack">
                                    <div class="runtimeBarFill" style="width: {runtime.percent}%" />
                                </div>
                            {/if}
                        </div>
                        {#if device.status === 'shutdown'}
                            <div class="startControl">
                                <VscodeDropdown
                                    bind:this={snapshotDropdownsByDeviceId[device.id]}
                                    disabled={isFirstDetailsLoad(detailsState)}
                                    value={detailsState?.selectedSnapshotId !== undefined ? String(detailsState.selectedSnapshotId) : undefined}
                                    on:change={(event) => updateSelectedSnapshot(device.id, (event.target as HTMLElement & { value: string }).value)}>
                                    {#if isFirstDetailsLoad(detailsState)}
                                        <vscode-option value="">Loading...</vscode-option>
                                    {:else if (detailsState?.snapshots ?? []).length === 0}
                                        <vscode-option value="">No snapshots</vscode-option>
                                    {:else}
                                        {#each detailsState?.snapshots ?? [] as snapshot}
                                            <vscode-option value={String(snapshot.id)} disabled={snapshot.ready === false}>
                                                {snapshot.name ?? `Snapshot ${snapshot.id}`}{snapshot.ready === false ? ' (not ready)' : ''}
                                            </vscode-option>
                                        {/each}
                                    {/if}
                                </VscodeDropdown>
                                <vscode-dropdown
                                    class="runtimeDropdown"
                                    title="Maximum runtime"
                                    value={String(resolveRuntimeHours(selectedRuntimeHoursByDeviceId[device.id], runtimeHourOptions))}
                                    on:change={(event) => updateSelectedRuntimeHours(device.id, event.target.value)}>
                                    {#each runtimeHourOptions as hours}
                                        <vscode-option value={String(hours)}>{hours}h</vscode-option>
                                    {/each}
                                </vscode-dropdown>
                                <vscode-button
                                    appearance="icon"
                                    title="Start device"
                                    disabled={deviceActionsInFlight[device.id] || !detailsState?.selectedSnapshotId}
                                    on:click={() => startDevice(device, readDisplayedSnapshotId(device.id))}>
                                    <Play />
                                </vscode-button>
                            </div>
                        {:else if device.status === 'running' || device.status === 'pending'}
                            {#if device.status === 'running'}
                                <vscode-button appearance={snapshotFormDeviceId === device.id ? 'secondary' : undefined} on:click={() => toggleSnapshotForm(device)}>
                                    {snapshotFormDeviceId === device.id ? 'Cancel' : 'Snapshot'}
                                </vscode-button>
                            {/if}
                            <vscode-button
                                appearance="icon"
                                title="Stop device"
                                disabled={deviceActionsInFlight[device.id]}
                                on:click={() => stopDevice(device)}>
                                <DebugStop />
                            </vscode-button>
                        {/if}
                    </div>

                    {#if snapshotFormDeviceId === device.id && device.status === 'running'}
                        <div class="snapshotForm">
                            <vscode-text-field placeholder="Name" value={newSnapshotName} on:input={(event) => (newSnapshotName = event.target.value)} />
                            <vscode-text-field placeholder="Note (optional)" value={newSnapshotNote} on:input={(event) => (newSnapshotNote = event.target.value)} />
                            {#if createSnapshotError}
                                <div class="errorBanner">{createSnapshotError}</div>
                            {/if}
                            <vscode-button disabled={!newSnapshotName || creatingSnapshot} on:click={() => createSnapshot(device)}>Create Snapshot</vscode-button>
                            <span class="mutedNote">Captures the device's current state. New snapshots can take a while to become ready.</span>
                        </div>
                    {/if}

                    {#if expandedDeviceId === device.id}
                        <div class="deviceDetails">
                            {#if isFirstDetailsLoad(detailsState)}
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
                                            disabled={watchingDeviceInFlight[device.id]}
                                            on:click={() => watchDevice(device)}>
                                            Watch
                                        </vscode-button>
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

                                <div>
                                    <div class="detailsSectionTitle">Snapshots</div>
                                    {#if (detailsState.snapshots ?? []).length === 0}
                                        <span class="mutedNote indented">No snapshots yet.</span>
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
                                    <div class="detailsSectionTitle expandableSectionTitle" on:click={() => toggleHistoryExpanded(device.id)}>
                                        <span class="expandCaret">
                                            {#if historyExpandedByDeviceId[device.id]}<ChevronDown />{:else}<ChevronRight />{/if}
                                        </span>
                                        History
                                    </div>
                                    {#if historyExpandedByDeviceId[device.id]}
                                        {#if sortedRuns(detailsState.runs).length === 0}
                                            <span class="mutedNote indented">No run history yet.</span>
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
                                                <span class="mutedNote indented">+{sortedRuns(detailsState.runs).length - 10} more</span>
                                            {/if}
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
