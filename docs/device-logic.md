# How Devices Are Discovered, Tracked, and Refreshed

This document describes how the extension finds Roku devices on your network, keeps track of which ones are still reachable, and decides when to refresh that information. It serves two audiences:

- **The team building the extension** — as the design spec for the device-management system.
- **Users of the extension** — to explain *why* devices appear, disappear, or take a moment to show up, so the behavior feels intentional rather than mysterious.

There are two kinds of devices: **configured devices** added by the user in settings, and **discovered devices** found automatically via SSDP broadcasts on the local network. Both flow through the same machinery described below.

---

## Why it's built this way

A naive implementation would constantly broadcast on the network and constantly hit every device with `device-info` calls to keep its list accurate. That works, but it's expensive in ways that matter:

- **SSDP broadcasts are noisy.** They touch every device on the local network, not just Rokus. Doing them on a tight interval is wasteful and unfriendly to everything else sharing the network — especially on corporate or shared Wi-Fi.
- **`device-info` calls are noisy too.** Each one is an HTTP request to a Roku. Doing them constantly, for every known device, every few seconds, eats bandwidth and CPU on devices that may already be doing something else (running an app, streaming, being developed against).
- **Most of the time, nothing has changed.** A device the user saw five minutes ago is almost certainly still there at the same IP. Re-asking constantly is busywork.

So the system is built around three principles:

1. **On demand, not on a schedule.** Work happens when the user is actually looking — when a view opens, when they click refresh, when they expand a tree node. If no UI is visible, no network traffic happens. Orders queue up and run the next time a view appears.
2. **Cache first, refresh in the background.** When the UI asks for a device, we return whatever we have immediately — even if it's stale, even if it's just `{ip, serial}` from an SSDP packet. Fresh data is fetched in the background and pushed to the view when it arrives. The user is never blocked waiting on a network call.
3. **Occasional sync to catch drift.** A few well-chosen triggers (startup, wake from sleep, network change, user-initiated refresh) reconcile the cache against reality. Between those, we trust the cache.

The result: most of the time, your devices are *just there* with no network chatter. When something significant happens — you change networks, you wake your laptop, you click refresh — the system does a focused burst of work and then goes quiet again.

---

## Big picture

Three moving parts:

1. **[Orders](#orders)** — units of work the system wants done. Two kinds: `broadcast` (find new devices) and `reconcile` (verify known ones).
2. **[Views](#views)** — the UI surfaces (quick pick, tree view). Views are the *gate*: orders only run while a view is visible, otherwise they queue.
3. **[The cache](#data-freshness)** — when someone asks for devices, we return the cached copies immediately and refresh them in the background.

The rest of this doc explains [when orders get submitted](#when-are-orders-submitted), [what triggers them](#entry-points), and [how each view behaves](#views).

---

## Orders

The system runs on **orders**. Anything that wants work done submits an order. Orders only execute when a view is actually visible. If no view is open, the order is queued and runs the next time a view appears.

Two kinds:
- **`broadcast`** — send an SSDP `M-SEARCH` to find devices on the network
- **`reconcile`** — health-check every known device, drop the ones that don't respond

Views are the consumers. They monitor for orders and fulfill them on open / while visible.

---

## When are orders submitted?

### `broadcast` orders
A broadcast order sends an SSDP `M-SEARCH` request out to the local network (targeting `roku:ecp`) and listens for replies. Devices that respond are folded into the list (new ones get added, existing ones get re-confirmed).

This is the *active* side of SSDP. The extension also continuously listens *passively* for unsolicited announcements (see below) — those don't require an order.

Submitted when:
- startup (`reason: 'startup'`)
- network changed (`reason: 'network'`)
- wake from sleep (`reason: 'sleep'`)
- user clicks refresh in the UI (`reason: 'refresh-clicked'`)
- a discovered device fails a health check, outside the current broadcast flow (`reason: 'unhealthy-device'`)
- quick pick has been open 7s without a broadcast happening (`reason: 'stale'`)
- "it's been a while" timer fires (`reason: 'stale'`)

Emit shape:
```ts
this.emitEvent('broadcast-ordered', {
  reason: 'startup' | 'network' | 'sleep' | 'refresh-clicked' | 'unhealthy-device' | 'stale'
})
```

Every emission carries a reason. Views decide which reasons they want to act on — see [Views](#views) below.

### `reconcile` orders
A reconcile order health-checks every known device. Devices that don't respond change state:
- **discovered devices** are removed from the list (we have no reason to keep them around)
- **configured devices** stay in the list but are marked `offline` (the user told us they exist; we just can't reach them right now)

Submitted when:
- startup (`reason: 'startup'`)
- network changed (`reason: 'network'`)
- wake from sleep (`reason: 'sleep'`)
- user clicks refresh in the UI (`reason: 'refresh-clicked'`)
- configured device changed (`reason: 'config-changed'`)
- 5-minute timer fires (`reason: 'stale'`)

Emit shape:
```ts
this.emitEvent('reconcile-ordered', {
  reason: 'startup' | 'network' | 'sleep' | 'refresh-clicked' | 'config-changed' | 'stale'
})
```

Same as broadcast: every emission carries a reason and views opt in.

---

## When do we health-check a single device?

Separate from reconcile orders (which sweep *all* devices), individual devices get health-checked in a few specific situations:

- **A device responds to an `M-SEARCH`** — broadcasts only run while a view is visible, so we know someone's looking. Hydrate it immediately.
- **The user clicks / expands a device in a view** — explicit engagement with that specific device.
- **A view asks for a device that has no cached `deviceInfo`** — see below.

### Clicking refresh

Clicking **refresh** in a view is an explicit "I want fresh data now" signal. It always submits a `broadcast` order and a `reconcile` order, regardless of how recently either ran.

### Lazy hydration on read

This is the catch-all that handles `ssdp:alive` (and any other case where a device ends up in the list without fresh `deviceInfo`).

When a view calls `.getAllDevices()` (or asks for a single device):

1. We return immediately with whatever we have. Devices without cached `deviceInfo` come back as the bare entry — `{ip, serial}` only, state `unknown`.
2. In the background, we queue a device-info call for any device matching either condition:
   - state `unknown` AND no cached `deviceInfo`, or
   - cached `deviceInfo` is older than **8 hours** (regardless of state)
3. As each call returns, the device transitions out of `unknown` (or just refreshes its cache, if it was already `online`/`offline`):
   - success → `online`, cache updated
   - failure → discovered devices are removed; configured devices become `offline`
4. Emit `devices-changed`. Subscribed views re-read and re-render with the fresh data.

The view never blocks on a network call. Devices appear instantly (even if minimal or stale), and fill in as data arrives.

This is what makes `ssdp:alive` "just work" — when an announcement arrives, the device is added in state `unknown`. Nothing happens to it until a view actually reads the list. If a view *is* open, that read triggers the lazy hydration and the device fills in. If no view is open, the device sits in the list cheaply until something asks for it.

---

## Entry points

### Passive SSDP announcements
Independent of broadcast orders, the extension always listens for unsolicited SSDP messages from Roku devices on the network:

- **`ssdp:alive`** — a Roku is announcing itself.
  - Add it to the list as `{ip, serial}` in state `unknown`
  - Emit `device-list-changed`
  - We do *not* device-info it eagerly. If a view is open and reads the list, [lazy hydration](#lazy-hydration-on-read) fills it in. If no view is open, it sits in the list cheaply until something asks for it.
- **`ssdp:byebye`** — a Roku is going offline.
  - Discovered devices are removed immediately (no health check needed — the device just said so itself)
  - Configured devices are marked `offline` but stay in the list
  - Emit `device-list-changed`

This is how devices that power on or off *while a view is already open* show up or disappear without waiting for the next broadcast.

### Startup
- Load configured devices
- Load last-seen discovered devices from cache
- Submit `broadcast` + `reconcile` orders (queued if no view visible)

### Wake from sleep
- Submit `broadcast` + `reconcile` orders (queued if no view visible)

We detect sleep by watching for a long gap in a low-frequency timer: if the timer fires significantly later than expected, the machine was almost certainly asleep. This runs regardless of whether VS Code has focus, so a wake is noticed even if the editor was in the background.

### Network change
- Append cached "last seen discovered devices" for the new network into `discoveredDevices`
- Submit `broadcast` + `reconcile` orders (queued if no view visible)
- Devices that no longer respond fall off when the reconcile runs

We detect network changes by periodically checking the machine's network interfaces and noticing when the set of addresses changes (new Wi-Fi, plugged in Ethernet, VPN up/down). To stay quiet while the user isn't actively using the editor, this check pauses when VS Code loses focus and resumes when it gains focus again — so a network change you make on a different app gets picked up the moment you come back.

### User clicks refresh
- Submits a `broadcast` order and a `reconcile` order
- Discovered devices that don't respond are dropped by the reconcile
- New devices found by the broadcast are immediately device-info'd

---

## De-dupe rule

Within a single refresh flow, a device only gets device-info'd once — first one in wins. (Prevents the broadcast response and the reconcile from racing each other on the same device.)

---

## Views

Views are the gate that lets orders run. They also submit their own orders based on interaction.

Each view declares which reasons it cares about — separately for orders queued while the view was closed (consumed on open) and live events fired while the view is visible. The general rule of thumb: `stale` is treated cautiously — a clock-driven "things might be old" signal shouldn't make a view that's been quietly sitting there suddenly hammer the network.

### Quick pick
- On open: fulfills pending `broadcast` orders and pending `reconcile` orders for **any reason except `stale`**
- While visible: fulfills `broadcast` and `reconcile` events for **any reason except `stale`**
- If open >7s without a broadcast: submits one
- Clicking an item: health-checks that one device
- Calls `.getDevices()`; re-calls on `device-list-changed`

### Tree view
- On open: fulfills pending `broadcast` AND `reconcile` orders for **any reason**
- While visible: fulfills `broadcast` and `reconcile` events for **any reason except `stale`**
- Expanding an item: health-checks that device
- Calls `.getDeviceList()`; re-calls on `device-list-changed`

---

## Data freshness

Whatever info we have, we'll give you. If a device has only been seen via SSDP, you get `{ip, serial}`. If it's been device-info'd before, you get the full cached payload. Either way, you get it immediately — no waiting on a network call.

In the background, we refresh stale entries and push updates as fresh data arrives. The view's job is to display what it has now and re-render when an update comes in. See [Lazy hydration on read](#lazy-hydration-on-read) for the exact mechanism.

---

## Device states

Every device in the list is in one of four states:

- **`unknown`** — the device has been added to the list but we haven't tried to talk to it yet. This is the entry state for everything: cache restored at startup, configured device just loaded, `ssdp:alive` just received.
- **`pending`** — a health check is currently in flight against this device. Transient state — it exits as soon as the health check returns.
- **`online`** — last health check succeeded. The device is reachable and ready to use.
- **`offline`** — last health check failed. Only configured devices reach this state; discovered devices that fail are removed entirely.

The lifecycle is `unknown` → `pending` (when a health check starts) → `online` or `offline` (when it finishes). Devices can re-enter `pending` any time a fresh health check fires.

Views can use these states to show the user what's going on (e.g. greyed-out for `unknown`, spinner for `pending`, normal for `online`, dimmed/warning for `offline`).

---

## Network-scoped cache

The cache of seen devices is **scoped to the current network**. When you change networks (different Wi-Fi, plug into Ethernet, connect to VPN), the system loads the device list for *that* network and stashes the previous one.

The cache also **persists across VS Code restarts**. When the extension starts up, devices seen on the current network in previous sessions are loaded immediately as `unknown`, so the UI has something to show before any network traffic happens.

In practice:
- Devices from your home network don't appear when you're on the office network.
- Switching back to a previous network instantly restores its devices (as `unknown`, then health-checked).
- Reopening VS Code on a network you've used before shows the same devices right away.
- This is why the network-change entry point is important — it's not just "scan again," it's "swap the active list."

---

## Disabling discovery

Users can turn the whole automatic-discovery system off in settings. When discovery is disabled:

- No SSDP broadcasts are sent.
- The passive listener for `ssdp:alive` / `ssdp:byebye` stops.
- Network-change and sleep-wake monitoring stop.
- The "device online" popup no longer appears
- Only **configured devices** appear in the UI.

This is the escape hatch for users on locked-down networks, users who only use a single fixed IP, or anyone who doesn't want the extension making *any* network calls it doesn't have to. See [device-discovery.md](./device-discovery.md) for the exact setting.
