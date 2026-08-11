---
name: mdns-scan
description: Discover and inspect devices on the local network via mDNS / DNS-SD (Bonjour) scanning. Use when the user wants to find Roku devices, AirPlay/Chromecast targets, printers, or any mDNS responder on the LAN; enumerate the service types a device advertises; read a device's TXT metadata (model, serial, firmware); or debug device discovery. Zero-dependency raw scanner, runs with plain node.
---

# Scan the local network for mDNS / DNS-SD devices

This skill runs a self-contained mDNS scanner (`mdns-scan.js`, raw UDP sockets, no dependencies) that enumerates every service type advertised on the local link, resolves each device's instance name, host, IP, port, and TXT metadata, and highlights the responders matching a filter term.

Roku devices in particular advertise over mDNS: they carry `integrator=Roku` in their TXT records and use their serial number as the `.local` hostname (e.g. `X01300A3Y71Y.local`), which matches the SSDP USN serial one-to-one.

## Step 1 — Gather parameters

Only ask if the request is ambiguous; otherwise use the defaults.

- **Filter term** (`--filter`, default `roku`) — highlights responders whose service types, instance names, hostnames, or TXT records contain this substring. Examples: `chromecast`, `airplay`, `printer`, `_matter`.
- **Listen duration** (`--seconds`, default `8`) — mDNS is lossy and responders rate-limit, so for a thorough sweep use `15`–`20`. See the reliability note below.
- **Active vs passive** (`--passive`) — active (default) sends queries to prompt responses; passive sends nothing and only reports what devices broadcast on their own.

## Step 2 — Run the scan

mDNS needs real multicast/LAN access, which the sandbox blocks, so run with the sandbox disabled:

```bash
node .claude/skills/mdns-scan/mdns-scan.js --seconds=15 --all
```

Common variations:
- Find Rokus specifically: `node .claude/skills/mdns-scan/mdns-scan.js --seconds=15`
- Inspect everything on the network: add `--all`
- Find a different device class: `--filter=chromecast --all`
- See every raw record as it arrives: `--verbose`
- Listen-only (no queries added to the network): `--passive --seconds=30`

When invoking via the Bash tool, set `dangerouslyDisableSandbox: true` for the run (multicast will not work sandboxed) and give it a timeout a few seconds longer than `--seconds`.

## Step 3 — Interpret the output

The scanner prints a per-responder summary: source IP, advertised service types, service instances, hostnames, IP addresses (v4 + v6), ports, and all TXT key/values. Responders matching the filter are tagged `<-- matches "<term>"`.

For Rokus, the useful fields are: TXT `integrator=Roku` (reliable identifier), `manufacturer` / `model`, `fv` (firmware), and the `.local` hostname (the ECP serial number).

## Reliability note

mDNS is best-effort UDP and responders suppress repeated answers, so results vary run to run — a device present one scan may be absent the next, especially over WiFi and when scanning repeatedly in quick succession. If a device you expect is missing, run again, raise `--seconds`, or wait a bit between runs. For finding Rokus reliably and quickly, SSDP (`roku:ecp`) is more dependable; mDNS is best as a supplementary source or for reading the richer TXT metadata SSDP does not provide.
