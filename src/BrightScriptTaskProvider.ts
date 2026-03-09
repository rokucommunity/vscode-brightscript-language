import * as vscode from 'vscode';
import * as path from 'path';
import * as childProcess from 'child_process';

export class BrightScriptTaskProvider implements vscode.Disposable {
    constructor() {
        this.taskProvider = vscode.tasks.registerTaskProvider('brightscript', {
            provideTasks: () => {
                console.log('provideTasks called');
                // Return empty array so all tasks go through resolveTask
                return [];
            },
            resolveTask: (_task: vscode.Task): vscode.Task | undefined => {
                return this.resolveTask(_task);
            }
        });
    }

    private taskProvider: vscode.Disposable;

    private resolveTask(_task: vscode.Task): vscode.Task | undefined {
        console.log('resolveTask called for task:', _task.definition);
        console.log('Task problem matchers:', _task.problemMatchers);
        console.log('Task isBackground:', _task.isBackground);

        const command: string = _task.definition.command;

        // A BrightScript task consists of a task definition
        // Make sure that this looks like a BrightScript task by checking that there is a command.
        if (!command) {
            return undefined;
        }

        // resolveTask requires that the same definition object be used.
        const definition: BrightscriptTaskDefinition = <any>_task.definition;

        // Use CustomExecution to defer variable resolution until the task actually runs
        // This prevents showing pickers when VS Code is just validating tasks.json or displaying tasks in the UI
        const execution = new vscode.CustomExecution((): Promise<vscode.Pseudoterminal> => {
            return this.createPseudoterminal(command, definition);
        });

        const task = new vscode.Task(
            definition,
            _task.scope ?? vscode.TaskScope.Workspace,
            _task.name,
            'brightscript',
            execution
        );

        // Copy over other properties from the original task
        // For CustomExecution, problemMatchers must be set BEFORE isBackground for proper handling
        if (_task.problemMatchers && _task.problemMatchers.length > 0) {
            task.problemMatchers = _task.problemMatchers;
        }
        task.isBackground = _task.isBackground;
        task.presentationOptions = _task.presentationOptions;
        task.group = _task.group;
        task.runOptions = _task.runOptions;

        console.log('Resolved task problem matchers:', task.problemMatchers);
        console.log('Resolved task isBackground:', task.isBackground);

        return task;
    }

    /**
     * Create a pseudoterminal that resolves variables and executes the command
     * This is called only when the task actually runs, not during validation
     */
    private createPseudoterminal(command: string, taskDefinition: BrightscriptTaskDefinition): Promise<vscode.Pseudoterminal> {
        const writeEmitter = new vscode.EventEmitter<string>();
        const closeEmitter = new vscode.EventEmitter<number>();
        let currentProcess: childProcess.ChildProcess | undefined;

        const pty: vscode.Pseudoterminal = {
            onDidWrite: writeEmitter.event,
            onDidClose: closeEmitter.event,
            open: () => {
                // Resolve variables only when the task actually starts
                // Handle the promise without making open() async
                this.resolveFolderForFileVariable(command).then((resolvedCommand) => {
                    // If command is undefined/null after processing, the user cancelled a selection
                    if (!resolvedCommand) {
                        writeEmitter.fire('Task cancelled by user\r\n');
                        closeEmitter.fire(1);
                        return;
                    }

                    // Execute the resolved command in a shell
                    // Merge user settings with task-specific options (task options take precedence)
                    const shellConfig = this.getShellConfiguration();
                    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                    const taskOptions = taskDefinition.options || {};

                    // Determine final shell (task option > user setting)
                    const shell = taskOptions.shell?.executable || shellConfig.shell;

                    // Merge environment variables (process.env < user settings < task options)
                    const mergedEnv = {
                        ...process.env,
                        ...shellConfig.env,
                        ...taskOptions.env
                    };

                    // Determine working directory (task option > workspace folder)
                    const cwd = taskOptions.cwd || workspaceFolder?.uri.fsPath;

                    currentProcess = childProcess.spawn(resolvedCommand, [], {
                        shell: shell,
                        env: mergedEnv,
                        cwd: cwd
                    });

                    currentProcess.stdout?.on('data', (data: Buffer) => {
                        // Pass through output as-is for problem matchers to parse correctly
                        writeEmitter.fire(data.toString());
                    });

                    currentProcess.stderr?.on('data', (data: Buffer) => {
                        // Pass through output as-is for problem matchers to parse correctly
                        writeEmitter.fire(data.toString());
                    });

                    currentProcess.on('exit', (code) => {
                        closeEmitter.fire(code ?? 0);
                    });

                    currentProcess.on('error', (error) => {
                        writeEmitter.fire(`Error executing command: ${error.message}\r\n`);
                        closeEmitter.fire(1);
                    });
                }).catch((error) => {
                    writeEmitter.fire(`Error resolving command: ${error}\r\n`);
                    closeEmitter.fire(1);
                });
            },
            close: () => {
                // Kill the process if it's still running
                if (currentProcess && !currentProcess.killed) {
                    currentProcess.kill();
                }
                writeEmitter.dispose();
                closeEmitter.dispose();
            }
        };

        return Promise.resolve(pty);
    }

    /**
     * Get the shell configuration from user settings
     */
    private getShellConfiguration(): { shell: string | boolean; env: NodeJS.ProcessEnv } {
        const config = vscode.workspace.getConfiguration('terminal.integrated');
        const platform = process.platform;

        let shell: string | boolean;
        let env: NodeJS.ProcessEnv = {};

        // Get shell configuration for the current platform
        if (platform === 'win32') {
            // On Windows, use true to let Node.js choose the shell (cmd.exe or PowerShell)
            shell = config.get<string>('shell.windows') || true;
            env = config.get<NodeJS.ProcessEnv>('env.windows') || {};
        } else if (platform === 'darwin') {
            // On macOS, default to zsh (macOS default since Catalina)
            shell = config.get<string>('shell.osx') || '/bin/zsh';
            env = config.get<NodeJS.ProcessEnv>('env.osx') || {};
        } else {
            // On Linux, default to bash
            shell = config.get<string>('shell.linux') || '/bin/bash';
            env = config.get<NodeJS.ProcessEnv>('env.linux') || {};
        }

        return { shell: shell, env: env };
    }

    /**
     * Resolve ${folderForFile: <glob>} variable in the command by finding files matching the glob pattern
     */
    private async resolveFolderForFileVariable(command: string): Promise<string | undefined> {
        const folderForFileRegex = /\$\{folderForFile:\s*([^}]+)\}/g;
        const matches = [...command.matchAll(folderForFileRegex)];

        if (matches.length === 0) {
            return command;
        }

        // Group matches by glob pattern to avoid duplicate selections
        const uniquePatterns = new Map<string, string[]>();
        for (const match of matches) {
            const fullMatch = match[0];
            const globPattern = match[1].trim();

            if (!uniquePatterns.has(globPattern)) {
                uniquePatterns.set(globPattern, []);
            }
            uniquePatterns.get(globPattern).push(fullMatch);
        }

        let resolvedCommand = command;

        // Process each unique glob pattern once
        for (const [globPattern, fullMatches] of uniquePatterns) {
            let excludePatterns = ['**/node_modules/**'];
            // Find files matching the glob pattern
            const files = await vscode.workspace.findFiles(globPattern, `{${excludePatterns.join(',')}}`);

            if (files.length === 0) {
                void vscode.window.showWarningMessage(`No files found matching pattern: ${globPattern}`);
                return undefined;
            }

            // Get unique folder paths
            const folders = new Map<string, vscode.Uri>();
            for (const file of files) {
                const folderPath = path.dirname(file.fsPath);
                folders.set(folderPath, file);
            }

            const folderPaths = Array.from(folders.keys());
            let selectedFolderPath: string;

            if (folderPaths.length >= 1) {
                // Multiple folders found, let user pick
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                const relativeFolders = folderPaths.map(folderPath => {
                    if (workspaceFolder) {
                        const rel = path.relative(workspaceFolder.uri.fsPath, folderPath);
                        return rel || '.';
                    }
                    return folderPath;
                });

                const selectedRelativePath = await vscode.window.showQuickPick(relativeFolders, {
                    placeHolder: `Choose folder for ${globPattern}`
                });

                if (!selectedRelativePath) {
                    // User cancelled the selection
                    return undefined;
                }

                const index = relativeFolders.indexOf(selectedRelativePath);
                selectedFolderPath = folderPaths[index];
            }

            // Replace all occurrences of this glob pattern with the selected folder path
            for (const fullMatch of fullMatches) {
                resolvedCommand = resolvedCommand.replace(fullMatch, selectedFolderPath);
            }
        }

        return resolvedCommand;
    }

    public dispose() {
        this.taskProvider.dispose();
    }
}

interface BrightscriptTaskDefinition extends vscode.TaskDefinition {
    /**
     * The command to run
     */
    command: string;
}
