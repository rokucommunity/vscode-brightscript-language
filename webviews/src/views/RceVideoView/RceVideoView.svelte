<script lang="ts">
    window.vscode = acquireVsCodeApi();

    import { intermediary } from '../../ExtensionIntermediary';
    import { ViewProviderEvent } from '../../../../src/viewProviders/ViewProviderEvent';
    import RceStreamView from '../../shared/RceStreamView.svelte';

    //A Cloud Emulator device's video stream in its own editor tab. The extension-side
    //RceVideoEditorManager owns the tab and its signaling session; this view is nothing but the
    //shared stream renderer (the `stopped` event needs no handler here - the extension side closes
    //the tab when the stream is stopped).

    //saved so VS Code hands the device id back to RceVideoEditorManager's panel serializer when it
    //restores this tab across a window reload
    intermediary.observeEvent(ViewProviderEvent.onRceStreamConnecting, (message) => {
        window.vscode.setState({
            deviceId: message.context.deviceId,
            deviceName: message.context.deviceName
        });
    });

    // Required by any view so we can know that the view is ready to receive messages
    intermediary.sendViewReady();
</script>

<RceStreamView />
