import * as vscode from 'vscode';
import * as path from 'path';

export class BrightScriptTaskProvider implements vscode.Disposable {
    constructor() {
        this.taskProvider = vscode.tasks.registerTaskProvider('brightscript', {
            provideTasks: () => {
                console.log('provideTasks called');
                // Return empty array so all tasks go through resolveTask
                return [];
            },
            resolveTask: async (_task: vscode.Task): Promise<vscode.Task | undefined> => {
                return this.resolveTask(_task);
            }
        });
    }

    private taskProvider: vscode.Disposable;

    private async resolveTask(_task: vscode.Task): Promise<vscode.Task | undefined> {
        console.log('resolveTask called for task:', _task.definition);
        let command: string = _task.definition.command;

        // A BrightScript task consists of a task definition
        // Make sure that this looks like a BrightScript task by checking that there is a command.
        if (!command) {
            return undefined;
        }

        command = await this.resolveFolderForFileVariable(command);

        // If command is undefined/null after processing, the user cancelled a selection
        if (!command) {
            return undefined;
        }

        // resolveTask requires that the same definition object be used.
        const definition: BrightscriptTaskDefinition = <any>_task.definition;
        const task = new vscode.Task(
            definition,
            _task.scope ?? vscode.TaskScope.Workspace,
            _task.name,
            'brightscript',
            new vscode.ShellExecution(command)
        );

        // Copy over other properties from the original task
        task.problemMatchers = _task.problemMatchers;
        task.isBackground = _task.isBackground;
        task.presentationOptions = _task.presentationOptions;
        task.group = _task.group;
        task.runOptions = _task.runOptions;

        return task;
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
