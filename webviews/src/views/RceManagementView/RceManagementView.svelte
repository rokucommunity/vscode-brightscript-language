<script lang="ts">
    window.vscode = acquireVsCodeApi();

    import { onDestroy } from 'svelte';
    import type { DeviceRun, FirmwareVersion, Snapshot } from 'roku-deploy';
    import type { RceStateDevice } from '../../../../src/viewProviders/RceManagementViewContract';
    import { ChevronRight, ChevronDown } from 'svelte-codicons';
    import { intermediary } from '../../ExtensionIntermediary';
    import Loader from '../../shared/Loader.svelte';
    import VscodeDropdown from '../../shared/vscode-ui-toolkit/VscodeDropdown.svelte';
    import DeviceTypeIcon from './DeviceTypeIcon.svelte';
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

    //firmware choices offered when starting a device, filtered per device type at render time.
    //Like the runtime picks, firmware picks live outside DeviceDetailsState so a details refetch
    //does not reset them
    let firmwareVersions: FirmwareVersion[] | undefined = undefined;
    let selectedFirmwareIdByDeviceId: Record<number, string> = {};

    let expandedDeviceId: number | undefined = undefined;
    let deviceDetailsByDeviceId: Record<number, DeviceDetailsState> = {};
    let firmwareDropdownsByDeviceId: Record<number, VscodeDropdown | null> = {};
    let historyExpandedByDeviceId: Record<number, boolean> = {};

    //only one device's start-from-snapshot flyout may be open at a time
    let snapshotMenuDeviceId: number | undefined = undefined;
    let splitButtonElementsByDeviceId: Record<number, HTMLDivElement | undefined> = {};

    function handleWindowClick(event: MouseEvent) {
        if (snapshotMenuDeviceId === undefined) {
            return;
        }
        const openSplitButtonElement = splitButtonElementsByDeviceId[snapshotMenuDeviceId];
        if (openSplitButtonElement?.contains(event.target as Node)) {
            return;
        }
        snapshotMenuDeviceId = undefined;
    }

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
        firmwareVersions = state.firmwareVersions;
        stateError = state.error;
        loading = false;
        ensureRowSnapshotDetails(devices);
    }

    /**
     * Eagerly loads details for stopped devices so every row's split button and flyout menu have
     * snapshot names without expanding the device. State re-applies on every finder poll, so this
     * only fetches when the cache is missing or the device's snapshot id list no longer matches
     * what was cached.
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

    async function startDevice(
        device: RceStateDevice,
        snapshotId: number | undefined = undefined,
        firmwareVersionId: string | undefined = undefined,
        confirmation: StartDeviceConfirmation | undefined = undefined
    ) {
        deviceActionError = undefined;
        deviceActionsInFlight = { ...deviceActionsInFlight, [device.id]: true };
        try {
            await intermediary.sendCommand(ViewProviderCommand.startRceDevice, {
                deviceId: device.id,
                snapshotId: snapshotId,
                firmwareVersionId: firmwareVersionId,
                maxRuntimeSeconds: resolveRuntimeHours(selectedRuntimeHoursByDeviceId[device.id], runtimeHourOptions) * 3600,
                snapshotName: confirmation?.snapshotName,
                replacesLiveSnapshot: confirmation?.replacesLiveSnapshot
            });
        } catch (error) {
            deviceActionError = error.message;
        } finally {
            deviceActionsInFlight = { ...deviceActionsInFlight, [device.id]: false };
        }
    }

    function toggleSnapshotMenu(deviceId: number) {
        snapshotMenuDeviceId = snapshotMenuDeviceId === deviceId ? undefined : deviceId;
    }

    function startFromSnapshotMenu(device: RceStateDevice, snapshot: Snapshot) {
        snapshotMenuDeviceId = undefined;
        //only a non-live pick would overwrite the live snapshot's current state on this run
        const confirmation: StartDeviceConfirmation | undefined = snapshot.live === true ? undefined : {
            snapshotName: snapshot.name ?? `Snapshot ${snapshot.id}`,
            replacesLiveSnapshot: true
        };
        void startDevice(device, snapshot.id, resolveFirmwareVersionIdForSnapshot(device, snapshot), confirmation);
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
        const runningDevice = device.runningDevice;
        if (!runningDevice?.startedAt || !runningDevice?.maxRuntime) {
            return undefined;
        }
        const elapsedSeconds = Math.max(0, (currentTimestamp - new Date(runningDevice.startedAt).getTime()) / 1000);
        const maxRuntimeSeconds = runningDevice.maxRuntime;
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
        if (run.startedAt && run.endedAt) {
            const durationSeconds = (new Date(run.endedAt as string).getTime() - new Date(run.startedAt as string).getTime()) / 1000;
            return formatDurationFromSeconds(durationSeconds);
        }
        return 'Unknown';
    }

    function sortedRuns(runs: DeviceRun[] | undefined): DeviceRun[] {
        if (!runs) {
            return [];
        }
        return [...runs].sort((firstRun, secondRun) => {
            const firstTimestamp = firstRun.startedAt ? new Date(firstRun.startedAt as string).getTime() : 0;
            const secondTimestamp = secondRun.startedAt ? new Date(secondRun.startedAt as string).getTime() : 0;
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
     * The snapshot a start defaults to when the user does not pick one from the flyout menu: the
     * device's ready live snapshot, otherwise the first ready snapshot, otherwise undefined.
     */
    function resolveStartSnapshot(detailsState: DeviceDetailsState | undefined): Snapshot | undefined {
        const snapshots = detailsState?.snapshots ?? [];
        return snapshots.find((snapshot) => snapshot.live && snapshot.ready !== false) ?? snapshots.find((snapshot) => snapshot.ready !== false);
    }

    async function loadDeviceDetails(deviceId: number) {
        //preserved across the refetch: the onRceStateChanged push that follows a successful
        //enableRceDevMode call would otherwise refetch details immediately and wipe this out before
        //the user ever sees it. It is cleared explicitly instead, when the device is collapsed or
        //stops running (see toggleDeviceExpanded and the {#if device.status === 'running'} guard).
        const existingDevModeEnabledHintVisible = deviceDetailsByDeviceId[deviceId]?.devModeEnabledHintVisible ?? false;
        deviceDetailsByDeviceId = {
            ...deviceDetailsByDeviceId,
            [deviceId]: {
                ...(deviceDetailsByDeviceId[deviceId] ?? { snapshots: undefined, runs: undefined, error: undefined, devModeEnabledHintVisible: false }),
                loading: true
            }
        };

        const details = await intermediary.sendCommand(ViewProviderCommand.getRceDeviceDetails, {
            deviceId: deviceId
        });

        deviceDetailsByDeviceId = {
            ...deviceDetailsByDeviceId,
            [deviceId]: {
                loading: false,
                snapshots: details.snapshots,
                runs: details.runs,
                error: details.error,
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
     * Resolves which firmware the start control's firmware picker should show: the user's own
     * in-session pick when the option list still offers it, otherwise the default start snapshot's
     * own firmware, otherwise the device's current firmware, otherwise the first option for the
     * device's type.
     */
    function resolveFirmwareVersionId(
        pickedFirmwareVersionId: string | undefined,
        detailsState: DeviceDetailsState | undefined,
        device: RceStateDevice,
        firmwareOptions: FirmwareVersion[]
    ): string | undefined {
        const availableFirmwareIds = firmwareOptions.map((firmwareVersion) => firmwareVersion.firmwareVersionId);
        const startSnapshot = resolveStartSnapshot(detailsState);
        const candidateFirmwareIds = [pickedFirmwareVersionId, startSnapshot?.firmwareVersionId, device.firmwareVersionId];
        for (const candidateFirmwareId of candidateFirmwareIds) {
            if (candidateFirmwareId && availableFirmwareIds.includes(candidateFirmwareId)) {
                return candidateFirmwareId;
            }
        }
        return availableFirmwareIds[0];
    }

    /**
     * The firmware Start actually uses: read from the dropdown itself at click time, so what starts
     * is exactly what the user sees. Undefined (a start whose firmware list never loaded) defers to
     * the provider's own fallback resolution.
     */
    function readDisplayedFirmwareVersionId(deviceId: number): string | undefined {
        return firmwareDropdownsByDeviceId[deviceId]?.readDisplayedValue() ?? selectedFirmwareIdByDeviceId[deviceId];
    }

    /**
     * The firmware a flyout-picked snapshot should start with: the user's explicit pick when the
     * device's firmware options still offer it, otherwise the picked snapshot's own firmware when
     * it's offered, otherwise the displayed default.
     */
    function resolveFirmwareVersionIdForSnapshot(device: RceStateDevice, snapshot: Snapshot): string | undefined {
        const firmwareOptions = (firmwareVersions ?? []).filter((firmwareVersion) => firmwareVersion.deviceType === device.deviceType);
        const availableFirmwareIds = firmwareOptions.map((firmwareVersion) => firmwareVersion.firmwareVersionId);
        const pickedFirmwareVersionId = selectedFirmwareIdByDeviceId[device.id];
        if (pickedFirmwareVersionId && availableFirmwareIds.includes(pickedFirmwareVersionId)) {
            return pickedFirmwareVersionId;
        }
        if (snapshot.firmwareVersionId && availableFirmwareIds.includes(snapshot.firmwareVersionId)) {
            return snapshot.firmwareVersionId;
        }
        return readDisplayedFirmwareVersionId(device.id);
    }

    function updateSelectedFirmware(deviceId: number, firmwareVersionId: string) {
        selectedFirmwareIdByDeviceId = { ...selectedFirmwareIdByDeviceId, [deviceId]: firmwareVersionId };
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

    async function deleteSnapshot(device: RceStateDevice, snapshot: Snapshot) {
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
        snapshots: Snapshot[] | undefined;
        runs: DeviceRun[] | undefined;
        error: string | undefined;
        /** Shown after a successful enableRceDevMode call, until the details are next refetched */
        devModeEnabledHintVisible: boolean;
    }

    /** Tells startDevice the picked snapshot isn't live, so the provider must confirm before starting */
    interface StartDeviceConfirmation {
        snapshotName: string;
        replacesLiveSnapshot: true;
    }
</script>

<style>
    /* vscode-single-select and vscode-textfield ship a fixed 320px host width (the VS Code
       settings-page convention); this view sizes them with its own flex/stretch layout instead.
       :global because the firmware select renders inside the VscodeDropdown wrapper */
    :global(vscode-single-select),
    :global(vscode-textfield) {
        width: auto;
    }

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
        margin-bottom: 10px;
    }

    /* shrinks and truncates like the device-row dropdowns so the account buttons never wrap */
    #accountSection vscode-single-select {
        flex: 1;
        min-width: 70px;
    }

    #devicesHeader {
        display: flex;
        align-items: center;
        gap: 6px;
        /* the New Device button drops to its own line when the header can't fit it */
        flex-wrap: wrap;
        margin: 10px 0 6px 0;
    }

    #devicesHeader .sectionTitle {
        /* out-grows the New Device button so inline free space goes to the title, not the button */
        flex: 999 1 auto;
        margin-bottom: 0;
    }

    /* content-sized inline (the title's grow factor dwarfs this), full width once wrapped alone */
    #devicesHeader vscode-button {
        flex: 1 0 auto;
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

    .getting-started {
        padding: 10px 0;
    }

    .getting-started ol {
        margin: 8px 0 12px;
        padding-left: 20px;
    }

    .getting-started li {
        margin-bottom: 4px;
    }

    .experimentalBanner {
        color: var(--vscode-editorWarning-foreground);
        margin-bottom: 10px;
    }

    .closedBetaBadge {
        display: inline-block;
        background-color: var(--vscode-badge-background);
        color: var(--vscode-badge-foreground);
        border-radius: 2px;
        padding: 1px 6px;
        margin-right: 6px;
        font-size: 0.85em;
        font-weight: bold;
        text-transform: uppercase;
        vertical-align: baseline;
        white-space: nowrap;
    }

    .errorBanner {
        color: var(--vscode-debugConsole-errorForeground);
        margin-bottom: 10px;
        overflow-wrap: anywhere;
    }

    .deviceRow {
        display: flex;
        /* top-aligned so the controls stay level with the title line even when the runtime
           label and progress bar stack below it */
        align-items: flex-start;
        gap: 8px;
        padding: 6px 0;
        /* rowControls wraps under deviceInfo as one unit when the sidebar is too narrow for one line */
        flex-wrap: wrap;
    }

    .deviceInfo {
        /* out-grows the stop/snapshot cluster so it stays compact inline; the start cluster
           carries the same factor, keeping the shutdown row's half-and-half split */
        flex: 999 1 0%;
        min-width: 140px;
        display: flex;
        flex-direction: column;
        cursor: pointer;
    }

    .deviceName {
        font-weight: bold;
        display: flex;
        align-items: center;
        gap: 2px;
        /* matches the controls' height so the top-aligned row centers title and controls together */
        min-height: 26px;
    }

    .deviceNameText {
        flex: 1;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .watchButton {
        margin-left: auto;
        flex-shrink: 0;
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

    /* always its own full-width line at the bottom of the row, below title and controls */
    .deviceRuntimeBlock {
        flex-basis: 100%;
    }

    .deviceRuntime {
        opacity: 0.7;
        font-size: 0.85em;
        margin-top: 2px;
    }

    .runtimeBarTrack {
        margin-top: 2px;
        width: 100%;
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

    /* everything after deviceInfo (start/stop/snapshot/watch controls) as one flex child, so the
       whole cluster wraps below deviceInfo together instead of the watch button wrapping alone */
    .rowControls {
        display: flex;
        align-items: center;
        /* right-aligned so every status's action cluster hugs the same row edge */
        justify-content: flex-end;
        gap: 6px;
        /* content-sized inline (deviceInfo's grow factor dwarfs this), full width once wrapped */
        flex: 1 0 auto;
        min-width: min-content;
    }

    /* the firmware floor (70) + runtime floor (62) + split button (~75) + gaps: the start cluster
       claims its one-line minimum so it wraps below the title BEFORE breaking up internally; the
       split button only drops to its own line when a full row can't fit all three. Shutdown rows
       only, so the smaller stop/snapshot clusters never claim width they don't use. Capped at the
       row width so a panel narrower than the floor forces the internal wrap instead of clipping */
    .rowControls.startCluster {
        /* matches deviceInfo's factor so the shutdown row still splits the line evenly and the
           firmware select keeps stretching inline */
        flex: 999 1 0%;
        min-width: min(220px, 100%);
        /* only the start cluster may break internally (the split button drops to its own line);
           the stop/snapshot cluster stays atomic and wraps below the title as one unit */
        flex-wrap: wrap;
    }

    /* absorbs the cluster's width once the cluster wraps to its own full-width line */
    .snapshotButton {
        flex: 1 0 auto;
    }

    /* :global because the firmware select renders inside the VscodeDropdown wrapper
       component, so it never carries this component's scoping class */
    .rowControls :global(vscode-single-select) {
        /* out-grows the split button wrapper so inline free space goes to the select, not the button */
        flex: 999 1 0%;
        /* low floor so the firmware label gives up space (truncating to an ellipsis) before buttons clip */
        min-width: 70px;
    }

    .rowControls .runtimeDropdown {
        flex: 0 0 auto;
        min-width: 62px;
    }

    /* vscode-toolbar-button has no disabled property, so disabled icon actions are emulated */
    vscode-toolbar-button.disabled {
        pointer-events: none;
        opacity: 0.4;
    }

    .splitButtonWrapper {
        position: relative;
        display: flex;
        align-items: center;
        /* content-sized inline (the select's grow factor dwarfs this), full width once wrapped alone */
        flex: 1 0 auto;
    }

    /* auto basis (not 0) so the group's real width feeds the wrap calculation; basis 0 would
       let the row think the split button fits and clip it instead of wrapping */
    .splitButtonWrapper :global(vscode-button-group) {
        flex: 1 1 auto;
    }

    /* the play button absorbs the group's extra width; the chevron stays fixed */
    .splitButtonWrapper :global(vscode-button-group vscode-button:first-child) {
        flex: 1 1 auto;
    }

    .snapshotMenu {
        position: absolute;
        top: 100%;
        right: 0;
        z-index: 10;
        min-width: 160px;
        max-width: 220px;
        background-color: var(--vscode-menu-background, var(--vscode-dropdown-background));
        border: 1px solid var(--vscode-menu-border, var(--vscode-dropdown-border));
        border-radius: 2px;
        padding: 2px 0;
    }

    .snapshotMenuItem {
        padding: 4px 8px;
        font-size: 0.9em;
        cursor: pointer;
        overflow-wrap: anywhere;
    }

    .snapshotMenuItem:hover {
        background-color: var(--vscode-list-hoverBackground);
    }

    .snapshotMenuItem.disabled {
        opacity: 0.5;
        cursor: default;
        pointer-events: none;
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

<svelte:window on:click={handleWindowClick} />

{#if loading}
    <Loader />
{:else}
    <div id="container">
        <div class="experimentalBanner"><span class="closedBetaBadge">Closed Beta</span>The Roku Cloud Emulator integration is an experimental feature and may change or break as Roku evolves the service.</div>
        {#if accounts.length === 0 && !hasToken}
            <div class="getting-started">
                <p>No Cloud Emulator accounts are configured yet.</p>
                <p>The Cloud Emulator management APIs require a Personal Access Token (PAT). To generate one:</p>
                <ol>
                    <li>From the <a href="https://developer.roku.com/dev/landing">Roku Launchpad</a>, click <strong>Cloud Emulator</strong> in the <strong>Roku Developers</strong> pane to open the <a href="https://developer.roku.com/cloud-emulator/devices">Cloud Emulator UI</a>.</li>
                    <li>Click the <strong>Token</strong> tab.</li>
                    <li>Click <strong>Add token</strong>, then copy and save your token.</li>
                    <li>Click <strong>Add Account</strong> below and paste the token when prompted.</li>
                </ol>
                <vscode-button on:click={() => runAccountCommand('addAccount')}>Add Account</vscode-button>
            </div>
        {:else}
            <div id="accountSection">
                <vscode-single-select value={activeAccountName} on:change={onActiveAccountChange}>
                    {#each accounts as accountName}
                        <vscode-option value={accountName}>{accountName}</vscode-option>
                    {/each}
                </vscode-single-select>
                <vscode-toolbar-button icon="add" title="Add Account" on:click={() => runAccountCommand('addAccount')}></vscode-toolbar-button>
                <vscode-toolbar-button icon="trash" title="Remove Account" on:click={() => runAccountCommand('removeAccount')}></vscode-toolbar-button>
            </div>

            <vscode-divider></vscode-divider>

            {#if stateError}
                <div class="errorBanner">{stateError}</div>
            {/if}

            {#if deviceActionError}
                <div class="errorBanner">{deviceActionError}</div>
            {/if}

            <div id="devicesHeader">
                <span class="sectionTitle">Devices</span>
                <vscode-toolbar-button icon="refresh" title="Refresh" on:click={loadState}></vscode-toolbar-button>
                <vscode-button secondary={showCreateDeviceForm} on:click={toggleCreateDeviceForm}>
                    {showCreateDeviceForm ? 'Cancel' : 'New Device'}
                </vscode-button>
            </div>

            {#if showCreateDeviceForm}
                <div id="createDeviceForm">
                    <vscode-textfield placeholder="Name" value={newDeviceName} on:input={(event) => (newDeviceName = event.target.value)}></vscode-textfield>
                    <vscode-single-select value={newDeviceType} on:change={(event) => (newDeviceType = event.target.value)}>
                        <vscode-option value="tv">tv</vscode-option>
                        <vscode-option value="stb">stb</vscode-option>
                    </vscode-single-select>
                    <vscode-textfield placeholder="Note (optional)" value={newDeviceNote} on:input={(event) => (newDeviceNote = event.target.value)}></vscode-textfield>
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
                                <DeviceTypeIcon deviceType={device.deviceType} />
                                <span class="deviceNameText" title={device.name}>{device.name}</span>
                                <vscode-toolbar-button
                                    class="watchButton"
                                    icon="eye"
                                    title="Watch device"
                                    class:disabled={watchingDeviceInFlight[device.id]}
                                    on:click|stopPropagation={() => watchDevice(device)}></vscode-toolbar-button>
                            </span>
                        </div>
                        <div class="rowControls" class:startCluster={device.status === 'shutdown'}>
                            {#if device.status === 'shutdown'}
                                {@const firmwareOptions = (firmwareVersions ?? []).filter((firmwareVersion) => firmwareVersion.deviceType === device.deviceType)}
                                {@const startSnapshot = resolveStartSnapshot(detailsState)}
                                {@const startTitle = startSnapshot ? (startSnapshot.live ? 'Start device (live snapshot)' : `Start device (${startSnapshot.name ?? `Snapshot ${startSnapshot.id}`})`) : 'Start device'}
                                <VscodeDropdown
                                    bind:this={firmwareDropdownsByDeviceId[device.id]}
                                    title="Firmware version"
                                    disabled={firmwareOptions.length === 0}
                                    value={resolveFirmwareVersionId(selectedFirmwareIdByDeviceId[device.id], detailsState, device, firmwareOptions)}
                                    on:change={(event) => updateSelectedFirmware(device.id, (event.target as HTMLElement & { value: string }).value)}>
                                    {#if firmwareOptions.length === 0}
                                        <vscode-option value="">Firmware unavailable</vscode-option>
                                    {:else}
                                        {#each firmwareOptions as firmwareVersion}
                                            <vscode-option value={firmwareVersion.firmwareVersionId}>
                                                {firmwareVersion.displayName ?? firmwareVersion.firmwareVersionId}
                                            </vscode-option>
                                        {/each}
                                    {/if}
                                </VscodeDropdown>
                                <vscode-single-select
                                    class="runtimeDropdown"
                                    title="Maximum runtime"
                                    value={String(resolveRuntimeHours(selectedRuntimeHoursByDeviceId[device.id], runtimeHourOptions))}
                                    on:change={(event) => updateSelectedRuntimeHours(device.id, event.target.value)}>
                                    {#each runtimeHourOptions as hours}
                                        <vscode-option value={String(hours)}>{hours}h</vscode-option>
                                    {/each}
                                </vscode-single-select>
                                <div class="splitButtonWrapper" bind:this={splitButtonElementsByDeviceId[device.id]}>
                                    <vscode-button-group>
                                        <vscode-button
                                            icon="play"
                                            icon-only
                                            title={startTitle}
                                            disabled={deviceActionsInFlight[device.id] || isFirstDetailsLoad(detailsState) || !startSnapshot}
                                            on:click={() => { snapshotMenuDeviceId = undefined; void startDevice(device, startSnapshot?.id, readDisplayedFirmwareVersionId(device.id)); }}></vscode-button>
                                        <vscode-button
                                            icon="chevron-down"
                                            icon-only
                                            title="Start from snapshot..."
                                            disabled={deviceActionsInFlight[device.id] || isFirstDetailsLoad(detailsState)}
                                            on:click={() => toggleSnapshotMenu(device.id)}></vscode-button>
                                    </vscode-button-group>
                                    {#if snapshotMenuDeviceId === device.id}
                                        <div class="snapshotMenu">
                                            {#if (detailsState?.snapshots ?? []).length === 0}
                                                <div class="snapshotMenuItem disabled">No snapshots</div>
                                            {:else}
                                                {#each detailsState?.snapshots ?? [] as snapshot (snapshot.id)}
                                                    {@const snapshotMenuItemDisabled = snapshot.ready === false || deviceActionsInFlight[device.id]}
                                                    <div
                                                        class="snapshotMenuItem"
                                                        class:disabled={snapshotMenuItemDisabled}
                                                        on:click={() => !snapshotMenuItemDisabled && startFromSnapshotMenu(device, snapshot)}>
                                                        {snapshot.name ?? `Snapshot ${snapshot.id}`}{snapshot.live ? ' (live)' : ''}{snapshot.base ? ' (base)' : ''}{snapshot.ready === false ? ' (not ready)' : ''}
                                                    </div>
                                                {/each}
                                            {/if}
                                        </div>
                                    {/if}
                                </div>
                            {:else if device.status === 'running' || device.status === 'pending'}
                                {#if device.status === 'running'}
                                    <vscode-button
                                        class="snapshotButton"
                                        icon={snapshotFormDeviceId === device.id ? '' : 'save'}
                                        secondary
                                        on:click={() => toggleSnapshotForm(device)}>
                                        {snapshotFormDeviceId === device.id ? 'Cancel' : 'Snapshot'}
                                    </vscode-button>
                                {/if}
                                <vscode-button
                                    icon="debug-stop"
                                    icon-only
                                    title="Stop device"
                                    disabled={deviceActionsInFlight[device.id]}
                                    on:click={() => stopDevice(device)}></vscode-button>
                            {/if}
                        </div>
                        {#if runtime}
                            <div class="deviceRuntimeBlock">
                                <span class="deviceRuntime">{runtime.label}</span>
                                <div class="runtimeBarTrack">
                                    <div class="runtimeBarFill" style="width: {runtime.percent}%"></div>
                                </div>
                            </div>
                        {/if}
                    </div>

                    {#if snapshotFormDeviceId === device.id && device.status === 'running'}
                        <div class="snapshotForm">
                            <vscode-textfield placeholder="Name" value={newSnapshotName} on:input={(event) => (newSnapshotName = event.target.value)}></vscode-textfield>
                            <vscode-textfield placeholder="Note (optional)" value={newSnapshotNote} on:input={(event) => (newSnapshotNote = event.target.value)}></vscode-textfield>
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
                                    <span>Created: {formatDateTime(device.createdAt)}</span>
                                    {#if device.serialNumber}
                                        <span>Serial number: {device.serialNumber}</span>
                                    {/if}
                                </div>

                                {#if device.status === 'running'}
                                    <div class="editRow">
                                        <vscode-button
                                            secondary
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
                                        <vscode-textfield placeholder="Name" value={editName} on:input={(event) => (editName = event.target.value)}></vscode-textfield>
                                        <vscode-textfield placeholder="Note" value={editNote} on:input={(event) => (editNote = event.target.value)}></vscode-textfield>
                                        {#if editDeviceError}
                                            <div class="errorBanner">{editDeviceError}</div>
                                        {/if}
                                        <div class="editRow">
                                            <vscode-toolbar-button icon="check" title="Save" class:disabled={!editName || savingDeviceEdit} on:click={() => saveDeviceEdits(device)}></vscode-toolbar-button>
                                            <vscode-toolbar-button icon="close" title="Cancel" class:disabled={savingDeviceEdit} on:click={cancelEditingDevice}></vscode-toolbar-button>
                                        </div>
                                    </div>
                                {:else}
                                    <div class="editRow">
                                        <span>Note: {device.note || 'No note'}</span>
                                        <vscode-toolbar-button icon="edit" title="Edit name and note" on:click={() => startEditingDevice(device)}></vscode-toolbar-button>
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
                                                        {formatDateTime(snapshot.createdAt)}
                                                        {#if snapshot.firmwareVersionDisplayName}
                                                            &middot; {snapshot.firmwareVersionDisplayName}
                                                        {/if}
                                                        {#if snapshot.note}
                                                            &middot; {snapshot.note}
                                                        {/if}
                                                    </span>
                                                </div>
                                                {#if !snapshot.live && !snapshot.base}
                                                    <vscode-toolbar-button
                                                        icon="trash"
                                                        title="Delete snapshot"
                                                        class:disabled={deletingSnapshotId === snapshot.id}
                                                        on:click={() => deleteSnapshot(device, snapshot)}></vscode-toolbar-button>
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
                                                        <span>{run.creatorUsername ?? 'Unknown user'} &middot; {run.snapshotName ?? 'Unknown snapshot'}</span>
                                                        <span class="historyMeta">{formatDateTime(run.startedAt as string)} &middot; {runDuration(run)}</span>
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

                    <vscode-divider></vscode-divider>
                {/each}
            {/if}
        {/if}
    </div>
{/if}
