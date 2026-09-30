import * as childProcess from 'child_process';

export class ProcessManager {
    /**
     * Execute a command and get a promise for when it finishes.
     * @param command the command to execute
     * @param options the options to pass to exec
     * @returns the stdout if successful, or an error if failed
     */
    public async exec(command: string, options?: childProcess.ExecOptions): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            childProcess.exec(command, options, (error, stdout) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(stdout);
                }
            });
        });
    }

    /**
     * Determine if the current OS is running a version of windows
     */
    private isWindowsPlatform() {
        return process.platform.startsWith('win');
    }

    /**
     * Spawn an npm command and return a promise.
     * This is necessary because spawn requires the file extension (.cmd) on windows.
     * @param args - the list of args to pass to npm. Any undefined args will be removed from the list, so feel free to use ternary outside to simplify things
     */
    spawnNpmAsync(args: Array<string | undefined>, options?: childProcess.SpawnOptions) {
        //filter out undefined args
        args = args.filter(arg => arg !== undefined);

        if (this.isWindowsPlatform()) {
            return this.spawnAsync('npm.cmd', args, {
                ...options,
                shell: true,
                detached: false,
                windowsHide: true
            });
        } else {
            return this.spawnAsync('npm', args, options);
        }
    }

    /**
     * Executes an exec command and returns a promise that completes when it's finished
     */
    spawnAsync(command: string, args?: string[], options?: childProcess.SpawnOptions) {
        return new Promise((resolve, reject) => {
            const child = childProcess.spawn(command, args ?? [], {
                ...(options ?? {}),
                stdio: 'inherit'
            });
            child.addListener('error', reject);
            child.addListener('exit', resolve);
        });
    }
}

export const processManager = new ProcessManager();
