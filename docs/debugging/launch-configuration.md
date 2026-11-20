# Launch Configuration

These are all of the options for a `brightscript` debug configuration in `.vscode/launch.json`. See [Debugging Setup](index.md) to get started.

Most of these can also be set for every launch configuration at once with the matching `brightscript.debug.*` setting in your user or workspace settings. A value in `launch.json` always wins over the setting.

<!-- reference:start: everything below is generated from package.json by docs/scripts/reference.mjs. Edit descriptions there. Notes written right after a setting's generated:end marker are kept. -->

### `host`
<!-- generated:start -->
The host or ip address for the target Roku. `device` is the preferred way to address the target device and supersedes this field.

Can also be set for every launch configuration with the [`brightscript.debug.host`](../extension-settings.md#brightscriptdebughost) setting.

**Type:** `string` · **Default:** `"${promptForHost}"`
<!-- generated:end -->

### `device`
<!-- generated:start -->
The canonical way to address the target device; supersedes `host`. Either a local network device (`{ host }`), or a Roku Cloud Emulator device addressed by serial number, management-api device id, or running instance URL. The Cloud Emulator api token always comes from the active Cloud Emulator account (managed from the Cloud Emulator panel, stored in VS Code secret storage) - it cannot be set here.

**Type:** `object`

Properties:

- `host` (string, required): IP address or hostname of the device.
<!-- generated:end -->

### `deepLinkUrl`
<!-- generated:start -->
A full deep link url to start the debugging session. There's no pretty way of launching directly to a deep link, so the app must be side-loaded, it auto-runs, we stop the app, and then launch it again using the deep link. You may use ${promptForHost}, ${activeHost}, ${host}, ${promptForQueryParams} which only asks for the URL-encoded querystring, and ${promptForDeepLinkUrl} to enter the entire deep link url at launch-time.

Can also be set for every launch configuration with the [`brightscript.debug.deepLinkUrl`](../extension-settings.md#brightscriptdebugdeeplinkurl) setting.

**Type:** `string` · **Default:** `"http://${host}:8060/launch/dev?${promptForQueryParams}"`
<!-- generated:end -->

### `password`
<!-- generated:start -->
The password for the developer page on the target Roku. You may use ${promptForPassword} to prompt for password, or ${activeHostPassword} to use the password set for the active device.

Can also be set for every launch configuration with the [`brightscript.debug.password`](../extension-settings.md#brightscriptdebugpassword) setting.

**Type:** `string` · **Default:** `"${promptForPassword}"`
<!-- generated:end -->

### `rootDir`
<!-- generated:start -->
The root directory that contains your Roku project. This path should point to the folder containing your manifest file

Can also be set for every launch configuration with the [`brightscript.debug.rootDir`](../extension-settings.md#brightscriptdebugrootdir) setting.

**Type:** `string` · **Default:** `"${workspaceFolder}"`
<!-- generated:end -->

### `tsPath`
<!-- generated:start -->
Device path to the app's compiled JS bundle the JS debugger should attach to. Overrides the `ts_path` value from the app's manifest.

**Type:** `string`

Example:

`"pkg:/source/compiled/main.js"`
<!-- generated:end -->

### `waitForJsDebugger`
<!-- generated:start -->
When launching a TS/JS app, ask the device to hold app startup until the JS debugger attaches (by appending `inspect=1` to the sideload form) so breakpoints in startup code get hit. Set to false as an escape hatch in case this causes launch issues.

Can also be set for every launch configuration with the [`brightscript.debug.waitForJsDebugger`](../extension-settings.md#brightscriptdebugwaitforjsdebugger) setting.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `debugRootDir`
<!-- generated:start -->
> [!WARNING]
> **Deprecated.** Deprecated. Use sourceDirs instead

If you have a build system, rootDir will point to the build output folder, and this path should point to the actual source folder so that breakpoints can be set in the source files when debugging. In order for this to work, your build process cannot change line offsets between source files and built files, otherwise debugger lines will be out of sync.

Can also be set for every launch configuration with the [`brightscript.debug.debugRootDir`](../extension-settings.md#brightscriptdebugdebugrootdir) setting.

**Type:** `string` · **Default:** `"${workspaceFolder}"`
<!-- generated:end -->

### `sourceDirs`
<!-- generated:start -->
If you have a build system, this array will point to paths of actual source folders so that breakpoints can be set in the source files when debugging. In order for this to work, your build process cannot change line offsets between source files and built files, otherwise, debugger lines will be out of sync.

Can also be set for every launch configuration with the [`brightscript.debug.sourceDirs`](../extension-settings.md#brightscriptdebugsourcedirs) setting.

**Type:** `array` · **Default:** `["${workspaceFolder}"]`
<!-- generated:end -->

### `bsConst`
<!-- generated:start -->
An object of bs_const values to be updated in the manifest before side loading.

Can also be set for every launch configuration with the [`brightscript.debug.bsConst`](../extension-settings.md#brightscriptdebugbsconst) setting.

**Type:** `object`
<!-- generated:end -->

### `rendezvousTracking`
<!-- generated:start -->
Should rendezvous tracking be enabled on launch? If `true`: turn on ECP rendezvous tracking, or turn on 8080 rendezvous tracking if ECP unsupported. If `false`, turn off both.

Can also be set for every launch configuration with the [`brightscript.debug.rendezvousTracking`](../extension-settings.md#brightscriptdebugrendezvoustracking) setting.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `componentLibrariesPort`
<!-- generated:start -->
Port to access component libraries.

Can also be set for every launch configuration with the [`brightscript.debug.componentLibrariesPort`](../extension-settings.md#brightscriptdebugcomponentlibrariesport) setting.

**Type:** `number` · **Default:** `8080`
<!-- generated:end -->

### `componentLibrariesOutDir`
<!-- generated:start -->
> [!WARNING]
> **Deprecated.** This no longer user-configurable. This value will be set to "${outDir}/component-libraries" by the extension.

Can also be set for every launch configuration with the [`brightscript.debug.componentLibrariesOutDir`](../extension-settings.md#brightscriptdebugcomponentlibrariesoutdir) setting.

**Type:** `string` · **Default:** `""`
<!-- generated:end -->

### `componentLibraries`
<!-- generated:start -->
An array of file path sets. One for each component library. Each index is an array of file paths, file globs. This will override the defaults, so if specified, you must provide ALL files. See https://npmjs.com/roku-deploy for examples. You must specify a componentLibrariesOutDir to use this.

Can also be set for every launch configuration with the [`brightscript.debug.componentLibraries`](../extension-settings.md#brightscriptdebugcomponentlibraries) setting.

**Type:** `object[]`

**Default:**

```json
[
    {
        "rootDir": "${workspaceFolder}/LibDir/",
        "outFile": "LibName.zip",
        "files": [
            "manifest",
            "source/**/*.*",
            "components/**/*.*",
            "images/**/*.*"
        ]
    }
]
```

Properties:

- `rootDir` (string, required): Root directory of source files for this component library.
- `install` (boolean): Should this component library be installed onto the Roku device during the sideloading process? Component libraries are installed in the order they're found in this array, so it is recommended to keep all `install: true` component libraries at the top of the array. To utilize this component library in your application, set `dcl_channel_ids=DCLHelloLib:devlib_dcl_1` (where 1 is the 1-based position in this array)
- `enablePostfix` (boolean): Should this component library's files be renamed with a `__lib<index>` postfix during staging? Postfixing renames the library's files and rewrites the references between them so the debugger can map device-reported file paths back to the component library they came from. This covers BrightScript and XML files as well as any file imported via `<script>` tags (which can have any extension). Set to `false` to leave file names untouched (for example, when the library loads files by a fixed name at runtime); source mapping for this library's files will be degraded while debugging.
- `outFile` (string, required): A file name and extension used as the static file name for the zip. You can use manifest values in this property such as ${title} to be inferred from the library's manifest file.
- `tsPath` (string): Device path to this component library's compiled JS bundle (same meaning as the `ts_path` manifest value). When the app's own manifest has no `ts_path`, the first component library with a `tsPath` becomes the target the JS debugger attaches to.
- `files` (array, required): A file path or file glob that should be copied to the  component library zip.
- `sourceDirs` (array): If you have a build system, this array will point to paths of actual source folders so that breakpoints can be set in the source files when debugging. In order for this to work, your build process cannot change line offsets between source files and built files, otherwise, debugger lines will be out of sync.
- `packageTask` (string): Task to run in tasks.json instead of roku-deploy to produce the component library .zip file that will be uploaded to the Roku.
- `packagePath` (string): Path to the component library .zip that will be uploaded to the Roku
- `packageUploadOverrides` (object): Overrides for values used during the roku-deploy zip upload process, like the route and various form data. You probably don't need to change these...
    - `route` (string): The route to use for uploading to the Roku device. Defaults to 'plugin_install'
    - `formData` (object): A dictionary of form fields to be included in the package upload request. Set a value to null to delete from the form
<!-- generated:end -->

### `autoRunSgDebugCommands`
<!-- generated:start -->
SceneGraph debug commands to run on port 8080 of the device at the start of a debug session. Supports the shorthands `chanperf`, `fpsdisplay`, `logrendezvous` and `brightscript_warnings 0`, or any other SceneGraph debug command (i.e. `chanperf -r 10` or `clear_launch_caches`).

Can also be set for every launch configuration with the [`brightscript.debug.autoRunSgDebugCommands`](../extension-settings.md#brightscriptdebugautorunsgdebugcommands) setting.

**Type:** `array`

Allowed values:

- `"chanperf"`: Enables running the 'chanperf' command with a 1 second reporting interval at the start of a debug session.
- `"fpsdisplay"`: Enables running of the 'fps_display 1' command at the start of a debug session.
- `"logrendezvous"`: Enables running of the 'logrendezvous on' command at the start of a debug session.
- `"brightscript_warnings 0"`: Changes the maximum number of brightscript warnings displayed on channel install to zero.
- _any other value_: Custom SGDebug command that will be run on port 8080
<!-- generated:end -->

### `fileLogging`
<!-- generated:start -->
Write the device output and the RokuCommunity debugger logs to files. `true` uses the default settings, or pass an object to configure each log.

Can also be set for every launch configuration with the [`brightscript.debug.fileLogging`](../extension-settings.md#brightscriptdebugfilelogging) setting.

**Type:** `object | boolean`

Properties:

- `enabled` (boolean): Should file logging be enabled
- `dir` (string): Directory where log files should be stored. used when filename is relative
- `logLimit` (number): The number of log files to keep. `null` means keep all logs
- `rokuDevice` (object | boolean): File logging for the telnet or IO output from the Roku device currently being debugged. (i.e. all the stuff produced by `print` statements in your code)
    - `enabled` (boolean): Should file logging be enabled
    - `dir` (string): Directory where log files should be stored. used when filename is relative
    - `logLimit` (number): The number of log files to keep. `null` means keep all logs
    - `mode` (string): `'session'` means a unique timestamped file will be created on every debug session.`'append'` means all logs will be appended to a single file
- `debugger` (object | boolean): File logging for the debugger. Mostly used to provide crash logs to the RokuCommunity team.
    - `enabled` (boolean): Should file logging be enabled
    - `dir` (string): Directory where log files should be stored. used when filename is relative
    - `logLimit` (number): The number of log files to keep. `null` means keep all logs
    - `mode` (string): `'session'` means a unique timestamped file will be created on every debug session.`'append'` means all logs will be appended to a single file
<!-- generated:end -->

### `outDir`
<!-- generated:start -->
The folder where the the build artifacts are placed (like the staging folder and .zip files of the apps)

Can also be set for every launch configuration with the [`brightscript.debug.outDir`](../extension-settings.md#brightscriptdebugoutdir) setting.

**Type:** `string` · **Default:** `"${workspaceFolder}/out"`
<!-- generated:end -->

### `stagingDir`
<!-- generated:start -->
The folder where the vscode will copy all the project files to before creating the zip

Can also be set for every launch configuration with the [`brightscript.debug.stagingDir`](../extension-settings.md#brightscriptdebugstagingdir) setting.

**Type:** `string` · **Default:** `"${workspaceFolder}/out/.roku-deploy-staging"`
<!-- generated:end -->

### `stopOnEntry`
<!-- generated:start -->
Should the debugger stop on the first line of the program after launch.

Can also be set for every launch configuration with the [`brightscript.debug.stopOnEntry`](../extension-settings.md#brightscriptdebugstoponentry) setting.

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `retainStagingFolder`
<!-- generated:start -->
Prevent the staging folder from being deleted after the deployment package is created.  This is helpful for troubleshooting why your package isn't being created the way you expected.

Can also be set for every launch configuration with the [`brightscript.debug.retainStagingFolder`](../extension-settings.md#brightscriptdebugretainstagingfolder) setting.

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `retainDeploymentArchive`
<!-- generated:start -->
Prevent the deployment package from being deleted after launching a debug session.

Can also be set for every launch configuration with the [`brightscript.debug.retainDeploymentArchive`](../extension-settings.md#brightscriptdebugretaindeploymentarchive) setting.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `enableVariablesPanel`
<!-- generated:start -->
> [!WARNING]
> **Deprecated.** Use 'deferScopeLoading' instead.

Enables automatic population of the debug variable panel on a breakpoint or runtime errors.

Can also be set for every launch configuration with the [`brightscript.debug.enableVariablesPanel`](../extension-settings.md#brightscriptdebugenablevariablespanel) setting.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `deferScopeLoading`
<!-- generated:start -->
Will defer the population of the 'Local' scope variables until the user expands it in the variables panel.

Can also be set for every launch configuration with the [`brightscript.debug.deferScopeLoading`](../extension-settings.md#brightscriptdebugdeferscopeloading) setting.

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `autoResolveVirtualVariables`
<!-- generated:start -->
(Experimental) Enables automatic population of the virtual variables.

Can also be set for every launch configuration with the [`brightscript.debug.autoResolveVirtualVariables`](../extension-settings.md#brightscriptdebugautoresolvevirtualvariables) setting.

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `enhanceREPLCompletions`
<!-- generated:start -->
Enables scanning deployment files for additional REPL completions, such as user-defined functions. This process runs in a background thread and may be resource-intensive.

Can also be set for every launch configuration with the [`brightscript.debug.enhanceREPLCompletions`](../extension-settings.md#brightscriptdebugenhancereplcompletions) setting.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `showHiddenVariables`
<!-- generated:start -->
Show variables that are prefixed with a special prefix designated to be hidden

Can also be set for every launch configuration with the [`brightscript.debug.showHiddenVariables`](../extension-settings.md#brightscriptdebugshowhiddenvariables) setting.

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `envFile`
<!-- generated:start -->
A path to an environment variables file.

Can also be set for every launch configuration with the [`brightscript.debug.envFile`](../extension-settings.md#brightscriptdebugenvfile) setting.

**Type:** `string` · **Default:** `".env"`
<!-- generated:end -->

### `consoleOutput`
<!-- generated:start -->
Determines which console output event to listen for. 'full' is every console message (including the ones from the adapter). 'normal' excludes output initiated by the adapter and rendezvous logs if enabled on the device.

Can also be set for every launch configuration with the [`brightscript.debug.consoleOutput`](../extension-settings.md#brightscriptdebugconsoleoutput) setting.

**Type:** `string` · **Default:** `"normal"`

Allowed values:

- `"full"`
- `"normal"`
<!-- generated:end -->

### `raleTrackerTaskFileLocation`
<!-- generated:start -->
This is an absolute path to the TrackerTask.xml file to be injected into your Roku channel during a debug session.

Can also be set for every launch configuration with the [`brightscript.debug.raleTrackerTaskFileLocation`](../extension-settings.md#brightscriptdebugraletrackertaskfilelocation) setting.

**Type:** `string`
<!-- generated:end -->

### `injectRaleTrackerTask`
<!-- generated:start -->
Will inject the Roku Advanced Layout Editor(RALE) TrackerTask into your channel if one is defined in your user settings.

Can also be set for every launch configuration with the [`brightscript.debug.injectRaleTrackerTask`](../extension-settings.md#brightscriptdebuginjectraletrackertask) setting.

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `injectRdbOnDeviceComponent`
<!-- generated:start -->
Will inject the OnDeviceComponent used by RDB for RALE like functionality inside of the extension

Can also be set for every launch configuration with the [`brightscript.debug.injectRdbOnDeviceComponent`](../extension-settings.md#brightscriptdebuginjectrdbondevicecomponent) setting.

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `disableScreenSaver`
<!-- generated:start -->
If injectRdbOnDeviceComponent is true and this is true the screen saver will be be disabled while the deployed application is running.

Can also be set for every launch configuration with the [`brightscript.debug.disableScreenSaver`](../extension-settings.md#brightscriptdebugdisablescreensaver) setting.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `files`
<!-- generated:start -->
An array of file paths, file globs, or {src:string;dest:string} objects that will be copied into the deployment package. This will override the defaults, so if specified, you must provide ALL files. See https://npmjs.com/roku-deploy for examples.

Can also be set for every launch configuration with the [`brightscript.debug.files`](../extension-settings.md#brightscriptdebugfiles) setting.

**Type:** `array`

**Default:**

```json
[
    "manifest",
    "source/**/*.*",
    "components/**/*.*",
    "images/**/*.*"
]
```
<!-- generated:end -->

### `enableDebuggerAutoRecovery`
<!-- generated:start -->
Enables automatic continue when hitting an incorrect 'break in' breakpoint, which are produced by a bug in the roku microdebugger, mishandling multiple runloops. This flag will enable you to recover in most cases - wait until the skipping bogus breakpoint messages have all stopped before continuing to use your app, for best results.

Can also be set for every launch configuration with the [`brightscript.debug.enableDebuggerAutoRecovery`](../extension-settings.md#brightscriptdebugenabledebuggerautorecovery) setting.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `stopDebuggerOnAppExit`
<!-- generated:start -->
If true, will terminate the debug session if app exit is detected. This option is ignored when enableDebugProtocol is set to true. This currently relies on 9.1+ launch beacon notifications, so will not work on a pre 9.1 device.

Can also be set for every launch configuration with the [`brightscript.debug.stopDebuggerOnAppExit`](../extension-settings.md#brightscriptdebugstopdebuggeronappexit) setting.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `profiling`
<!-- generated:start -->
Configuration for profiling functionality

Can also be set for every launch configuration with the [`brightscript.debug.profiling`](../extension-settings.md#brightscriptdebugprofiling) setting.

**Type:** `object`

**Default:**

```json
{
    "tracing": {
        "enable": true,
        "dir": "${workspaceFolder}/profiling",
        "filename": "${appTitle}_${timestamp}.perfetto-trace",
        "connectOnStart": false
    }
}
```

Properties:

- `tracing` (object): Configuration for Perfetto event profiling
    - `enable` (boolean): Should Perfetto event profiling be enabled
    - `dir` (string): Directory where profile files should be stored
    - `filename` (string): The name of the profile file. Can include variables like ${appTitle} and ${timestamp}
    - `connectOnStart` (boolean): Should profiling connect automatically on debug session start
<!-- generated:end -->

### `enableSourceMaps`
<!-- generated:start -->
If true, the debugger will read any available sourcemaps and attempt to convert debugger locations into their original source locations.

Can also be set for every launch configuration with the [`brightscript.debug.enableSourceMaps`](../extension-settings.md#brightscriptdebugenablesourcemaps) setting.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `rewriteDevicePathsInLogs`
<!-- generated:start -->
If true, then any pkg path found in the device logs will be converted to a source location

Supported formats:
- pkg:/source/main.brs:10
- pkg:/source/main.brs(10)
- pkg:/source/main.brs:10:20
- pkg:/source/main.brs(10:20)
- ...ce/main.brs:10
- ...ce/main.brs(10)
- ...ce/main.brs:10:20
- ...ce/main.brs(10:20)

Can also be set for every launch configuration with the [`brightscript.debug.rewriteDevicePathsInLogs`](../extension-settings.md#brightscriptdebugrewritedevicepathsinlogs) setting.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `emitChannelPublishedEvent`
<!-- generated:start -->
Should the ChannelPublishedEvent be emitted. This is a hack for when certain roku devices become locked up as a result of this event being emitted. You probably don't need to set this

Can also be set for every launch configuration with the [`brightscript.debug.emitChannelPublishedEvent`](../extension-settings.md#brightscriptdebugemitchannelpublishedevent) setting.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `packagePort`
<!-- generated:start -->
The port used for package-related requests. This is mainly used for things like emulators, or when your roku is behind a firewall with a port-forward.

Can also be set for every launch configuration with the [`brightscript.debug.packagePort`](../extension-settings.md#brightscriptdebugpackageport) setting.

**Type:** `number` · **Default:** `80`
<!-- generated:end -->

### `remotePort`
<!-- generated:start -->
The port used for sending remote control commands (like home press or back press). This is mainly used for things like emulators, or when your roku is behind a firewall with a port-forward.

Can also be set for every launch configuration with the [`brightscript.debug.remotePort`](../extension-settings.md#brightscriptdebugremoteport) setting.

**Type:** `number` · **Default:** `8060`
<!-- generated:end -->

### `logfilePath`
<!-- generated:start -->
> [!WARNING]
> **Deprecated.** Use `fileLogging` option instead

A path to a file where all brightscript console output will be written. If null or empty, file logging will be disabled.

Can also be set for every launch configuration with the [`brightscript.debug.logfilePath`](../extension-settings.md#brightscriptdebuglogfilepath) setting.

**Type:** `string`
<!-- generated:end -->

### `debugAdapterProtocolLogging`
<!-- generated:start -->
> [!WARNING]
> **Deprecated.** Experimental and subject to change

Log all Debug Adapter Protocol (DAP) communication between VS Code and the debug adapter. Each session writes a new timestamped file to the workspace's `logs/` folder. Useful for crash diagnostics. Can also be set as a VS Code workspace/user setting.

Can also be set for every launch configuration with the [`brightscript.debug.debugAdapterProtocolLogging`](../extension-settings.md#brightscriptdebugdebugadapterprotocollogging) setting.

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `packageTask`
<!-- generated:start -->
Task to run instead of roku-deploy to produce the .zip file that will be uploaded to the Roku.

Can also be set for every launch configuration with the [`brightscript.debug.packageTask`](../extension-settings.md#brightscriptdebugpackagetask) setting.

**Type:** `string`
<!-- generated:end -->

### `packagePath`
<!-- generated:start -->
Path to the .zip that will be uploaded to the Roku

Can also be set for every launch configuration with the [`brightscript.debug.packagePath`](../extension-settings.md#brightscriptdebugpackagepath) setting.

**Type:** `string`
<!-- generated:end -->

### `packageUploadOverrides`
<!-- generated:start -->
Overrides for values used during the roku-deploy zip upload process, like the route and various form data. You probably don't need to change these...

Can also be set for every launch configuration with the [`brightscript.debug.packageUploadOverrides`](../extension-settings.md#brightscriptdebugpackageuploadoverrides) setting.

**Type:** `object` · **Default:** `{"route":"plugin_install","formData":{}}`

Properties:

- `route` (string): The route to use for uploading to the Roku device. Defaults to 'plugin_install'
- `formData` (object): A dictionary of form fields to be included in the package upload request. Set a value to null to delete from the form
<!-- generated:end -->

### `enableDebugProtocol`
<!-- generated:start -->
If true, the debugger will use the new BrightScript debug protocol, and will disable the telnet debugger. See this link for more details: https://developer.roku.com/en-ca/docs/developer-program/debugging/socket-based-debugger.md

Can also be set for every launch configuration with the [`brightscript.debug.enableDebugProtocol`](../extension-settings.md#brightscriptdebugenabledebugprotocol) setting.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `logLevel`
<!-- generated:start -->
The level of logging that should be done during a debug session.

Can also be set for every launch configuration with the [`brightscript.debug.logLevel`](../extension-settings.md#brightscriptdebugloglevel) setting.

**Type:** `string` · **Default:** `"log"`

Allowed values:

- `"off"`
- `"error"`
- `"warn"`
- `"log"`
- `"info"`
- `"debug"`
- `"trace"`
<!-- generated:end -->

### `deleteDevChannelBeforeInstall`
<!-- generated:start -->
Delete any currently installed dev channel before starting the debug session

Can also be set for every launch configuration with the [`brightscript.debug.deleteDevChannelBeforeInstall`](../extension-settings.md#brightscriptdebugdeletedevchannelbeforeinstall) setting.

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `sceneGraphDebugCommandsPort`
<!-- generated:start -->
Port for sending SceneGraph debug commands

Can also be set for every launch configuration with the [`brightscript.debug.sceneGraphDebugCommandsPort`](../extension-settings.md#brightscriptdebugscenegraphdebugcommandsport) setting.

**Type:** `number` · **Default:** `8080`
<!-- generated:end -->

### `remoteControlMode`
<!-- generated:start -->
Turn remote control mode on when a debug session starts and off when it ends. `true` does both, or pass an object to choose.

Can also be set for every launch configuration with the [`brightscript.debug.remoteControlMode`](../extension-settings.md#brightscriptdebugremotecontrolmode) setting.

**Type:** `object | boolean`

Properties:

- `activateOnSessionStart` (boolean): Activate remote control mode on debug session start
- `deactivateOnSessionEnd` (boolean): Deactivate remote control mode on session end
<!-- generated:end -->
