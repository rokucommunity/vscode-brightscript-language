import * as vscode from 'vscode';
import * as path from 'path';
import * as childProcess from 'child_process';
import * as os from 'os';

export class BrightScriptTaskProvider implements vscode.Disposable {
    constructor() {
        this.taskProvider = vscode.tasks.registerTaskProvider('brightscript', {
            provideTasks: () => {
                // Return empty array so all tasks go through resolveTask
                return [];
            },
            resolveTask: (_task: vscode.Task): vscode.Task | undefined => {
                return this.resolveTask(_task);
            }
        });
    }

    private taskProvider: vscode.Disposable;

    private resolveTask(task: vscode.Task): vscode.Task | undefined {
        const command: string = task.definition.command;

        // A BrightScript task consists of a task definition
        // Make sure that this looks like a BrightScript task by checking that there is a command.
        if (!command) {
            void vscode.window.showErrorMessage(`BrightScript task "${task.name}" is missing required "command" property in task definition`);
            return undefined;
        }

        // resolveTask requires that the same definition object be used.
        const definition: BrightscriptTaskDefinition = <any>task.definition;

        // Use CustomExecution to defer variable resolution until the task actually runs
        // This prevents showing pickers when VS Code is just validating tasks.json or displaying tasks in the UI
        const execution = new vscode.CustomExecution((): Promise<vscode.Pseudoterminal> => {
            return Promise.resolve(new BrightScriptPseudoterminal(command, definition, task.scope ?? vscode.TaskScope.Workspace));
        });

        const result = new vscode.Task(
            definition,
            task.scope ?? vscode.TaskScope.Workspace,
            task.name,
            'brightscript',
            execution
        );

        // Copy over other properties from the original task
        // For CustomExecution, problemMatchers must be set BEFORE isBackground for proper handling
        if (task.problemMatchers && task.problemMatchers.length > 0) {
            result.problemMatchers = task.problemMatchers;
        }
        result.isBackground = task.isBackground;
        result.presentationOptions = task.presentationOptions;
        result.group = task.group;
        result.runOptions = task.runOptions;

        return result;
    }

    public dispose() {
        this.taskProvider.dispose();
    }
}

export class BrightScriptPseudoterminal implements vscode.Pseudoterminal {
    private writeEmitter = new vscode.EventEmitter<string>();
    private closeEmitter = new vscode.EventEmitter<number>();
    private currentProcess: childProcess.ChildProcess | undefined;

    public onDidWrite = this.writeEmitter.event;
    public onDidClose = this.closeEmitter.event;

    constructor(
        private command: string,
        private taskDefinition: BrightscriptTaskDefinition,
        private taskScope: vscode.WorkspaceFolder | vscode.TaskScope
    ) { }

    public async open() {
        try {
            // Determine the workspace folder from the task scope (may show picker once)
            const workspaceFolder = await this.getWorkspaceFolderFromScope(this.taskScope);

            // If workspace folder selection was cancelled or no folders available, abort task
            if (!workspaceFolder) {
                this.write('Task cancelled: no workspace folder selected\n');
                this.exit(1);
                return;
            }

            // Resolve variables only when the task actually starts
            let resolvedCommand: string;
            try {
                resolvedCommand = await this.resolveCommandVariables(this.command, workspaceFolder);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.write(`Task failed: error resolving command variables: ${errorMessage}\n`);
                this.exit(1);
                return;
            }

            // Execute the resolved command in a shell
            // Merge user settings with task-specific options (task options take precedence)
            const shellConfig = this.getShellConfiguration();
            const taskOptions = this.taskDefinition.options || {};

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

            // Display the command being executed (similar to built-in tasks)
            const cwdDisplay = cwd ? ` in folder ${path.basename(cwd)}` : '';
            this.write(`> Executing task${cwdDisplay}: ${resolvedCommand}\n\n`);

            this.currentProcess = childProcess.spawn(resolvedCommand, [], {
                shell: shell,
                env: mergedEnv,
                cwd: cwd
            });

            this.currentProcess.stdout?.on('data', (data: Buffer) => {
                // Pass through output with normalized line endings for VS Code
                this.write(data.toString());
            });

            this.currentProcess.stderr?.on('data', (data: Buffer) => {
                // Pass through output with normalized line endings for VS Code
                this.write(data.toString());
            });

            this.currentProcess.on('exit', (code) => {
                this.exit(code ?? 0);
            });

            this.currentProcess.on('error', (error) => {
                this.write(`Error executing command: ${error.message}\n`);
                this.exit(1);
            });
        } catch (error) {
            this.write(`Error resolving command: ${error}\n`);
            this.exit(1);
        }
    }

    public close() {
        // Kill the process if it's still running
        if (this.currentProcess && !this.currentProcess.killed) {
            this.currentProcess.kill();
        }
        this.writeEmitter.dispose();
        this.closeEmitter.dispose();
    }

    /**
     * Normalize line endings to \r\n for VS Code pseudoterminal output
     * and write to the terminal.
     */
    private write(data: string) {
        this.writeEmitter.fire(data.replace(/\r?\n/g, '\r\n'));
    }

    private exit(code: number) {
        this.closeEmitter.fire(code);
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
     * Get the workspace folder from a task scope
     * If the scope is not a specific WorkspaceFolder and there are multiple workspace folders,
     * shows a picker for the user to select one.
     */
    private async getWorkspaceFolderFromScope(taskScope: vscode.WorkspaceFolder | vscode.TaskScope): Promise<vscode.WorkspaceFolder | undefined> {
        // If the scope is already a WorkspaceFolder, return it
        if (taskScope && typeof taskScope === 'object' && 'uri' in taskScope) {
            return taskScope;
        }

        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return undefined;
        }

        // If there's only one workspace folder, use it
        if (folders.length === 1) {
            return folders[0];
        }

        // Multiple workspace folders - let the user pick
        return vscode.window.showWorkspaceFolderPick();
    }

    private async resolveCommandVariables(command: string, workspaceFolder?: vscode.WorkspaceFolder): Promise<string> {
        // Supports ${folderForFile: <glob>}, ${workspaceFolder}, ${workspaceFolderBasename}, ${fileWorkspaceFolderBasename}
        let resolvedCommand = command;

        const variableResolvers = [
            this.resolveWorkspaceVariables.bind(this),
            this.resolveFileVariables.bind(this),
            this.resolveEditorVariables.bind(this),
            this.resolveSystemVariables.bind(this),
            this.resolveFolderForFileVariable.bind(this)
        ];

        for (const resolver of variableResolvers) {
            resolvedCommand = await resolver(resolvedCommand, workspaceFolder);
            if (!resolvedCommand) {
                // Safety check - should not happen since resolvers now throw errors instead of returning undefined
                throw new Error('Variable resolver returned undefined');
            }
        }

        return resolvedCommand;
    }

    /**
     * Resolve standard workspace variables: ${workspaceFolder}, ${workspaceFolderBasename}, ${fileWorkspaceFolderBasename}
     */
    private resolveWorkspaceVariables(command: string, workspaceFolder?: vscode.WorkspaceFolder): string {
        let resolvedCommand = command;

        // ${workspaceFolder} - the path of the workspace folder
        if (resolvedCommand.includes('${workspaceFolder}')) {
            if (!workspaceFolder) {
                throw new Error('Cannot resolve ${workspaceFolder}: no workspace folder available');
            }
            resolvedCommand = resolvedCommand.replace(/\$\{workspaceFolder\}/g, workspaceFolder.uri.fsPath);
        }

        // ${workspaceFolderBasename} - the basename of the workspace folder
        if (resolvedCommand.includes('${workspaceFolderBasename}')) {
            if (!workspaceFolder) {
                throw new Error('Cannot resolve ${workspaceFolderBasename}: no workspace folder available');
            }
            const basename = path.basename(workspaceFolder.uri.fsPath);
            resolvedCommand = resolvedCommand.replace(/\$\{workspaceFolderBasename\}/g, basename);
        }

        // ${fileWorkspaceFolderBasename} - the basename of the workspace folder containing the active file
        if (resolvedCommand.includes('${fileWorkspaceFolderBasename}')) {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                throw new Error('Cannot resolve ${fileWorkspaceFolderBasename}: no active file');
            }

            const fileWorkspaceFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
            if (!fileWorkspaceFolder) {
                throw new Error('Cannot resolve ${fileWorkspaceFolderBasename}: active file is not in a workspace folder');
            }

            const basename = path.basename(fileWorkspaceFolder.uri.fsPath);
            resolvedCommand = resolvedCommand.replace(/\$\{fileWorkspaceFolderBasename\}/g, basename);
        }

        return resolvedCommand;
    }

    /**
     * Resolve file-related variables: ${file}, ${fileWorkspaceFolder}, ${relativeFile}, ${relativeFileDirname},
     * ${fileBasename}, ${fileBasenameNoExtension}, ${fileExtname}, ${fileDirname}, ${fileDirnameBasename}
     */
    private resolveFileVariables(command: string, workspaceFolder?: vscode.WorkspaceFolder): string {
        let resolvedCommand = command;

        // Get active file if any file variable is present
        const needsActiveFile = /\$\{(file|fileWorkspaceFolder|relativeFile|relativeFileDirname|fileBasename|fileBasenameNoExtension|fileExtname|fileDirname|fileDirnameBasename)\}/.test(command);

        if (!needsActiveFile) {
            return resolvedCommand;
        }

        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            // Check if any file variable is actually used before throwing
            if (needsActiveFile) {
                throw new Error('Cannot resolve file variables: no active file');
            }
            return resolvedCommand;
        }

        const filePath = activeEditor.document.uri.fsPath;

        // ${file} - the current opened file
        if (resolvedCommand.includes('${file}')) {
            resolvedCommand = resolvedCommand.replace(/\$\{file\}/g, filePath);
        }

        // ${fileWorkspaceFolder} - the workspace folder of the current opened file
        if (resolvedCommand.includes('${fileWorkspaceFolder}')) {
            const fileWorkspaceFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
            if (!fileWorkspaceFolder) {
                throw new Error('Cannot resolve ${fileWorkspaceFolder}: active file is not in a workspace folder');
            }
            resolvedCommand = resolvedCommand.replace(/\$\{fileWorkspaceFolder\}/g, fileWorkspaceFolder.uri.fsPath);
        }

        // ${relativeFile} - the current opened file relative to workspaceFolder
        if (resolvedCommand.includes('${relativeFile}')) {
            const fileWorkspaceFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
            if (!fileWorkspaceFolder) {
                throw new Error('Cannot resolve ${relativeFile}: active file is not in a workspace folder');
            }
            const relativePath = path.relative(fileWorkspaceFolder.uri.fsPath, filePath);
            resolvedCommand = resolvedCommand.replace(/\$\{relativeFile\}/g, relativePath);
        }

        // ${relativeFileDirname} - the current opened file's dirname relative to workspaceFolder
        if (resolvedCommand.includes('${relativeFileDirname}')) {
            const fileWorkspaceFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
            if (!fileWorkspaceFolder) {
                throw new Error('Cannot resolve ${relativeFileDirname}: active file is not in a workspace folder');
            }
            const dirname = path.dirname(filePath);
            const relativePath = path.relative(fileWorkspaceFolder.uri.fsPath, dirname);
            resolvedCommand = resolvedCommand.replace(/\$\{relativeFileDirname\}/g, relativePath);
        }

        // ${fileBasename} - the current opened file's basename
        if (resolvedCommand.includes('${fileBasename}')) {
            const basename = path.basename(filePath);
            resolvedCommand = resolvedCommand.replace(/\$\{fileBasename\}/g, basename);
        }

        // ${fileBasenameNoExtension} - the current opened file's basename with no file extension
        if (resolvedCommand.includes('${fileBasenameNoExtension}')) {
            const basename = path.basename(filePath, path.extname(filePath));
            resolvedCommand = resolvedCommand.replace(/\$\{fileBasenameNoExtension\}/g, basename);
        }

        // ${fileExtname} - the current opened file's extension
        if (resolvedCommand.includes('${fileExtname}')) {
            const extname = path.extname(filePath);
            resolvedCommand = resolvedCommand.replace(/\$\{fileExtname\}/g, extname);
        }

        // ${fileDirname} - the current opened file's dirname
        if (resolvedCommand.includes('${fileDirname}')) {
            const dirname = path.dirname(filePath);
            resolvedCommand = resolvedCommand.replace(/\$\{fileDirname\}/g, dirname);
        }

        // ${fileDirnameBasename} - the current opened file's folder name
        if (resolvedCommand.includes('${fileDirnameBasename}')) {
            const dirname = path.dirname(filePath);
            const basename = path.basename(dirname);
            resolvedCommand = resolvedCommand.replace(/\$\{fileDirnameBasename\}/g, basename);
        }

        return resolvedCommand;
    }

    /**
     * Resolve editor selection variables: ${lineNumber}, ${columnNumber}, ${selectedText}
     */
    private resolveEditorVariables(command: string, workspaceFolder?: vscode.WorkspaceFolder): string {
        let resolvedCommand = command;

        // Get active editor if any editor variable is present
        const needsActiveEditor = /\$\{(lineNumber|columnNumber|selectedText)\}/.test(command);

        if (!needsActiveEditor) {
            return resolvedCommand;
        }

        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            throw new Error('Cannot resolve editor variables: no active editor');
        }

        // ${lineNumber} - the current selected line number in the active file (1-based)
        if (resolvedCommand.includes('${lineNumber}')) {
            const lineNumber = activeEditor.selection.active.line + 1;
            resolvedCommand = resolvedCommand.replace(/\$\{lineNumber\}/g, lineNumber.toString());
        }

        // ${columnNumber} - the current selected column number in the active file (1-based)
        if (resolvedCommand.includes('${columnNumber}')) {
            const columnNumber = activeEditor.selection.active.character + 1;
            resolvedCommand = resolvedCommand.replace(/\$\{columnNumber\}/g, columnNumber.toString());
        }

        // ${selectedText} - the current selected text in the active file
        if (resolvedCommand.includes('${selectedText}')) {
            const selectedText = activeEditor.document.getText(activeEditor.selection);
            resolvedCommand = resolvedCommand.replace(/\$\{selectedText\}/g, selectedText);
        }

        return resolvedCommand;
    }

    /**
     * Resolve system variables: ${userHome}, ${cwd}, ${execPath}, ${pathSeparator}, ${/}
     */
    private resolveSystemVariables(command: string, workspaceFolder?: vscode.WorkspaceFolder): string {
        let resolvedCommand = command;

        // ${userHome} - the path of the user's home folder
        if (resolvedCommand.includes('${userHome}')) {
            resolvedCommand = resolvedCommand.replace(/\$\{userHome\}/g, os.homedir());
        }

        // ${cwd} - the task runner's current working directory on startup of VS Code
        if (resolvedCommand.includes('${cwd}')) {
            resolvedCommand = resolvedCommand.replace(/\$\{cwd\}/g, process.cwd());
        }

        // ${execPath} - the path to the running VS Code executable
        if (resolvedCommand.includes('${execPath}')) {
            resolvedCommand = resolvedCommand.replace(/\$\{execPath\}/g, process.execPath);
        }

        // ${pathSeparator} - the character used by the operating system to separate components in file paths
        if (resolvedCommand.includes('${pathSeparator}')) {
            resolvedCommand = resolvedCommand.replace(/\$\{pathSeparator\}/g, path.sep);
        }

        // ${/} - shorthand for ${pathSeparator}
        if (resolvedCommand.includes('${/}')) {
            resolvedCommand = resolvedCommand.replace(/\$\{\/\}/g, path.sep);
        }

        return resolvedCommand;
    }

    /**
     * Resolve ${folderForFile: <glob>} variable in the command by finding files matching the glob pattern
     * @throws {Error} When no files are found or user cancels selection
     */
    private async resolveFolderForFileVariable(command: string, workspaceFolder?: vscode.WorkspaceFolder): Promise<string> {
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
                throw new Error(`No files found matching pattern: ${globPattern}`);
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
                    throw new Error('User cancelled folder selection');
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
}

interface BrightscriptTaskDefinition extends vscode.TaskDefinition {
    /**
     * The command to run
     */
    command: string;
}
