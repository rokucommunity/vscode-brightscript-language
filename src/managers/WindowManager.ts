import * as vscode from 'vscode';
import { wrap } from '../util';

export class WindowManager {
    /**
     * Creates an output channel but wraps the `append` and `appendLine`
     * functions so a function can be called with their values
     */
    public createOutputChannel(name: string, interceptor: (value: string) => void) {
        const channel = vscode.window.createOutputChannel(name);
        wrap(channel, 'append', interceptor);
        wrap(channel, 'appendLine', (line: string) => {
            if (line) {
                interceptor(line + '\n');
            }
        });
        return channel;
    }

    /**
     * Shows ether a QuickPick or InputBox to the user and allows them to enter
     * items not in the QuickPick list of items
     */
    public async showQuickPickInputBox(configuration: { placeholder?: string; items?: vscode.QuickPickItem[]; matchOnDescription?: boolean; matchOnDetail?: boolean } = {}): Promise<string | null> {
        if (configuration?.items?.length) {
            // We have items so use QuickPick
            const quickPick = vscode.window.createQuickPick();
            Object.assign(quickPick, { ...configuration });
            const deffer = new Promise<string | null>(resolve => {
                quickPick.onDidChangeValue(() => {
                    // Clear the active item as the user started typing and we want
                    // to handle this as a new option not in the supplied list.

                    // VsCode does not have a strict match items to typed value option
                    // so this is a workaround to that limitation.
                    quickPick.activeItems = [];
                });

                quickPick.onDidAccept(() => {
                    quickPick.hide();

                    // Since we clear the active item when the user types (onDidChangeValue)
                    // there will only be an active item if the user clicked on an item with
                    // the mouse or used the arrows keys and then hit enter with one selected.
                    resolve(quickPick.activeItems?.[0]?.label ?? quickPick.value);
                });

                quickPick.onDidHide(() => {
                    // Make sure to dispose this view
                    quickPick.dispose();
                    resolve(null);
                });
            });
            quickPick.show();
            return deffer;
        } else {
            // There are no items to suggest to the user. Just use a normal InputBox
            return vscode.window.showInputBox({
                placeHolder: configuration.placeholder ?? '',
                value: ''
            });
        }
    }

    public createStatusbarSpinner(message: string) {
        const statusbarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 9_999_999);
        statusbarItem.text = `$(sync~spin) ${message}`;
        statusbarItem.show();
        return statusbarItem;
    }

    /**
     * Show a notification with a progress bar that auto-dismisses after the specified duration.
     * @param message the message to display in the notification
     * @param durationMs how long (in milliseconds) to show the notification before it dismisses
     */
    public async showTimedNotification(message: string, durationMs = 2000) {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: message
        }, async (progress) => {
            const intervalMs = 100;
            const steps = durationMs / intervalMs;
            const increment = 100 / steps;
            for (let i = 0; i < steps; i++) {
                await new Promise<void>(resolve => {
                    setTimeout(resolve, intervalMs);
                });
                progress.report({ increment: increment });
            }
        });
    }

    /**
     * Show a statusbar spinner that is hidden once the callback resolves
     * @param message the message that should be shown in the statusbar spinner
     * @param callback the function to run, that when completed will hide the spinner
     * @returns
     */
    public async spinAsync<T>(message: string, callback: () => Promise<T>) {
        const spinner = this.createStatusbarSpinner(message);
        try {
            const result = await callback();
            return result;
        } finally {
            spinner.dispose();
        }
    }

    /**
     * Run an action with option for a progress spinner. If `showProgress` is `false` then no progress is shown and instead the action is run directly
     */
    public async runWithProgress<T>(options: Partial<vscode.ProgressOptions> & { showProgress?: boolean }, action: () => PromiseLike<T>): Promise<T> {
        //show a progress spinner if configured to do so
        if (options?.showProgress !== false) {
            return vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                cancellable: false,
                ...options
            }, action);
        } else {
            return action();
        }
    }
}

export const windowManager = new WindowManager();
