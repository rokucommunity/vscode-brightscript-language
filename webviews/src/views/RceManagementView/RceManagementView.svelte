<script lang="ts">
    window.vscode = acquireVsCodeApi();

    import type { DeviceOut } from 'roku-deploy';
    import { Refresh } from 'svelte-codicons';
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

    async function startDevice(device: DeviceOut) {
        deviceActionError = undefined;
        deviceActionsInFlight = { ...deviceActionsInFlight, [device.id]: true };
        try {
            await intermediary.sendCommand(ViewProviderCommand.startRceDevice, {
                deviceId: device.id
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

    // Required by any view so we can know that the view is ready to receive messages
    intermediary.sendViewReady();
    loadState();
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
    }

    .deviceName {
        font-weight: bold;
        overflow-wrap: anywhere;
    }

    .deviceMeta {
        opacity: 0.7;
        font-size: 0.9em;
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
                    <div class="deviceRow">
                        <div class="deviceInfo">
                            <span class="deviceName">{device.name}</span>
                            <span class="deviceMeta">{device.device_type} &middot; {device.status ?? 'unknown'} &middot; {device.last_snapshot_name ?? 'no snapshot'}</span>
                        </div>
                        {#if device.status === 'shutdown'}
                            <vscode-button disabled={deviceActionsInFlight[device.id]} on:click={() => startDevice(device)}>Start</vscode-button>
                        {:else if device.status === 'running' || device.status === 'pending'}
                            <vscode-button disabled={deviceActionsInFlight[device.id]} on:click={() => stopDevice(device)}>Stop</vscode-button>
                        {/if}
                    </div>
                    <vscode-divider />
                {/each}
            {/if}
        {/if}
    </div>
{/if}
