# BrightScript Tasks

The BrightScript language extension provides a powerful task system that integrates seamlessly with VS Code's task runner. This allows you to automate common development workflows like building, testing, and linting from within your editor.

## Overview

BrightScript tasks support:
- Custom shell commands with variable substitution
- Interactive folder selection with glob patterns  
- Environment variable configuration
- Custom working directories
- Shell customization
- Problem matcher integration for error detection
- Background task support for watchers and dev servers

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

### `${folderForFile: <glob>}` - Interactive Folder Selection

The `${folderForFile: <glob>}` variable finds files matching a glob pattern and resolves to the directory containing those files. This is particularly useful in monorepos or multi-project workspaces.

#### Use Cases

##### 1. Build a Specific Project in a Monorepo

```json
{
    "type": "brightscript",
    "label": "Build Selected Project",
    "command": "cd ${folderForFile: **/bsconfig.json} && npx bsc"
}
```

When you run this task:
- If one `bsconfig.json` is found, it automatically uses that directory
- If multiple are found, you get a quick pick menu to select which project to build

##### 2. Format Code in Selected Project

```json
{
    "type": "brightscript",
    "label": "Format Code",
    "command": "cd ${folderForFile: **/bsconfig.json} && npx bsfmt --write ."
}
```

##### 3. Build and Copy to Staging

You can chain multiple commands together:

```json
{
    "type": "brightscript",
    "label": "Build and Stage",
    "command": "cd ${folderForFile: **/bsconfig.json} && npx bsc --copy-to-staging"
}
```

#### Glob Pattern Examples

| Pattern | Matches |
|---------|---------|
| `**/bsconfig.json` | Any `bsconfig.json` file at any depth |
| `**/tsconfig.json` | Any TypeScript config file at any depth |
| `apps/**/package.json` | `package.json` files under the `apps` directory |
| `*.config.js` | Config files in the root directory only |

**Note**: Files in `node_modules` are automatically excluded from glob pattern matching.

## Advanced Configuration

### Custom Environment Variables

Add environment variables that are available to your command:

```json
{
    "type": "brightscript",
    "label": "Build with Custom Env",
    "command": "npx bsc",
    "options": {
        "env": {
            "NODE_ENV": "production",
            "BSC_PROJECT_PATH": "./custom-path",
            "DEBUG": "true"
        }
    }
}
```

**Environment Variable Precedence** (highest to lowest):
1. Task-specific `options.env`
2. User settings `terminal.integrated.env.*`
3. System environment variables

### Custom Working Directory

Specify a working directory for the command:

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

### Custom Shell

Override the shell used to execute the command:

```json
{
    "type": "brightscript",
    "label": "Build with Bash",
    "command": "npx bsc",
    "options": {
        "shell": {
            "executable": "/bin/bash"
        }
    }
}
```

**Default Shells**:
- **Windows**: `cmd.exe` or PowerShell
- **macOS**: `/bin/zsh`
- **Linux**: `/bin/bash`

The task provider respects your `terminal.integrated.shell.*` settings from VS Code.

## Problem Matchers

Problem matchers parse command output to detect errors and warnings. BrightScript tasks support all standard VS Code problem matchers.

### BrighterScript Compiler Errors

```json
{
    "type": "brightscript",
    "label": "Compile BrighterScript",
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

Background tasks are useful for file watchers, development servers, or any long-running process.

### File Watcher Example

```json
{
    "type": "brightscript",
    "label": "Watch for Changes",
    "command": "npx bsc --watch",
    "isBackground": true,
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
        },
        "background": {
            "activeOnStart": true,
            "beginsPattern": "^Starting compilation",
            "endsPattern": "^(Compilation complete|Found \\d+ errors)"
        }
    }
}
```

## Integration with Launch Configurations

Use tasks as pre-launch actions to build or prepare your project before debugging:

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "brightscript",
            "name": "Launch on Roku",
            "request": "launch",
            "host": "${promptForHost}",
            "password": "${promptForPassword}",
            "rootDir": "${workspaceFolder}/out",
            "preLaunchTask": "Build Project"
        }
    ]
}
```

This will run your "Build Project" task before launching the debugger.

## Task Groups

Organize tasks into build and test groups:

### Build Task

```json
{
    "type": "brightscript",
    "label": "Build",
    "command": "npx bsc",
    "group": {
        "kind": "build",
        "isDefault": true
    },
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

Run with: `Tasks: Run Build Task` (Ctrl+Shift+B / Cmd+Shift+B)

### Test Task

```json
{
    "type": "brightscript",
    "label": "Validate",
    "command": "npx bsc --no-project-references",
    "group": {
        "kind": "test",
        "isDefault": true
    },
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

Run with: `Tasks: Run Test Task`

## Complete Examples

### Monorepo Workflow

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
            },
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
        },
        {
            "type": "brightscript",
            "label": "Test Selected Project",
            "command": "cd ${folderForFile: **/package.json} && npm test",
            "group": {
                "kind": "test",
                "isDefault": true
            }
        },
        {
            "type": "brightscript",
            "label": "Watch Selected Project",
            "command": "cd ${folderForFile: **/bsconfig.json} && npx bsc --watch",
            "isBackground": true,
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
                },
                "background": {
                    "activeOnStart": true,
                    "beginsPattern": "^Starting compilation",
                    "endsPattern": "^(Compilation complete|Found \\d+ errors)"
                }
            }
        }
    ]
}
```

### Production Build Pipeline

```json
{
    "version": "2.0.0",
    "tasks": [
        {
            "type": "brightscript",
            "label": "Clean",
            "command": "rm -rf out dist",
            "options": {
                "cwd": "${workspaceFolder}"
            }
        },
        {
            "type": "brightscript",
            "label": "Build Production",
            "command": "npx bsc --copy-to-staging",
            "options": {
                "env": {
                    "NODE_ENV": "production"
                }
            },
            "dependsOn": ["Clean"],
            "group": {
                "kind": "build",
                "isDefault": true
            },
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
        },
        {
            "type": "brightscript",
            "label": "Lint Code",
            "command": "npx eslint .",
            "dependsOn": ["Build Production"],
            "problemMatcher": "$eslint-stylish"
        }
    ]
}
```

### Testing and Code Quality

```json
{
    "version": "2.0.0",
    "tasks": [
        {
            "type": "brightscript",
            "label": "Validate Code",
            "command": "npx bsc --no-project-references",
            "group": {
                "kind": "test",
                "isDefault": true
            },
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
        },
        {
            "type": "brightscript",
            "label": "Format BrightScript Code",
            "command": "npx bsfmt --write .",
            "group": "test"
        },
        {
            "type": "brightscript",
            "label": "Compile and Format",
            "command": "npx bsc && npx bsfmt --write ."
        }
    ]
}
```

## Troubleshooting

### Task Not Found

Make sure:
- The `type` field is set to `"brightscript"`
- The `command` field is not empty
- Your `tasks.json` has valid JSON syntax

### Variable Not Resolving

If `${folderForFile}` isn't working:
- Check that files matching the glob pattern exist in your workspace
- Verify the glob pattern syntax
- Remember that `node_modules` is automatically excluded

### Command Not Executing

- Check the terminal output for error messages
- Verify the command works in a regular terminal
- Make sure the shell/executable exists on your system
- Check that required programs (npm, npx, etc.) are in your PATH

### Environment Variables Not Working

- Verify the variable names are correct (case-sensitive)
- Check that task options override user settings as expected
- Use `echo $VARIABLE_NAME` (or `echo %VARIABLE_NAME%` on Windows) in your command to debug

## Best Practices

1. **Use descriptive labels**: Make task names clear and specific
2. **Leverage problem matchers**: They provide instant feedback on errors
3. **Organize with groups**: Set default build and test tasks for quick access
4. **Chain tasks with dependsOn**: Create complex workflows from simple tasks
5. **Use variables for flexibility**: Especially in shared workspace configurations
6. **Document custom tasks**: Add comments in `tasks.json` to explain complex workflows

## See Also

- [VS Code Tasks Documentation](https://code.visualstudio.com/docs/editor/tasks)
- [BrightScript Language Features](./features.md)
- [Variable Substitutions](./variable-substitutions.md)
- [Debugging](./Debugging/)
