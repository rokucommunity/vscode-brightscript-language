# BrightScript Tasks

The BrightScript language extension provides a task system that integrates with VS Code's task runner, allowing you to automate common development workflows like building, testing, and linting.

## Features

- Custom shell commands with variable substitution
- Interactive folder selection with glob patterns  
- Environment variables and custom working directories
- Problem matcher integration for error detection
- Background task support for watchers

## Basic Task Configuration

Tasks are defined in `.vscode/tasks.json` in your workspace. Here's a simple example:

```json
{
    "version": "2.0.0",
    "tasks": [
        {
            "type": "brightscript",
            "label": "Build Project",
            "command": "npx bsc"
        }
    ]
}
```

### Required Properties

- **type**: Must be `"brightscript"` to use the BrightScript task provider
- **label**: Display name shown in the task picker
- **command**: The shell command to execute

## Variable Substitution

BrightScript tasks support variable substitution in the `command` field. Variables are resolved before the command is executed.

### Supported Variables

| Variable | Description | Example Value |
|----------|-------------|---------------|
| **Workspace Variables** | | |
| `${workspaceFolder}` | Path of the workspace folder | `/Users/user/project` |
| `${workspaceFolderBasename}` | Name of the workspace folder | `project` |
| `${fileWorkspaceFolderBasename}` | Name of workspace folder containing active file | `my-app` |
| **File Variables** (require an active file) | | |
| `${file}` | Full path of the currently opened file | `/Users/user/project/src/main.brs` |
| `${fileWorkspaceFolder}` | Workspace folder of the currently opened file | `/Users/user/project` |
| `${relativeFile}` | Current file relative to workspace folder | `src/main.brs` |
| `${relativeFileDirname}` | Current file's directory relative to workspace | `src` |
| `${fileBasename}` | Current file's basename | `main.brs` |
| `${fileBasenameNoExtension}` | Current file's basename without extension | `main` |
| `${fileExtname}` | Current file's extension | `.brs` |
| `${fileDirname}` | Current file's directory path | `/Users/user/project/src` |
| `${fileDirnameBasename}` | Current file's directory name | `src` |
| **Editor Variables** (require an active editor) | | |
| `${lineNumber}` | Current line number in active file (1-based) | `42` |
| `${columnNumber}` | Current column number in active file (1-based) | `15` |
| `${selectedText}` | Currently selected text in active file | `function main()` |
| **System Variables** | | |
| `${userHome}` | User's home directory | `/Users/user` |
| `${cwd}` | Current working directory of VS Code | `/Users/user/project` |
| `${execPath}` | Path to VS Code executable | `/Applications/VSCode.app` |
| `${pathSeparator}` | OS-specific path separator | `/` (macOS/Linux) or `\` (Windows) |
| `${/}` | Shorthand for `${pathSeparator}` | `/` or `\` |
| **Custom Variables** | | |
| `${folderForFile: <glob>}` | Directory containing file(s) matching glob pattern | `/Users/user/project/apps/app1` |

### Using `${folderForFile: <glob>}`

The `${folderForFile: <glob>}` variable finds files matching a glob pattern and resolves to the directory containing those files. This is useful in monorepos or multi-project workspaces.

**Example: Build a specific project**

```json
{
    "type": "brightscript",
    "label": "Build Selected Project",
    "command": "cd ${folderForFile: **/bsconfig.json} && npx bsc"
}
```

When you run this task:
- If one `bsconfig.json` is found, it uses that directory automatically
- If multiple are found, you get a quick pick menu to select which project

**Common glob patterns:**

| Pattern | Matches |
|---------|---------|
| `**/bsconfig.json` | Any `bsconfig.json` file at any depth |
| `apps/**/package.json` | `package.json` files under the `apps` directory |
| `*.config.js` | Config files in the root directory only |

**Note**: Files in `node_modules` are automatically excluded.

## Advanced Configuration

### Environment Variables

Add environment variables available to your command:

```json
{
    "type": "brightscript",
    "label": "Build with Custom Env",
    "command": "npx bsc",
    "options": {
        "env": {
            "NODE_ENV": "production"
        }
    }
}
```

### Custom Working Directory

```json
{
    "type": "brightscript",
    "label": "Build from Subdirectory",
    "command": "npx bsc",
    "options": {
        "cwd": "${workspaceFolder}/apps/my-roku-app"
    }
}
```

## Problem Matchers

Problem matchers parse command output to detect errors and warnings. Here's a basic example for BrighterScript compiler output:

```json
{
    "type": "brightscript",
    "label": "Compile",
    "command": "npx bsc",
    "problemMatcher": {
        "owner": "brightscript",
        "fileLocation": "relative",
        "pattern": {
            "regexp": "^(.*)\\((\\d+),(\\d+)\\):\\s+(error|warning)\\s+(.*)$",
            "file": 1,
            "line": 2,
            "column": 3,
            "severity": 4,
            "message": 5
        }
    }
}
```

## Background Tasks

Background tasks are useful for file watchers or development servers:

```json
{
    "type": "brightscript",
    "label": "Watch",
    "command": "npx bsc --watch",
    "isBackground": true
}
```

## Pre-Launch Tasks

Use tasks as pre-launch actions to build your project before debugging:

```json
{
    "type": "brightscript",
    "name": "Launch on Roku",
    "request": "launch",
    "host": "${promptForHost}",
    "password": "${promptForPassword}",
    "preLaunchTask": "Build Project"
}
```

## Task Groups

Mark tasks as default build or test tasks for quick keyboard shortcuts:

**Build Task** (run with Ctrl+Shift+B / Cmd+Shift+B):

```json
{
    "type": "brightscript",
    "label": "Build",
    "command": "npx bsc",
    "group": {
        "kind": "build",
        "isDefault": true
    }
}
```

**Test Task**:

```json
{
    "type": "brightscript",
    "label": "Validate",
    "command": "npx bsc --no-project-references",
    "group": {
        "kind": "test",
        "isDefault": true
    }
}
```

## Complete Example

Here's a basic `tasks.json` for a monorepo workflow:

```json
{
    "version": "2.0.0",
    "tasks": [
        {
            "type": "brightscript",
            "label": "Build Selected Project",
            "command": "cd ${folderForFile: **/bsconfig.json} && npx bsc",
            "group": {
                "kind": "build",
                "isDefault": true
            }
        },
        {
            "type": "brightscript",
            "label": "Watch Selected Project",
            "command": "cd ${folderForFile: **/bsconfig.json} && npx bsc --watch",
            "isBackground": true
        }
    ]
}
```

## Troubleshooting

**Task not found:**
- Ensure `type` is set to `"brightscript"`
- Verify `tasks.json` has valid JSON syntax

**Variable not resolving:**
- Check that files matching the glob pattern exist
- Remember that `node_modules` is excluded

**Command not executing:**
- Check the terminal output for errors
- Verify the command works in a regular terminal
- Ensure required programs are in your PATH

## Best Practices

- Use descriptive task labels
- Add problem matchers for instant error feedback
- Set default build and test tasks for keyboard shortcuts
- Use the `${folderForFile}` variable for monorepo flexibility

## See Also

- [VS Code Tasks Documentation](https://code.visualstudio.com/docs/editor/tasks)
- [Variable Substitutions](./variable-substitutions.md)
