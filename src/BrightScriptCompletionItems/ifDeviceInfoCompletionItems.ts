import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifDeviceInfoCompletionItems: CompletionItem[] = [
    // ############### Device Properties ###############
    {
        kind: CompletionItemKind.Method,
        label: 'GetModel',
        insertText: new vscode.SnippetString('GetModel()'),
        detail: 'GetModel() as String',
        documentation: new vscode.MarkdownString(
`
Returns the model name for the Roku Streaming Player device running the script.
This is a five-character alphanumeric string; for example, "3050X". Please see Roku Models and Features of the Developer Guide for a list of the current and classic models.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetModelDisplayName',
        insertText: new vscode.SnippetString('GetModelDisplayName()'),
        detail: 'GetModelDisplayName() as String',
        documentation: new vscode.MarkdownString(
`
Returns the model display name for the Roku Streaming Player device running the script (for example, "Roku 2 XD").
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetModelType',
        insertText: new vscode.SnippetString('GetModelType()'),
        detail: 'GetModelType() as String',
        documentation: new vscode.MarkdownString(
`
Returns a string describing what type of device it is. For future compatibility,
the caller should by default assume "STB" when anything other than described value is returned. Current possible values are:

"STB" Set-top box type device.
"TV" Roku TV type device.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetModelDetails',
        insertText: new vscode.SnippetString('GetModelDetails()'),
        detail: 'GetModelDetails() as Object',
        documentation: new vscode.MarkdownString(
`
Returns an associative array containing more information about the device model. The following keys are defined:

VendorName  - string describing model vendor
ModelNumber - string describing model number
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetFriendlyName',
        insertText: new vscode.SnippetString('GetFriendlyName()'),
        detail: 'GetFriendlyName() as String',
        documentation: new vscode.MarkdownString(
`
Returns a string describing the device that may be used for network device selection.
The string may be a user-assigned device name or a description of the device such as model name and/or serial number. The string is subject to change and should not be used as a persistent key or ID.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetVersion',
        insertText: new vscode.SnippetString('GetVersion()'),
        detail: 'GetVersion() as String',
        documentation: new vscode.MarkdownString(
`
Returns the version number of the Roku Streaming Player firmware running on the device. This is a 13 character string; for example "034.08E01185A".
The third through sixth characters are the major/minor version number ("4.08") and the ninth through twelfth are the build number ("1185").
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetRIDA',
        insertText: new vscode.SnippetString('GetRIDA()'),
        detail: 'GetRIDA() as String',
        documentation: new vscode.MarkdownString(
`
_Available since firmware 8.1_

GetRIDA() returns a unique identifier of the unit running the script.
The string returned is a Universally Unique Identifier (UUID).
This identifier is persistent but can be reset by the user from the device's Settings menu or by performing a factory reset on the device.
If the user has set "Limit ad tracking" (RIDA is disabled) from the Settings menu, then this identifier should not be used for targeted advertising.
Additionally, if the viewer’s country is an EU member country, any data collection must be compliant with the EU General Data Protection Regulation.

IsRIDADisabled() should be called to check if the user has disabled RIDA tracking and GetUserCountryCode() should be called to check the user’s country.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'IsRIDADisabled',
        insertText: new vscode.SnippetString('IsRIDADisabled()'),
        detail: 'IsRIDADisabled() as Boolean',
        documentation: new vscode.MarkdownString(
`
_Available since firmware 8.1_

IsRIDADisabled() returns True if the user has disabled RIDA tracking by selecting "Limit tracking" from the Roku Settings menu.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetChannelClientId',
        insertText: new vscode.SnippetString('GetChannelClientId()'),
        detail: 'GetChannelClientId() as String',
        documentation: new vscode.MarkdownString(
`
_Available since firmware 8.1_

GetChannelClientId() returns a unique identifier of the unit running the script.
This identifier is different across channels so each channel will get a different identifier when calling this function.

The ID is persistent and cannot be reset. It is, therefore, the recommended alternative to the ESN returned by GetDeviceUniqueId().

This value can be used to manage or identify devices linked to the channel’s content services.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetUserCountryCode',
        insertText: new vscode.SnippetString('GetUserCountryCode()'),
        detail: 'GetUserCountryCode() as String',
        documentation: new vscode.MarkdownString(
`
_Available since firmware 8.1_

To determine the country associated with a user’s Roku account, a new method GetUserCountryCode() as String was added to roDeviceInfo.
Typically, the value returned will be an ISO 3166-1 (2-letter) country code representing the country.

Note: If the channel owner entered into an additional agreement to have the channel published to a curated Roku Powered Channel Store instead of the user country,
a Roku Powered Channel Store Identifier will instead be returned.

A future enhancement to GetUserCountryCode() will return the 2-letter country code instead of the Roku Powered Channel Store Identifier.
We, therefore, recommend that channels utilize both to avoid having to update later.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetRandomUUID',
        insertText: new vscode.SnippetString('GetRandomUUID()'),
        detail: 'GetRandomUUID() as String',
        documentation: new vscode.MarkdownString(
`
Returns a randomly generated unique identifier.
The string returned is a Universally Unique Identifier (UUID) version 4 as specified in IETF-RFC 4122 with 36 characters (32 alphanumeric characters and four hyphens).
The characters are grouped in the form 8-4-4-4-12, for example "123e4567-e89b-12d3-a456-426655440000". Each time this function is called, a different identifier is returned.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetTimeZone',
        insertText: new vscode.SnippetString('GetTimeZone()'),
        detail: 'GetTimeZone() as String',
        documentation: new vscode.MarkdownString(
`
Returns a string representing the user's current system time zone setting. Current possible values are:

* "US/Puerto Rico-Virgin Islands"
* "US/Guam"
* "US/Samoa"
* "US/Hawaii"
* "US/Aleutian"
* "US/Alaska"
* "US/Pacific"
* "US/Arizona"
* "US/Mountain"
* "US/Central"
* "US/Eastern"
* "Canada/Pacific"
* "Canada/Mountain"
* "Canada/Central Standard"
* "Canada/Central"
* "Canada/Eastern"
* "Canada/Atlantic"
* "Canada/Newfoundland"
* "Europe/Iceland"
* "Europe/Ireland"
* "Europe/United Kingdom"
* "Europe/Portugal"
* "Europe/Central European Time"
* "Europe/Greece/Finland"
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'HasFeature',
        insertText: new vscode.SnippetString(
            'HasFeature(${1|"5.1_surround_sound","can_output_5.1_surround_sound","sd_only_hardware","usb_hardware","sdcard_hardware","ethernet_hardware","gaming_hardware","energy_star_compliant"|})'
            ),
        detail: 'HasFeature() as Boolean',
        documentation: new vscode.MarkdownString(
`
Returns true if the current device/firmware supports the passed in feature string.

Valid features to query for are:

* "5.1_surround_sound"
* "can_output_5.1_surround_sound"
* "sd_only_hardware"
* "usb_hardware"
* "sdcard_hardware"
* "ethernet_hardware"
* "gaming_hardware"
* "energy_star_compliant" **

** Note: "energy_star_compliant" available for Roku powered TV's as of firmware version 8.1
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetCurrentLocale',
        insertText: new vscode.SnippetString('GetCurrentLocale()'),
        detail: 'GetCurrentLocale() as String',
        documentation: new vscode.MarkdownString(
`
Returns a string representing the current locale based on the user's language setting.
The string is an ISO 639-1 (2-letter) language code followed by an underscore and a ISO 3166-1 (2-letter) country code. Current possible values are:

Value | Language
--- | ---
"en_US" | US English
"en_GB" | British English
"fr_CA" | Canadian French
"es_ES" | International Spanish
"de_DE" | German
"it_IT" | Italian
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetCountryCode',
        insertText: new vscode.SnippetString('GetCountryCode()'),
        detail: 'GetCountryCode() as String',
        documentation: new vscode.MarkdownString(
`
Returns a value that designates the Roku Channel Store associated with a user’s Roku account.
Typically, the value returned will be an ISO 3166-1 (2-letter) country code representing the country.
Alternatively, if the channel owner entered into an additional agreement to have the channel published to a curated Roku Powered Channel Store instead of the user country,
then a Roku Powered Channel Store Identifier will instead be returned.

Current possible values are:

Value | Country
--- | ---
"CA" | Canada
"Econet" | Econet Zimbabwe
"FR" | 	France
"GB" | Great Britain
"globe" | Globe Philippines
"IE" | Republic of Ireland
"MX" | Mexico
"OT" | Rest of World
"PLDT" | PLDT Philippines
"Telstra" | Telstra Australia
"skyde" | Sky Germany
"skyes" | Sky Spain
"skyie" | Sky Ireland
"skyit" | Sky Italy
"skyuk" | Sky UK
"US" | United States

This does not necessarily match the physical location of the device, nor does it necessarily match the last two letters of the current locale string.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'TimeSinceLastKeypress',
        insertText: new vscode.SnippetString('TimeSinceLastKeypress()'),
        detail: 'TimeSinceLastKeypress() as Integer',
        documentation: new vscode.MarkdownString(
`
Returns the number of seconds since the last remote keypress was received.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetDrmInfoEx',
        insertText: new vscode.SnippetString('GetDrmInfoEx()'),
        detail: 'GetDrmInfoEx() as Object',
        documentation: new vscode.MarkdownString(
`
_Available since firmware version 8.1_

A new API, GetDrmInfoEx(), returns an associative array with the supported DRM system and features.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetCaptionsMode',
        insertText: new vscode.SnippetString('GetCaptionsMode()'),
        detail: 'GetCaptionsMode() as String',
        documentation: new vscode.MarkdownString(
`
This function returns the current global setting for the Mode property. In other words, this function is used to determine whether global captions are turned on or off, or are in instant replay mode.

Possible Values:

* On
* Off
* Instant replay

Note: On a Roku TV, when the user selects On Mute this function will return On when the TV is muted and Off when it is not muted.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetCaptionsMode',
        insertText: new vscode.SnippetString('SetCaptionsMode(${1:mode as String})'),
        detail: 'SetCaptionsMode(mode as String) as Boolean',
        documentation: new vscode.MarkdownString(
`
This function sets the current global setting for the Mode property.
In other words, this function is used to determine whether global captions are turned on or off, or are in instant replay mode or enabled onMute.
The possible parameter values are those listed for the Mode property. The function returns true if the mode was successfully set.

Possible Values:

* On
* Off
* Instant replay
* When mute (Roku tv only)
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetCaptionsOption',
        insertText: new vscode.SnippetString('GetCaptionsOption(${1:option as String})'),
        detail: 'GetCaptionsOption(option as String) as String',
        documentation: new vscode.MarkdownString(
`
This function returns the current value of the specified global setting property. The value returned is one of the possible values for the specified property.

See online documentation for more info on possible properties and values
https://sdkdocs.roku.com/display/sdkdoc/ifDeviceInfo
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetClockFormat',
        insertText: new vscode.SnippetString('GetClockFormat()'),
        detail: 'GetClockFormat() as Integer',
        documentation: new vscode.MarkdownString(
`
GetClockFormat lets the channel query whether the system settings for
Time (Setting --> System --> Time) is set to a 12 or 24-hour format. The API returns 0 for the 12-hour format and 1 for the 24-hour format.

_This function is available in firmware 8.0 and above._
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'EnableAppFocusEvent',
        insertText: new vscode.SnippetString('EnableAppFocusEvent(${1:enable as Boolean})'),
        detail: 'EnableAppFocusEvent() as Void',
        documentation: new vscode.MarkdownString(
`
Channels can get notified when a system overlay event (such as the confirm partner button HUD or the caption control overlay) is displayed.
This notification gives the channel the opportunity to do any processing they may want to when the channel loses or regains focus. The default is the overlay event display is disabled (false).

_This function is available in firmware 8.0 and above._
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'EnableScreensaverExitedEvent',
        insertText: new vscode.SnippetString('EnableScreensaverExitedEvent(${1:enable as Boolean})'),
        detail: 'EnableScreensaverExitedEvent() as Void',
        documentation: new vscode.MarkdownString(
`
Enables (true) or disables (false) sending an roDeviceInfoEvent when a user has exited the screensaver. The default is disabled (false).

To receive events, you must have first called SetMessagePort on the roDeviceInfo object specifying the message port that is to receive the events.

_This function is available in firmware 7.5 and above._
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'EnableLowGeneralMemoryEvent',
        insertText: new vscode.SnippetString('EnableLowGeneralMemoryEvent(${1:enable as Boolean})'),
        detail: 'EnableLowGeneralMemoryEvent() as Void',
        documentation: new vscode.MarkdownString(
`
_Available since firmware version 8.1_

If enabled, requests the OS to send a roDeviceInfoEvent with generalMemoryLevel field set.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetGeneralMemoryLevel',
        insertText: new vscode.SnippetString('GetGeneralMemoryLevel()'),
        detail: 'GetGeneralMemoryLevel() as String',
        documentation: new vscode.MarkdownString(
`
_Available since firmware version 8.1_

Returns "normal", "low", or "critical" depending on the general memory levels for the application.
`
        )
    },
    // ############### Network Info ###############
    {
        kind: CompletionItemKind.Method,
        label: 'GetLinkStatus',
        insertText: new vscode.SnippetString('GetLinkStatus()'),
        detail: 'GetLinkStatus() as Boolean',
        documentation: new vscode.MarkdownString(
`
Returns true if the player seems to have an active network connection.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'EnableLinkStatusEvent',
        insertText: new vscode.SnippetString('EnableLinkStatusEvent(${1:enable as Boolean})'),
        detail: 'EnableLinkStatusEvent() as Boolean',
        documentation: new vscode.MarkdownString(
`
Enables or disables sending an roDeviceInfoEvent when the network connection status changes. The default is disabled.

To receive events, you must have first called SetMessagePort on the roDeviceInfo object specifying the message port that is to receive the events.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetConnectionType',
        insertText: new vscode.SnippetString('GetConnectionType()'),
        detail: 'GetConnectionType() as String',
        documentation: new vscode.MarkdownString(
`
If the unit is connected via WiFi, returns the string "WiFiConnection".
If the unit is connected via a wired connection, returns "WiredConnection". If the unit is not connected, returns an empty string.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetExternalIp',
        insertText: new vscode.SnippetString('GetExternalIp()'),
        detail: 'GetExternalIp() as String',
        documentation: new vscode.MarkdownString(
`
Returns the external IP address of the Roku player. This is the address seen by the Internet and all other computers outside your local network.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetIPAddrs',
        insertText: new vscode.SnippetString('GetIPAddrs()'),
        detail: 'GetIPAddrs() as Object',
        documentation: new vscode.MarkdownString(
`
Returns roAssociativeArray. Each key in the AA is the name of a network interface and the value is the IP-address of the interface. Normally there will be only one interface in the AA.

Provides a way for your application to get the local IP address of the Roku box.
This can be used in conjunction with the ECP (see the External Control Protocol Guide) command "launch" (or "install" for uninstalled channels) to start a different channel from the current channel.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetConnectionInfo',
        insertText: new vscode.SnippetString('GetConnectionInfo()'),
        detail: 'GetConnectionInfo() as Object',
        documentation: new vscode.MarkdownString(
`
Returns an Associative Array with these entries:

Name | Value
--- | ---
type | Same as the value returned from GetConnectionType()
name | Name of the connection interface
ip | IP Address used by the connection
mac | MAC address of the connection's hardware
ssid | The SSID of the Access Point (present only if type = "WiFiConnection")
gateway | IP Address of the connection gateway (usually the router)
dns.0 | IP Address of first DNS server associated with the connection
dns.1 | IP Address of the second DNS server, if any

_This function is available in firmware 6.1 and above._
`
        )
    },
    // ############### Video Info ###############
    {
        kind: CompletionItemKind.Method,
        label: 'GetDisplayType',
        insertText: new vscode.SnippetString('GetDisplayType()'),
        detail: 'GetDisplayType() as String',
        documentation: new vscode.MarkdownString(
`
Returns the text corresponding to the button selection in the Player Info Settings/Display Type page. Either "HDTV", "4:3 standard", or "16:9 anamorphic".
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetDisplayMode',
        insertText: new vscode.SnippetString('GetDisplayMode()'),
        detail: 'GetDisplayMode() as String',
        documentation: new vscode.MarkdownString(
`
Returns the configured graphics layer resolution: "480i" or "480p" (if the ui_resolutions manifest entry includes sd as a supported resolution, otherwise "720p" is returned),
"720p", or "1080p" (if the ui_resolutions manifest file entry includes fhd as a supported resolution, otherwise "720p" is returned).
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetDisplayAspectRatio',
        insertText: new vscode.SnippetString('GetDisplayAspectRatio()'),
        detail: 'GetDisplayAspectRatio() as String',
        documentation: new vscode.MarkdownString(
`
Returns "4x3" or "16x9"
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetDisplaySize',
        insertText: new vscode.SnippetString('GetDisplaySize()'),
        detail: 'GetDisplaySize() as Object',
        documentation: new vscode.MarkdownString(
`
Returns an roAssociativeArray with keys "w" and "h" that contain the values for the screen width and height respectively, either 720 and 480, or 1280 and 720. Example: { w:1280, h:720 }.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetVideoMode',
        insertText: new vscode.SnippetString('GetVideoMode()'),
        detail: 'GetVideoMode() as String',
        documentation: new vscode.MarkdownString(
`
Returns a string representing the video playback resolution. The possible strings are:

String | Resolution | Ratio | Rate | Bit Depth
--- | --- | --- | --- | ---
"480i" | 720x480 | 4:3 | 60Hz | 8 Bit
"480p" | 720x480 | 4:3 | 60Hz | 8 Bit
"576i25" | 720x576 | 4:3 | 25Hz | 8 Bit
"576p50" | 720x576 | 4:3 | 50Hz | 8 Bit
"576p60" | 720x576 | 4:3 | 60Hz | 8 Bit
"720p50" | 1280x720 | 16:9 | 50Hz | 8 Bit
"720p" | 1280x720 | 16:9 | 60Hz | 8 Bit
"1080i50" | 1920x1080 | 16:9 | 50Hz | 8 Bit
"1080i" | 1920x1080 | 16:9 | 60Hz | 8 Bit
"1080p24" | 1920x1080 | 16:9 | 24Hz | 8 Bit
"1080p25" | 1920x1080 | 16:9 | 25Hz | 8 Bit
"1080p30" | 1920x1080 | 16:9 | 30Hz | 8 Bit
"1080p50" | 1920x1080 | 16:9 | 50Hz | 8 Bit
"1080p" | 1920x1080 | 16:9 | 60Hz | 8 Bit
"2160p24" | 3840x2160 | 16:9 | 24Hz | 8 Bit
"2160p25" | 3840x2160 | 16:9 | 25Hz | 8 Bit
"2160p30" | 3840x2160 | 16:9 | 30Hz | 8 Bit
"2160p50" | 3840x2160 | 16:9 | 50Hz | 8 Bit
"2160p60" | 3840x2160 | 16:9 | 60Hz | 8 Bit
"2160p24b10" | 3840x2160 | 16:9 | 24Hz | 10 Bit
"2160p25b10" | 3840x2160 | 16:9 | 25Hz | 10 Bit
"2160p30b10" | 3840x2160 | 16:9 | 30Hz | 10 Bit
"2160p50b10" | 3840x2160 | 16:9 | 50Hz | 10 Bit
"2160p60b10" | 3840x2160 | 16:9 | 60Hz | 10 Bit
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetDisplayProperties',
        insertText: new vscode.SnippetString('GetDisplayProperties()'),
        detail: 'GetDisplayProperties() as Object',
        documentation: new vscode.MarkdownString(
`
Returns an roAssociativeArray with the following key/value pairs:

Key | Type
--- | ---
Width | Integer
Height | Integer
Internal | Boolean
Hdr10 | Boolean
DolbyVision | Boolean

_This function is available in firmware 7.0 and above._
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetSupportedGraphicsResolutions',
        insertText: new vscode.SnippetString('GetSupportedGraphicsResolutions()'),
        detail: 'GetSupportedGraphicsResolutions() as Object',
        documentation: new vscode.MarkdownString(
`
Return the list of supported graphics resolutions as a list of roAssociative arrays. Each array has the following keys:

Key | Type
--- | ---
width | Integer
height | Integer
name | String
ui | Boolean
preferred | Boolean

_This function is available in firmware 7.0 and above._
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'CanDecodeVideo',
        insertText: new vscode.SnippetString('CanDecodeVideo(${1:video_format as Object})'),
        detail: 'CanDecodeVideo(video_format as Object) as Object',
        documentation: new vscode.MarkdownString(
`
Checks if the Roku Player can decode and play a video format specified as an associative array,
and returns an associative array that includes a Boolean value indicating if the video format can be played, and the closest video format supported by the Roku Player.

For example, if the application wants to check if the Roku Player can play an AVC stream at high profile and level 4.2, it calls CanDecodeVideo() with the following video_format:

{Codec: "mpeg4 avc", Profile: "high", Level: "4.2"}

If the Roku Player cannot play that video format, it will return false, and return the closest video format it can play, with the changed fields, such as:

{“Result”:false,"Updated": "level;profile", "Codec": "mpeg4 avc", "Profile": "main", "Level": "4.1"}

The return value shows the Roku Player cannot play requested video format,
shows the updated keys of the requested video format (level and profile) that it can support,
and the all the key values of the requested video format supported by the Roku Player.
Format keys that are not provided by the caller are not taken into account and not updated.
For example, calling CanDecodeVideo() with a format description that has only a codec key
(such as {"codec": "vp9"}) will return that same format if the device can decode and play that codec at all,
even if the decode capability is limited to one specific container, profile, and level.

The following are the keys of the requested video format and supported video format associative arrays:

Key | Value | Required
--- | --- | ---
Codec | “mpeg2”, “mpeg4 avc”, “hevc”, “vp9” | Yes
Profile | Specifies the profile | No
Level | Specifies the level | No
Container | “mp4”, “hls”, “mkv”, “ism”, “dash”, “ts” | No

Codec | Profile | Level
--- | --- | ---
"mpeg2" | n/a | "main", "high"
"mpeg4 avc" | "main", "high" | "4.1", "4.2"
"hevc" | "main", "main 10" | "4.1", "5.0", "5.1"
"vp9" | "profile 0", "profile 2" | "4.1", "5.0", "5.1"

_This function is available in firmware 7.0 and above._
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetUIResolution',
        insertText: new vscode.SnippetString('GetUIResolution()'),
        detail: 'GetUIResolution() as Object',
        documentation: new vscode.MarkdownString(
`
Returns an associative array describing the current UI resolution. The associative array contains the following possible key-value pairs:

Key | Values
--- | ---
name | "SD", "HD", "FHD"
width | 720, 1280, 1920
height | 480, 720, 1080

_This function is available in firmware 7.0 and above._
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetGraphicsPlatform',
        insertText: new vscode.SnippetString('GetGraphicsPlatform()'),
        detail: 'GetGraphicsPlatform() as String',
        documentation: new vscode.MarkdownString(
`
Returns a string specifying the device's graphics platform, either opengl or directfb.

_This function is available in firmware 7.6 and above._
`
        )
    },
    // ############### Audio Info ###############
    {
        kind: CompletionItemKind.Method,
        label: 'GetAudioOutputChannel',
        insertText: new vscode.SnippetString('GetAudioOutputChannel()'),
        detail: 'GetAudioOutputChannel() as String',
        documentation: new vscode.MarkdownString(
`
Returns a string representing the selected audio output ("Stereo" or "5.1 surround").
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetAudioDecodeInfo',
        insertText: new vscode.SnippetString('GetAudioDecodeInfo()'),
        detail: 'GetAudioDecodeInfo() as Object',
        documentation: new vscode.MarkdownString(
`
Returns an roAssociativeArray with the EDID (EIA.2FCEA-861) audio decoder information for the device connected to the HDMI port(or the device itself for a Roku TV).
Each audio decoder supported by the device is listed, with up to four numbers describing the decoder from the EDID SAD (Short Audio Descriptor).
Each value is of the form "<number of channels>:<SAD1>:<SAD2>:<PassThru>:".
For example, the name "DD+" may have the value "8:6:0:1" where there are 8 independent audio tracks (7.1 audio),
6 is the SAD1 byte, 0 is the SAD2 byte, and 1 is the binary value that indicates this is a pass-through audio device (not a Roku TV).
The SAD1 and SAD2 bytes are interpreted differently for different codecs and
more information about their values can be found here: http://en.wikipedia.org/wiki/Extended_display_identification_data#CEA_EDID_Timing_Extension_Version_3_data_format
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'CanDecodeAudio',
        insertText: new vscode.SnippetString('CanDecodeAudio(${1:audio_format as Object})'),
        detail: 'CanDecodeAudio(audio_format as Object) as Object',
        documentation: new vscode.MarkdownString(
`
Checks if the Roku Player can decode and play an audio format specified as an associative array,
and returns an associative array that includes a Boolean value indicating if the audio format can be played, and the closest audio format supported by the Roku Player.
The general format of the associative arrays for CanDecodeAudio() is similar to the parameter and return associative arrays used in CanDecodeVideo().

The following are the keys of the requested audio format and supported audio format associative arrays:

Key | Type | Value | Required
--- | --- | --- | ---
Codec | String | “aac”, “ac3”, “eac3”, "alac", "flac", “mp2”, “mp3”, “vorbis”, “wma”, “wma pro”, “dts” | Yes
Profile | String | Specifies the profile. | No
ChCnt | Integer | Specifies the number of audio channels. | No
SampleRate | Integer | Specifies the sample rate. | No
BitRate | Integer | Specifies the bit rate in Kbit/sec. | No
Container | String | Specifies the container format. | No

_This function is available in firmware 7.0 and above._
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetSoundEffectsVolume',
        insertText: new vscode.SnippetString('GetSoundEffectsVolume()'),
        detail: 'GetSoundEffectsVolume() as Integer',
        documentation: new vscode.MarkdownString(
`
Returns the user interface sounds effects volume as a percentage.
A return value of 0 indicates that UI sound effects are muted, and a value of 100 indicates that they are set to the maximum volume level.

_This function is available in firmware 7.0 and above._
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'IsAudioGuideEnabled',
        insertText: new vscode.SnippetString('IsAudioGuideEnabled()'),
        detail: 'IsAudioGuideEnabled() as Boolean',
        documentation: new vscode.MarkdownString(
`
Returns true if Audio Guide is enabled (on supported devices), otherwise false.

_This function is available in firmware 7.5 and above._
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'EnableAudioGuideChangedEvent',
        insertText: new vscode.SnippetString('EnableAudioGuideChangedEvent(${1:enable as Boolean})'),
        detail: 'EnableAudioGuideChangedEvent() as Boolean',
        documentation: new vscode.MarkdownString(
`
Enables (true) or disables (false) sending an roDeviceInfoEvent when Audio Guide is enabled. The default is disabled (false).

To receive events, you must have first called SetMessagePort on the roDeviceInfo object specifying the message port that is to receive the events.

_This function is available in firmware 7.5 and above._
`
        )
    },
];
