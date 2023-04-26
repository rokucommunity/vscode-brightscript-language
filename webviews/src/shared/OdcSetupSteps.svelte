<script lang="ts">
    import OdcSetManualIpAddress from './OdcSetManualIpAddress.svelte';
</script>

<style>
    #odcSetupSteps {
        padding: 10px;
    }

    code {
        color: orange;
        display:inline-block;
        font-weight: bold;
    }
</style>

<div id="odcSetupSteps">
    Could not connect to the on-device component. Install steps:

    <ol>
        <li>
            Enable the following property in <b><i>launch.json</i></b>:
            <pre><code>"injectRdbOnDeviceComponent": true</code></pre>
        </li>
        <li>
            Add this comment to <code>function main()</code> after the call to <code>screen.show()</code>
            <pre><code>' vscode_rdb_on_device_component_entry</code></pre>
        </li>
    </ol>

    The ODC is properly installed if you see this log output during channel launch:
    <pre><i>[RTA][INFO] OnDeviceComponent init</i></pre>
    <OdcSetManualIpAddress />
</div>
