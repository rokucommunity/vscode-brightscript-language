<script lang="ts">
    window.vscode = acquireVsCodeApi();

    import { intermediary } from '../../ExtensionIntermediary';
    import { ViewProviderCommand } from '../../../../src/viewProviders/ViewProviderCommand';
    import { ViewProviderEvent } from '../../../../src/viewProviders/ViewProviderEvent';
    import { onMount } from 'svelte';

    let deviceInfo: string = 'No device connected';
    let lastCommand: string = '';

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
        console.log('RemoteControlPanel received onRemoteControlModeChanged:', message);
        // Can update UI based on mode changes
    });

    onMount(() => {
        console.log('RemoteControlPanel mounted, sending viewReady');
        intermediary.sendViewReady();

        // Set up keyboard event listener for the webview
        window.addEventListener('keydown', handleKeyPress);

        return () => {
            window.removeEventListener('keydown', handleKeyPress);
        };
    });

    function handleKeyPress(event: KeyboardEvent) {
        // Map keyboard keys to remote buttons
        const keyMap = {
            'ArrowUp': 'Up',
            'ArrowDown': 'Down',
            'ArrowLeft': 'Left',
            'ArrowRight': 'Right',
            'Enter': 'Select',
            'Escape': 'Back',
            'Backspace': 'InstantReplay',
            'Home': 'Home',
            ' ': 'Play'
        };

        const command = keyMap[event.key];
        if (command) {
            event.preventDefault();
            sendRemoteCommand(command);
        }
    }

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
        gap: 10px;
        width: 100%;
        max-width: 480px;
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
    }

    .button-row {
        display: flex;
        justify-content: center;
        gap: 6px;
    }

    .remote-button {
        background: rgb(104, 45, 145);
        color: white;
        border: 1px solid rgba(0, 0, 0, 0.2);
        border-radius: 8px;
        padding: 10px 16px;
        cursor: pointer;
        font-size: 13px;
        transition: all 0.1s;
        min-width: 75px;
    }

    .remote-button:hover {
        background: rgb(124, 65, 165);
    }

    .remote-button:active {
        transform: scale(0.95);
        background: rgb(84, 25, 125);
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
        background: rgb(104, 45, 145);
        z-index: 0;
        border-radius: 8px;
    }

    .dpad-container::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        top: 33.33%;
        bottom: 33.33%;
        background: rgb(104, 45, 145);
        z-index: 0;
        border-radius: 8px;
    }

    .dpad-corner {
        background: transparent;
        pointer-events: none;
    }

    .dpad-button {
        background: rgb(104, 45, 145);
        color: white;
        border: none;
        border-radius: 0;
        padding: 16px;
        cursor: pointer;
        font-size: 15px;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        z-index: 1;
    }

    .dpad-button:hover {
        background: rgb(124, 65, 165);
    }

    .dpad-button:active {
        transform: scale(0.95);
    }

    .dpad-up {
        grid-column: 2;
        grid-row: 1;
        border-radius: 8px 8px 0 0;
    }
    .dpad-left {
        grid-column: 1;
        grid-row: 2;
        border-radius: 8px 0 0 8px;
    }
    .dpad-ok {
        grid-column: 2;
        grid-row: 2;
        background: rgb(134, 75, 175);
        font-weight: bold;
        border-radius: 50%;
        border: 2px solid rgba(0, 0, 0, 0.3);
        margin: 4px;
    }
    .dpad-right {
        grid-column: 3;
        grid-row: 2;
        border-radius: 0 8px 8px 0;
    }
    .dpad-down {
        grid-column: 2;
        grid-row: 3;
        border-radius: 0 0 8px 8px;
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
        background: rgb(104, 45, 145);
        color: #ff5252;
        width: fit-content;
        min-width: 60px;
        align-self: center;
        font-size: 24px;
        padding: 10px 20px;
        border-radius: 50%;
    }

    .power-button:hover {
        background: rgb(124, 65, 165);
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

    .help-text {
        text-align: center;
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        padding: 6px;
        background: var(--vscode-editor-background);
        border-radius: 8px;
    }

    .volume-button {
        padding: 8px 12px;
        min-width: 65px;
        font-size: 12px;
    }
</style>

<div class="remote-container">
    <div class="device-status">
        <div>{deviceInfo}</div>
        {#if lastCommand}
            <div class="last-command">Last: {lastCommand}</div>
        {/if}
    </div>

    <div class="help-text">
        Click buttons or use your keyboard (↑↓←→ Enter Esc)
    </div>

    <div class="remote-body">
        <!-- Main Remote Controls -->
        <div class="main-controls">
            <!-- Power Button -->
            <button class="remote-button power-button" on:click={() => sendRemoteCommand('Power')} title="Power">
                ⏻
            </button>

            <!-- Top Buttons -->
            <div class="button-row">
                <button class="remote-button" on:click={() => sendRemoteCommand('Back')}>
                    ← Back
                </button>
                <button class="remote-button" on:click={() => sendRemoteCommand('Home')}>
                    🏠 Home
                </button>
            </div>

            <!-- D-Pad -->
            <div class="section-title">Navigation</div>
            <div class="dpad-container">
                <div class="dpad-corner"></div>
                <button class="dpad-button dpad-up" on:click={() => sendRemoteCommand('Up')}>
                    ▲
                </button>
                <div class="dpad-corner"></div>
                <button class="dpad-button dpad-left" on:click={() => sendRemoteCommand('Left')}>
                    ◀
                </button>
                <button class="dpad-button dpad-ok" on:click={() => sendRemoteCommand('Select')}>
                    OK
                </button>
                <button class="dpad-button dpad-right" on:click={() => sendRemoteCommand('Right')}>
                    ▶
                </button>
                <div class="dpad-corner"></div>
                <button class="dpad-button dpad-down" on:click={() => sendRemoteCommand('Down')}>
                    ▼
                </button>
                <div class="dpad-corner"></div>
            </div>

            <!-- Under D-Pad Buttons -->
            <div class="button-row">
                <button class="remote-button" on:click={() => sendRemoteCommand('InstantReplay')}>
                    ↺ Replay
                </button>
                <button class="remote-button" on:click={() => sendRemoteCommand('Search')}>
                    🔍 Search
                </button>
                <button class="remote-button" on:click={() => sendRemoteCommand('Info')}>
                    ℹ Info
                </button>
            </div>

            <!-- Playback Controls -->
            <div class="section-title">Playback</div>
            <div class="button-row">
                <button class="remote-button" on:click={() => sendRemoteCommand('Rev')}>
                    ⏪ Rev
                </button>
                <button class="remote-button" on:click={() => sendRemoteCommand('Play')}>
                    ⏯ Play
                </button>
                <button class="remote-button" on:click={() => sendRemoteCommand('Fwd')}>
                    ⏩ Fwd
                </button>
            </div>

            <!-- Colored Buttons -->
            <div class="section-title">Shortcuts</div>
            <div class="colored-buttons">
                <button
                    class="colored-button btn-blue"
                    on:click={() => sendRemoteCommand('Blue')}
                    title="Blue"
                ></button>
                <button
                    class="colored-button btn-green"
                    on:click={() => sendRemoteCommand('Green')}
                    title="Green"
                ></button>
                <button
                    class="colored-button btn-red"
                    on:click={() => sendRemoteCommand('Red')}
                    title="Red"
                ></button>
                <button
                    class="colored-button btn-yellow"
                    on:click={() => sendRemoteCommand('Yellow')}
                    title="Yellow"
                ></button>
            </div>

            <!-- Bottom Buttons -->
            <div class="button-row">
                <button class="remote-button" on:click={() => sendRemoteCommand('Exit')}>
                    Exit
                </button>
                <button class="remote-button" on:click={() => sendRemoteCommand('Guide')}>
                    Guide
                </button>
            </div>

            <!-- Text Input -->
            <button class="remote-button" on:click={sendTextInput}>
                ⌨ Send Text
            </button>
        </div>

        <!-- Side Volume Controls -->
        <div class="side-controls">
            <div class="section-title">Volume</div>
            <button class="remote-button volume-button" on:click={() => sendRemoteCommand('VolumeUp')}>
                🔊 +
            </button>
            <button class="remote-button volume-button" on:click={() => sendRemoteCommand('VolumeDown')}>
                🔉 -
            </button>
            <button class="remote-button volume-button" on:click={() => sendRemoteCommand('VolumeMute')}>
                🔇 Mute
            </button>
        </div>
    </div>
</div>
