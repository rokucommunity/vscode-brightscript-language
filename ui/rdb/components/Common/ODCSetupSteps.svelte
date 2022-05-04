<style>
    #odcSetupSteps {
        padding: 10px;
    }

    .codeSnippet {
        color: orange;
        font-weight: bold;
    }
</style>

<div id="odcSetupSteps">
    This tool requires a component be included and initialized in your application (similar to RALE). The easiest way to do this is:
    <ul>
        <li>Include the following comment in either your Scene or main.brs file (if including in main.brs, be sure to add after your roSGScreen screen.show() call)<br><span class="codeSnippet">' vscode_rdb_on_device_component_entry</span><br></li>
        <li>Make sure your launch.json configuration has<br><span class="codeSnippet">"injectRdbOnDeviceComponent": true</span> included in it</li>
    </ul>
    The extension can copy the files automatically for you so there's no need to handle that part. If you are still having issues even with these steps, check to make sure you're seeing this line in your device logs <span class="codeSnippet">[RTA][INFO] OnDeviceComponent init</span>
</div>
