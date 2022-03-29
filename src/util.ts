import * as fs from 'fs';
import * as fsExtra from 'fs-extra';
import * as net from 'net';
import * as url from 'url';
import { debounce } from 'debounce';
import * as vscode from 'vscode';

class Util {
    public async readDir(dirPath: string) {
        return new Promise<string[]>((resolve, reject) => {
            fs.readdir(dirPath, (err, result) => {
                if (err) {
                    reject(err);
                }
                resolve(result);
            });
        });
    }

    /**
     * If the path does not have a trailing slash, one is appended to it
     * @param dirPath
     */
    public ensureTrailingSlash(dirPath: string) {
        return dirPath.substr(dirPath.length - 1) !== '/' ? dirPath + '/' : dirPath;
    }

    public async stat(filePath: string) {
        return new Promise((resolve, reject) => {
            fs.stat(filePath, (err, result) => {
                if (err) {
                    reject(err);
                }
                resolve(result);
            });
        });
    }

    /**
     * Determine if a file exists
     * @param filePath
     */
    public fileExists(filePath: string) {
        return new Promise((resolve) => {
            fsExtra.exists(filePath, resolve);
        });
    }

    /**
     * Removes any leading scheme in the file path
     * @param filePath
     */
    public removeFileScheme(filePath: string): string {
        let scheme = this.getFileScheme(filePath);
        if (scheme) {
            return filePath.substring(scheme.length);
        } else {
            return filePath;
        }
    }

    /**
     * Gets any leading scheme in the file path
     * @param filePath
     */
    public getFileScheme(filePath: string): string | null {
        return url.parse(filePath).protocol;
    }

    /**
     * Creates a delay in execution
     * @param ms time to delay in milliseconds
     */
    public delay(ms: number) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    /**
     * Remove a single trailing newline from a string (\n or \r\n)
     */
    public removeTrailingNewline(value: string) {
        return value.replace(/(.*?)\r?\n$/, '$1');
    }

    /**
     * Reads the the manifest file and converts to a javascript object skipping empty lines and comments
     * @param path location of the manifest file
     */
    public async convertManifestToObject(path: string): Promise<Record<string, string> | undefined> {
        if (await this.fileExists(path) === false) {
            return undefined;
        } else {
            let fileContents = (await fsExtra.readFile(path)).toString();
            let manifestLines = fileContents.split('\n');

            let manifestValues = {};
            for (const line of manifestLines) {
                let match;
                // eslint-disable-next-line no-cond-assign
                if (match = /(\w+)=(.+)/.exec(line)) {
                    manifestValues[match[1]] = match[2];
                }
            }

            return manifestValues;
        }
    }

    /**
     * Checks to see if the port is already in use
     * @param port target port to check
     */
    public async isPortInUse(port: number): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            const tester = net.createServer()
                .once('error', (err: any) => (err.code === 'EADDRINUSE' ? resolve(true) : reject(err)))
                .once('listening', () => tester.once('close', () => resolve(false)).close())
                .listen(port);
        });
    }

    /**
     * With return the differences in two objects
     * @param obj1 base target
     * @param obj2 comparison target
     * @param exclude fields to exclude in the comparison
     */
    public objectDiff(obj1: object, obj2: object, exclude?: string[]) {
        let r = {};

        if (!exclude) {
            exclude = [];
        }

        for (let prop in obj1) {
            if (obj1.hasOwnProperty(prop) && prop !== '__proto__') {
                if (!exclude.includes(obj1[prop])) {

                    // check if obj2 has prop
                    if (!obj2.hasOwnProperty(prop)) {
                        r[prop] = obj1[prop];
                    } else if (obj1[prop] === Object(obj1[prop])) {
                        let difference = this.objectDiff(obj1[prop], obj2[prop]);
                        if (Object.keys(difference).length > 0) {
                            r[prop] = difference;
                        }
                    } else if (obj1[prop] !== obj2[prop]) {
                        if (obj1[prop] === undefined) {
                            r[prop] = 'undefined';
                        }

                        if (obj1[prop] === null) {
                            r[prop] = null;
                        } else if (typeof obj1[prop] === 'function') {
                            r[prop] = 'function';
                        } else if (typeof obj1[prop] === 'object') {
                            r[prop] = 'object';
                        } else {
                            r[prop] = obj1[prop];
                        }
                    }
                }
            }
        }
        return r;
    }

    private debounceByKey = {} as Record<string, any>;

    /**
     * Get a debounce function that runs a separate debounce for every unique key provided
     */
    public keyedDebounce<T>(key: string, fn: () => T, waitMilliseconds: number) {
        if (!this.debounceByKey[key]) {
            this.debounceByKey[key] = debounce(fn, waitMilliseconds);
        }
        this.debounceByKey[key]();
    }

    public isExtensionHostRunning() {
        return process.argv.includes('--type=extensionHost');
    }

    /**
     * Wraps a function and calls a callback before calling the original function
     */
    public wrap<T, K extends keyof T>(subject: T, name: K, callback) {
        const fn = subject[name] as any;
        (subject as any)[name] = (...args) => {
            callback(...args);
            fn.call(subject, ...args);
        };
    }

    /**
     * Creates an output channel but wraps the `append` and `appendLine`
     * functions so a function can be called with their values
     */
    public createOutputChannel(name: string, interceptor: (value: string) => void) {
        const channel = vscode.window.createOutputChannel(name);
        this.wrap(channel, 'append', interceptor);
        this.wrap(channel, 'appendLine', (line: string) => {
            if (line) {
                interceptor(line + '\n');
            }
        });
        return channel;
    }

    /**
     * Get a promise that resolves after the given number of milliseconds.
     */
    public sleep(milliseconds: number) {
        return new Promise((resolve) => {
            setTimeout(resolve, milliseconds);
        });
    }
}

const util = new Util();
export { util };
