<script lang="ts">
    window.vscode = acquireVsCodeApi();

    import { intermediary } from '../../ExtensionIntermediary';
    import { ViewProviderCommand } from '../../../../src/viewProviders/ViewProviderCommand';
    import { ViewProviderEvent } from '../../../../src/viewProviders/ViewProviderEvent';
    import { onMount } from 'svelte';

    let deviceInfo: string = 'No device connected';
    let lastCommand: string = '';
    let advanced: boolean = false;
    let isFocused: boolean = false;
    let isRemoteControlMode: boolean = false;
    let activeButton: string = '';
    let activeButtonTimeout: ReturnType<typeof setTimeout>;
    let keybindings: Record<string, string[]> = {};

    // Observe device connection status
    intermediary.observeEvent(ViewProviderEvent.onDeviceConnectionChanged, (message) => {
        console.log('RemoteControlPanel received onDeviceConnectionChanged:', message);
        if (message.context.connected) {
            deviceInfo = `Connected to ${message.context.deviceName || 'Roku Device'}`;
        } else {
            deviceInfo = 'No device connected';
        }
    });

    // Observe remote control mode status
    intermediary.observeEvent(ViewProviderEvent.onRemoteControlModeChanged, (message) => {
        isRemoteControlMode = message.context.isEnabled;
    });

    // Observe keybinding updates from the extension
    intermediary.observeEvent(ViewProviderEvent.onKeybindingsUpdated, (message) => {
        keybindings = message.context.keybindings;
    });

    // Observe remote commands sent from the extension (keyboard, command palette, etc.)
    intermediary.observeEvent(ViewProviderEvent.onRemoteCommandSent, (message) => {
        const key = message.context.key as string;
        lastCommand = key;
        activeButton = key;
        clearTimeout(activeButtonTimeout);
        activeButtonTimeout = setTimeout(() => {
            activeButton = '';
        }, 200);
    });

    onMount(() => {
        console.log('RemoteControlPanel mounted, sending viewReady');
        intermediary.sendViewReady();

        const onFocus = () => { isFocused = true; };
        const onBlur = () => { isFocused = false; };
        window.addEventListener('focus', onFocus);
        window.addEventListener('blur', onBlur);
        isFocused = document.hasFocus();

        return () => {
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('blur', onBlur);
        };
    });

    async function sendRemoteCommand(command: string) {
        lastCommand = command;
        console.log('Sending remote command:', command);
        try {
            await intermediary.sendCommand(ViewProviderCommand.sendRemoteCommand, {
                button: command
            });
        } catch (error) {
            console.error('Failed to send remote command:', error);
        }
    }

    $: buttonTitle = (label: string, button: string): string => {
        const keys = keybindings[button];
        return keys?.length ? `${label} (${keys.join(', ')})` : label;
    };

    async function sendTextInput() {
        const text = prompt('Enter text to send to device:');
        if (text) {
            await intermediary.sendCommand(ViewProviderCommand.sendRemoteText, {
                text: text
            });
        }
    }
</script>

<style>
    .remote-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 12px;
        gap: 10px;
        user-select: none;
        max-width: 300px;
        margin: 0 auto;
        border: 2px solid transparent;
        border-radius: 12px;
        transition: border-color 0.2s;
    }

    .remote-container.focused {
        border-color: var(--vscode-focusBorder, #007fd4);
    }

    .focus-indicator {
        width: 100%;
        text-align: center;
        padding: 5px 8px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.4px;
        transition: background 0.2s, color 0.2s;
    }

    .focus-indicator.active {
        background: var(--vscode-testing-iconPassed, #388a34);
        color: white;
    }

    .focus-indicator.inactive {
        background: var(--vscode-editor-background);
        color: var(--vscode-descriptionForeground);
        border: 1px dashed var(--vscode-panel-border);
        cursor: pointer;
    }

    .device-status {
        width: 100%;
        text-align: center;
        padding: 8px;
        background: var(--vscode-editor-background);
        border: 1px solid var(--vscode-panel-border);
        border-radius: 8px;
    }

    .last-command {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        margin-top: 3px;
    }

    .remote-body {
        display: flex;
        gap: 8px;
        width: 100%;
    }

    .main-controls {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .side-controls {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-top: 0;
        align-items: stretch;
        flex-shrink: 0;
        width: 58px;
    }

    .button-row {
        display: flex;
        justify-content: center;
        gap: 6px;
    }

    .button-row .remote-button {
        flex: 1;
    }

    .remote-button {
        background: #6B3FA0;
        color: white;
        border: none;
        border-radius: 20px;
        padding: 10px 8px;
        cursor: pointer;
        font-size: 16px;
        font-weight: 500;
        transition: all 0.1s;
        min-width: 0;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .remote-button:hover {
        background: #7E52B5;
    }

    .remote-button:active {
        transform: scale(0.95);
        background: #5A3287;
    }

    .pressed {
        transform: scale(0.95);
        filter: brightness(0.8);
    }

    .dpad-container {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        grid-template-rows: 1fr 1fr 1fr;
        gap: 0;
        width: fit-content;
        margin: 0 auto;
        background: transparent;
        position: relative;
    }

    .dpad-container::before {
        content: '';
        position: absolute;
        top: 0;
        left: 33.33%;
        right: 33.33%;
        bottom: 0;
        background: #6B3FA0;
        z-index: 0;
        border-radius: 12px;
    }

    .dpad-container::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        top: 33.33%;
        bottom: 33.33%;
        background: #6B3FA0;
        z-index: 0;
        border-radius: 12px;
    }

    .dpad-corner {
        background: transparent;
        pointer-events: none;
    }

    .dpad-button {
        background: #6B3FA0;
        color: white;
        border: none;
        border-radius: 0;
        padding: 16px;
        cursor: pointer;
        font-size: 15px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        z-index: 1;
    }

    .dpad-button:hover {
        background: #7E52B5;
    }

    .dpad-button:active {
        transform: scale(0.95);
    }

    .dpad-up {
        grid-column: 2;
        grid-row: 1;
        border-radius: 12px 12px 0 0;
    }
    .dpad-left {
        grid-column: 1;
        grid-row: 2;
        border-radius: 12px 0 0 12px;
    }
    .dpad-ok {
        grid-column: 2;
        grid-row: 2;
        background: #7E52B5;
        font-weight: bold;
        border-radius: 50%;
        border: 3px solid #5A3287;
        margin: 5px;
        font-size: 13px;
        letter-spacing: 0.5px;
    }
    .dpad-right {
        grid-column: 3;
        grid-row: 2;
        border-radius: 0 12px 12px 0;
    }
    .dpad-down {
        grid-column: 2;
        grid-row: 3;
        border-radius: 0 0 12px 12px;
    }

    .colored-buttons {
        display: flex;
        justify-content: center;
        gap: 6px;
    }

    .colored-button {
        width: 45px;
        height: 36px;
        border-radius: 8px;
        border: 2px solid rgba(0, 0, 0, 0.2);
        cursor: pointer;
        transition: all 0.1s;
    }

    .colored-button:active {
        transform: scale(0.95);
    }

    .btn-blue { background: #0066cc; }
    .btn-green { background: #00aa44; }
    .btn-red { background: #cc0000; }
    .btn-yellow { background: #ccaa00; }

    .power-button {
        background: #6B3FA0;
        color: #ff5252;
        width: fit-content;
        min-width: 60px;
        align-self: center;
        font-size: 22px;
        padding: 10px 20px;
        border-radius: 50%;
    }

    .power-button:hover {
        background: #7E52B5;
        color: #ff8a80;
    }

    .section-title {
        text-align: center;
        font-size: 10px;
        color: var(--vscode-descriptionForeground);
        margin: 2px 0;
        text-transform: uppercase;
        letter-spacing: 1px;
    }

    .volume-button {
        padding: 10px 4px;
        font-size: 12px;
        border-radius: 20px;
        text-align: center;
        width: 100%;
    }

    .advanced-toggle {
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        cursor: pointer;
        user-select: none;
        align-self: flex-end;
    }

    .advanced-toggle input {
        cursor: pointer;
    }
</style>

<div class="remote-container" class:focused={isFocused}>
    <div class="device-status">
        <div>{deviceInfo}</div>
        {#if lastCommand}
            <div class="last-command">Last: {lastCommand}</div>
        {/if}
    </div>

    {#if !isRemoteControlMode}
        <div class="focus-indicator inactive">Remote control mode is off</div>
    {:else if isFocused}
        <div class="focus-indicator active">Keyboard active — keys sent to Roku</div>
    {:else}
        <div class="focus-indicator inactive" on:click={() => window.focus()} on:keydown={() => window.focus()} role="button" tabindex="0">
            Click to enable keyboard control
        </div>
    {/if}

    <label class="advanced-toggle">
        <input type="checkbox" bind:checked={advanced} />
        Advanced
    </label>

    <div class="remote-body">
        <!-- Main Remote Controls -->
        <div class="main-controls">
            <!-- Power Button -->
            <button class="remote-button power-button" class:pressed={activeButton === 'Power'} on:click={() => sendRemoteCommand('Power')} title={buttonTitle('Power', 'Power')}>
                ⏻
            </button>

            <!-- Top Buttons -->
            <div class="button-row">
                <button class="remote-button" class:pressed={activeButton === 'Back'} on:click={() => sendRemoteCommand('Back')} title={buttonTitle('Back', 'Back')}>
                    ←
                </button>
                <button class="remote-button" class:pressed={activeButton === 'Home'} on:click={() => sendRemoteCommand('Home')} title={buttonTitle('Home', 'Home')}>
                    ⌂
                </button>
            </div>

            <!-- D-Pad -->
            <div class="section-title">Navigation</div>
            <div class="dpad-container">
                <div class="dpad-corner"></div>
                <button class="dpad-button dpad-up" class:pressed={activeButton === 'Up'} on:click={() => sendRemoteCommand('Up')} title={buttonTitle('Up', 'Up')}>
                    ^
                </button>
                <div class="dpad-corner"></div>
                <button class="dpad-button dpad-left" class:pressed={activeButton === 'Left'} on:click={() => sendRemoteCommand('Left')} title={buttonTitle('Left', 'Left')}>
                    &lt;
                </button>
                <button class="dpad-button dpad-ok" class:pressed={activeButton === 'Select'} on:click={() => sendRemoteCommand('Select')} title={buttonTitle('Select', 'Select')}>
                    OK
                </button>
                <button class="dpad-button dpad-right" class:pressed={activeButton === 'Right'} on:click={() => sendRemoteCommand('Right')} title={buttonTitle('Right', 'Right')}>
                    &gt;
                </button>
                <div class="dpad-corner"></div>
                <button class="dpad-button dpad-down" class:pressed={activeButton === 'Down'} on:click={() => sendRemoteCommand('Down')} title={buttonTitle('Down', 'Down')}>
                    v
                </button>
                <div class="dpad-corner"></div>
            </div>

            <!-- Under D-Pad Buttons -->
            <div class="button-row">
                <button class="remote-button" class:pressed={activeButton === 'InstantReplay'} on:click={() => sendRemoteCommand('InstantReplay')} title={buttonTitle('Instant Replay', 'InstantReplay')}>
                    ↺
                </button>
                <button class="remote-button" class:pressed={activeButton === 'Info'} on:click={() => sendRemoteCommand('Info')} title={buttonTitle('Options / Info', 'Info')}>
                    *
                </button>
            </div>

            <!-- Playback Controls -->
            <div class="section-title">Playback</div>
            <div class="button-row">
                <button class="remote-button" class:pressed={activeButton === 'Rev'} on:click={() => sendRemoteCommand('Rev')} title={buttonTitle('Rewind', 'Rev')}>
                    «
                </button>
                <button class="remote-button" class:pressed={activeButton === 'Play'} on:click={() => sendRemoteCommand('Play')} title={buttonTitle('Play / Pause', 'Play')}>
                    ▶
                </button>
                <button class="remote-button" class:pressed={activeButton === 'Fwd'} on:click={() => sendRemoteCommand('Fwd')} title={buttonTitle('Fast Forward', 'Fwd')}>
                    »
                </button>
            </div>

            {#if advanced}
            <!-- Colored Buttons -->
            <div class="section-title">Shortcuts</div>
            <div class="colored-buttons">
                <button
                    class="colored-button btn-blue"
                    class:pressed={activeButton === 'Blue'}
                    on:click={() => sendRemoteCommand('Blue')}
                    title={buttonTitle('Blue', 'Blue')}
                ></button>
                <button
                    class="colored-button btn-green"
                    class:pressed={activeButton === 'Green'}
                    on:click={() => sendRemoteCommand('Green')}
                    title={buttonTitle('Green', 'Green')}
                ></button>
                <button
                    class="colored-button btn-red"
                    class:pressed={activeButton === 'Red'}
                    on:click={() => sendRemoteCommand('Red')}
                    title={buttonTitle('Red', 'Red')}
                ></button>
                <button
                    class="colored-button btn-yellow"
                    class:pressed={activeButton === 'Yellow'}
                    on:click={() => sendRemoteCommand('Yellow')}
                    title={buttonTitle('Yellow', 'Yellow')}
                ></button>
            </div>

            <!-- Bottom Buttons -->
            <div class="button-row">
                <button class="remote-button" class:pressed={activeButton === 'Exit'} on:click={() => sendRemoteCommand('Exit')}>
                    Exit
                </button>
                <button class="remote-button" class:pressed={activeButton === 'Guide'} on:click={() => sendRemoteCommand('Guide')}>
                    Guide
                </button>
            </div>
            {/if}

            <!-- Text Input -->
            <button class="remote-button" on:click={sendTextInput} title="Send Text">
                ⌨ Text
            </button>
        </div>

        {#if advanced}
        <!-- Side Volume Controls -->
        <div class="side-controls">
            <div class="section-title">Volume</div>
            <button class="remote-button volume-button" class:pressed={activeButton === 'VolumeUp'} on:click={() => sendRemoteCommand('VolumeUp')} title={buttonTitle('Volume Up', 'VolumeUp')}>
                Vol +
            </button>
            <button class="remote-button volume-button" class:pressed={activeButton === 'VolumeDown'} on:click={() => sendRemoteCommand('VolumeDown')} title={buttonTitle('Volume Down', 'VolumeDown')}>
                Vol −
            </button>
            <button class="remote-button volume-button" class:pressed={activeButton === 'VolumeMute'} on:click={() => sendRemoteCommand('VolumeMute')} title={buttonTitle('Mute', 'VolumeMute')}>
                Mute
            </button>
        </div>
        {/if}
    </div>
</div>
