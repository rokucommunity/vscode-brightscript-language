# Variable Substitutions

BrightScript extension supports variable substitutions in launch.json configurations to make your debugging workflow more flexible and dynamic.

## Overview

Variable substitutions allow you to avoid hardcoding values in your launch configurations. Instead of specifying static IP addresses or passwords, you can use variables that are resolved at runtime.

## Available Variable Substitutions

| Variable | Description | Behavior |
|----------|-------------|----------|
| `${promptForHost}` | Resolves to the active device when set and reachable; otherwise opens the device picker | Uses the active device after a successful health check, or shows the picker when no active device is set or the health check fails |
| `${promptForPassword}` | Prompts you to enter the device password | Shows password input dialog when debugging starts |
| `${activeHost}` | **Deprecated.** Alias for `${promptForHost}` | Same behavior as `${promptForHost}` |
| `${activeHostPassword}` | Uses the password for the currently active device | Automatically uses device-specific password, or falls back to global password |
| `${host}` | References the resolved host value | Can be used in other fields like `deepLinkUrl` |

## `${promptForHost}` - Smart Host Selection

The most common variable substitution. Resolution order:

1. If an **active device** is set (e.g. via the Roku Devices view or the `Set Active Device` command) and it passes a health check, it is used automatically — no prompt.
2. Otherwise, VS Code shows the device picker, which:
   - Lists discovered Roku devices (if device discovery is enabled)
   - Allows manual IP entry
   - Remembers the last used device

```json
{
    "host": "${promptForHost}"
}
```

To set an active device:

- Open the Command Palette and run **BrightScript: Set Active Device**
- Or, in the Roku Devices view, expand a device and click **⭐ Set as Active Device**

## `${promptForPassword}` - Interactive Password Entry

Prompts for the developer password when debugging starts:

```json
{
    "password": "${promptForPassword}"
}
```

## `${activeHost}` - Deprecated

**Deprecated.** `${activeHost}` is now an alias for [`${promptForHost}`](#promptforhost---smart-host-selection) and is kept only for backwards compatibility. New configurations should prefer `${promptForHost}`, which now uses the active device automatically when set and reachable.

## `${activeHostPassword}` - Device-Specific Password

Uses the password stored for the currently active device. This allows different devices to have different developer passwords while maintaining the convenience of automatic password selection.

### Basic Usage

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Launch",
            "type": "brightscript",
            "request": "launch",
            "host": "${promptForHost}",
            "password": "${activeHostPassword}"
        }
    ]
}
```

### Setting Device Passwords

To use `${activeHostPassword}` effectively, you should set passwords for individual devices:

1. **Via Device List:**
   - Open the Roku Devices view in the sidebar
   - Expand a device to see its options
   - Click "🔑 Set Device Password" 
   - Enter the developer password for that specific device

### Fallback Handling

If you use `${activeHostPassword}` but no password is set for the active device, it will automatically fall back to the global password setting.

This provides flexibility:
- **When device-specific password is set**: Uses it automatically
- **When no device password**: Falls back to global password configuration
