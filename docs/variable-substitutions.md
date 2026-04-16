# Variable Substitutions

BrightScript extension supports variable substitutions in launch.json configurations to make your debugging workflow more flexible and dynamic.

## Overview

Variable substitutions allow you to avoid hardcoding values in your launch configurations. Instead of specifying static IP addresses or passwords, you can use variables that are resolved at runtime.

## Available Variable Substitutions

| Variable | Description | Behavior |
|----------|-------------|----------|
| `${promptForHost}` | Prompts you to enter or select a host IP address | Shows input dialog or device picker when debugging starts |
| `${promptForPassword}` | Prompts you to enter the device password | Shows password input dialog when debugging starts |
| `${activeHost}` | Uses the currently active device | Automatically uses pre-configured device, or prompts if none set |
| `${activeHostPassword}` | Uses the password for the currently active device | Automatically uses device-specific password, or falls back to global password |
| `${host}` | References the resolved host value | Can be used in other fields like `deepLinkUrl` |

## `${promptForHost}` - Interactive Host Selection

The most common variable substitution. When used, VS Code will:
- Show a list of discovered Roku devices (if device discovery is enabled)
- Allow manual IP entry
- Remember the last used device

```json
{
    "host": "${promptForHost}"
}
```

## `${promptForPassword}` - Interactive Password Entry

Prompts for the developer password when debugging starts:

```json
{
    "password": "${promptForPassword}"
}
```

## `${activeHost}` - Smart Device Selection

**New!** Uses the currently active device without prompting, but gracefully falls back to prompting if no device is set. This provides the best of both worlds: convenience when you have a preferred device, flexibility when you don't.

### Basic Usage

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "brightscript",
            "name": "Launch with Current Device",
            "request": "launch",
            "host": "${activeHost}",
            "password": "${promptForPassword}",
            "rootDir": "${workspaceFolder}",
            "files": [
                "manifest",
                "source/**/*.*",
                "components/**/*.*",
                "images/**/*.*"
            ]
        }
    ]
}
```

### Requirements

To use `${activeHost}` optimally, you should set an active device using one of these methods:

1. **Via Command Palette:**
   - Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
   - Type "BrightScript: Set Active Device"
   - Enter the IP address of your Roku device

2. **Via Device List:**
   - Use the Roku Devices view in the sidebar to select a device (if device discovery is enabled)

3. **Via Debugging Session:**
   - The active device is automatically set when you start a debugging session with `${promptForHost}`

### Fallback Handling

If you use `${activeHost}` but no active device is set, it will automatically fallback to prompting for host selection (same behavior as `${promptForHost}`).

This provides a seamless experience:
- **When active device is set**: Uses it automatically without prompting
- **When no active device**: Falls back to the device picker/input dialog

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
            "host": "${activeHost}",
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
