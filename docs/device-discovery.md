---
priority: 3
---
# Device Discovery

The BrightScript Language extension includes an automatic Roku device discovery system that uses [SSDP (Simple Service Discovery Protocol)](https://en.wikipedia.org/wiki/Simple_Service_Discovery_Protocol) to find Roku devices on your local network. This guide explains how the system works, what triggers network scans, how devices are cached between sessions, and how to configure or disable the feature.

---

## Overview

When device discovery is enabled, the extension continuously monitors for Roku devices by:

1. **Listening passively** for SSDP `advertise-alive` and `advertise-bye` messages broadcast by Roku devices.
2. **Actively scanning** the network (SSDP M-SEARCH broadcasts targeting `roku:ecp`) when conditions warrant a refresh.
3. **Caching** discovered device details in VS Code's global state so previously seen devices are instantly available the next time you open VS Code.

---

## When Does the Extension Scan for Devices?

Active SSDP scans (M-SEARCH broadcasts) are performed in the following situations:

| Trigger | Description |
|---|---|
| **Extension startup (first launch on network)** | If no devices have been seen on the current network before, a full scan is immediately triggered on startup. |
| **Deferred scan execution** | If a scan has been queued (see [Queued Scans](#queued-scans) below) and the user opens the Device Picker or the Devices Panel becomes visible, the queued scan runs immediately. |
| **Device Picker opened** | Every time the Device Picker is shown, the extension calls `refresh()`. If a scan is needed or the last scan is older than 30 minutes (the _stale scan threshold_), a new scan starts. |
| **Devices Panel becomes visible** | When the Devices panel (side-bar tree view) becomes visible, a `refresh()` is triggered using the same staleness rules. |
| **Network change detected** | When the [Network Change Monitor](#network-change-monitor) detects that the set of local network interfaces has changed, a scan is queued. |
| **Wake from sleep** | When the [System Sleep Monitor](#sleep--wake-tracking) detects the computer has resumed from sleep, a scan is queued. |
| **Manual refresh** | Users can click the inline refresh button on any device in the Devices Panel, or trigger a scan via the **Scan for Devices** item in the Device Picker. |
| **Unhealthy device found** | When a health check reveals that a cached device is no longer reachable, the extension automatically triggers a new scan (if passive scanning is permitted). |

> **Stale scan threshold:** The extension considers scan results stale after **30 minutes**. Any operation that needs device information and finds the last scan was more than 30 minutes ago will trigger a fresh scan.

---

## Queued Scans

To avoid performing expensive SSDP broadcasts more than necessary, the extension uses a _scan needed_ flag instead of scanning immediately in every situation.

### What Sets the Flag

The following events set the `scanNeeded` flag without immediately scanning:

- A network change is detected.
- The computer wakes from sleep.
- Extension startup when previously seen devices exist on the current network (a health check is preferred over an immediate full scan in this case).

### When the Flag Takes Effect

The queued scan is consumed when the user next interacts with a UI surface that requires an up-to-date device list:

- **Device Picker** – Opening the picker calls `refresh()`, which checks the flag and runs the scan.
- **Devices Panel** – When the panel becomes visible and the `scanNeeded-changed` event has fired, the panel immediately calls `refresh()`.

This deferred approach means a network change at 3 AM will not wake the network or consume resources; the scan only runs when you actually open the picker or panel the next morning.

---

## Device Cache Mechanism

### In-memory Device List

While the extension is running, discovered devices are stored in an in-memory array inside `DeviceManager`. Each device entry includes:

- IP address and port (`location`)
- Device ID (`device-id` from Roku's ECP API)
- Full device info returned by Roku's `/query/device-info` endpoint
- A `deviceState` field: `pending`, `online`, or `offline`

Devices transition through states as follows:

| State | Meaning |
|---|---|
| `pending` | Device was loaded from the persistent cache but has not yet been health-checked. |
| `online` | Device responded to a health check and is reachable. |
| `offline` | Device was removed from the list (failed health check or received an SSDP `byebye` message). |

### Persistent Cache (Cross-session)

Device details are also saved to VS Code's global state (`globalState`) so they survive VS Code restarts. The persistent cache has two layers:

| Store | Key | Contents |
|---|---|---|
| `lastSeenDevicesByNetwork` | A hash of the current network interfaces | A list of device IDs seen on that network, plus a `lastSeen` timestamp. |
| `deviceCache` | Device ID | Full device info (`location`, `ip`, `id`, `deviceInfo`) for each device. |

#### Network Scoping

The cache is scoped to a **network hash** – an MD5 hash of the non-loopback IP addresses and subnet masks of all local network interfaces. This means:

- Devices from your home network will not show up when you connect to your office network.
- Switching between networks automatically loads the device list for that network.
- Old network entries are automatically expired after **30 days** of not being seen.

#### On Startup

When VS Code starts (or when a network change is detected), the extension:

1. Computes the network hash for the current interfaces.
2. Loads any device IDs associated with that hash from `lastSeenDevicesByNetwork`.
3. For each device ID, fetches the cached device info from `deviceCache` and adds it to the in-memory list with `deviceState: 'pending'`.
4. Emits a `devices-changed` event so the UI immediately shows cached devices (greyed out as _pending_).

Health checks happen lazily – a device only transitions from `pending` to `online` or `offline` when the UI requests an actual health check (e.g., when the user opens the Device Picker or the Devices Panel runs `refresh()`).

### Short-lived Device Info Cache

During a scan, multiple SSDP responses and health checks may arrive for the same IP address within a very short window. To avoid hammering devices with redundant HTTP requests to `/query/device-info`, the extension keeps a **short-lived in-memory cache** with a 5-second TTL. After 10 seconds of inactivity, this cache is automatically cleared.

---

## Network Change Monitor

The `NetworkChangeMonitor` polls the host machine's network interfaces every **3 minutes** to detect changes (e.g., connecting to a new Wi-Fi network or VPN).

When a change is detected:

1. The network hash is recomputed.
2. The short-lived device info cache is cleared.
3. The persistent device list for the new network is loaded.
4. `setScanNeeded()` is called to queue a scan for the next user interaction.

The monitor is paused when the VS Code window loses focus (to avoid unnecessary polling) and resumes when focus is regained.

---

## Sleep / Wake Tracking

The `SystemSleepMonitor` detects system sleep/wake transitions by scheduling a 1-minute recurring timer and checking whether the timer fires significantly later than expected. If the gap between scheduled and actual execution exceeds **2 minutes**, the system is presumed to have been asleep.

On wake detection:

- `setScanNeeded()` is called to queue a fresh network scan.
- The scan runs the next time the user opens the Device Picker or the Devices Panel becomes visible.

The sleep monitor runs continuously whenever device discovery is enabled, independent of VS Code window focus.

---

## How Scan Progress Works

A scan has two phases that must both complete before the scan is considered finished:

1. **Minimum duration (3 seconds):** The scan runs for at least 3 seconds to give slow devices time to respond.
2. **Settle period (1.5 seconds):** After the last device response is received, the extension waits 1.5 seconds for any stragglers. Each new device response resets this timer.

The scan is considered done only when **both** timers have expired. While scanning:

- The Devices Panel shows a progress indicator.
- The Device Picker shows a spinner.

---

## Passive SSDP Listening

In addition to active M-SEARCH scans, the extension listens for unsolicited SSDP announcements from Roku devices on the network:

- **`ssdp:alive`** – A Roku device announced itself. The extension fetches its device info and adds it to the list.
- **`ssdp:byebye`** – A Roku device is going offline. The extension removes it from the list immediately.

This passive listening means devices that power on while VS Code is running will appear automatically, without waiting for the next active scan.

---

## Disabling Device Discovery

### Via Settings

Set `brightscript.deviceDiscovery.enabled` to `false` in your VS Code settings:

```json
"brightscript.deviceDiscovery.enabled": false
```

When disabled:

- No SSDP broadcasts are sent.
- The passive SSDP listener is stopped.
- The Network Change Monitor and System Sleep Monitor are stopped.
- The Devices Panel will show no devices.
- The Device Picker will not discover any new devices; you must enter IP addresses manually.

You can re-enable discovery at any time by setting the option back to `true` – monitoring will resume immediately.

---

## Configuration Reference

All settings are in the `brightscript.deviceDiscovery` namespace and can be set in VS Code's **Settings** UI or `settings.json`.

| Setting | Default | Description |
|---|---|---|
| `brightscript.deviceDiscovery.enabled` | `true` | Enables automatic network scanning and passive SSDP listening for Roku devices. Disable this if you always use a fixed IP address or want no network activity from the extension. |
| `brightscript.deviceDiscovery.showInfoMessages` | `true` | When `true`, a toast notification appears each time a new Roku device is discovered on the network. |
| `brightscript.deviceDiscovery.includeNonDeveloperDevices` | `false` | When `true`, the extension includes Roku devices that do **not** have Developer Mode enabled. By default only developer-enabled devices are shown. |
| `brightscript.deviceDiscovery.concealDeviceInfo` | `false` | When `true`, unique device identifiers (`udn`, `device-id`, `advertising-id`, `wifi-mac`, `ethernet-mac`, `serial-number`, `keyed-developer-id`) are randomised in the UI – useful for screenshots and demos. |

---

## Common Scenarios

### Picking a Device After Launching VS Code

1. VS Code starts and loads any previously seen devices for the current network as `pending`.
2. You open the **Device Picker** (e.g., via `${promptForHost}` in your `launch.json`, or the **Select Device** command).
3. `refresh()` is called. If a scan is needed or the last scan was more than 30 minutes ago, an active SSDP scan begins.
4. While scanning, the picker shows existing (pending/online) devices immediately and a spinner indicates progress.
5. As devices respond, they appear in the list with an `online` state.
6. You select a device. The extension performs a quick health check. If the device is unreachable, an error is shown and the picker remains open.

### Discovering Devices After a Network Change

1. You connect to a new Wi-Fi network.
2. Within 3 minutes, the Network Change Monitor detects the change.
3. The device list is cleared and replaced with any cached devices for the new network (shown as `pending`).
4. `setScanNeeded()` is called.
5. The next time you open the Device Picker or the Devices Panel becomes visible, a fresh scan runs and populates the list.

### What to Expect When Discovery Is Disabled

- No automatic scanning occurs.
- The Devices Panel is empty (no previously seen devices are loaded).
- The Device Picker shows no discovered devices.
- You must enter device IP addresses manually (e.g., via the **Enter IP address** option in the picker, or by setting `host` directly in `launch.json`).
- No network traffic from the extension related to device discovery.

### Resuming After Sleep

1. Your computer wakes from sleep.
2. The System Sleep Monitor detects the gap in timer execution and calls `setScanNeeded()`.
3. When you next open the Device Picker or the Devices Panel becomes visible, a fresh scan is triggered automatically.
4. Devices that were online before sleep are shown as `pending` until the health check confirms they are still reachable.

---

## Performance Considerations and Known Limitations

- **Network traffic:** Each active scan sends UDP M-SEARCH packets to the local network broadcast address. These are small packets, but they do generate a small amount of traffic roughly every 30 minutes (or on demand). Passive SSDP listening generates no outgoing traffic.
- **Device info fetches:** For each discovered IP, the extension makes an HTTP GET request to `http://<ip>:8060/query/device-info`. The 5-second short-lived cache prevents duplicate requests when multiple SSDP responses arrive for the same device.
- **Health check cooldown:** Individual device health checks have a per-device cooldown of **5 minutes** to prevent repeatedly polling the same device. Forced refreshes (e.g., clicking the refresh button in the Devices Panel) bypass this cooldown.
- **Random delay:** A small random delay (400–1000 ms) is applied before updating device info after a scan response. This helps prevent thundering-herd problems when many devices respond simultaneously.
- **Multiple network interfaces:** The SSDP client explicitly binds to each discovered network interface (`explicitSocketBind: true`), which helps with multi-NIC systems and VPN setups.
- **VPN / corporate networks:** Roku devices discovered on one network will not appear when you are connected to a different network (e.g., VPN). Network-scoped caching ensures you only see devices relevant to your current network.
- **No IPv6 support:** The current implementation uses IPv4 SSDP only.
