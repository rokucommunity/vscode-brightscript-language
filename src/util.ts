import * as fs from 'fs';
import * as fsExtra from 'fs-extra';
import * as net from 'net';
import * as url from 'url';
import { debounce } from 'debounce';
import * as vscode from 'vscode';
import { Cache } from 'brighterscript/dist/Cache';
import * as r from 'postman-request';
import type { Response } from 'request';
import type * as requestType from 'request';
const request = r as typeof requestType;

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
     * Normalizes the file path to only have one forward slash
     * @param filePath
     */
    public normalizeFileScheme(filePath: string): string {
        return filePath.replace(/^file:[\/\\]*/, 'file:/');
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
     * Decode HTML entities like &nbsp; &#39; to its original character
     */
    public decodeHtmlEntities(encodedString: string) {
        let translateRegex = /&(nbsp|amp|quot|lt|gt);/g;
        let translate = {
            'nbsp': ' ',
            'amp': '&',
            'quot': '"',
            'lt': '<',
            'gt': '>'
        };

        return encodedString.replace(translateRegex, (match, entity) => {
            return translate[entity];
        }).replace(/&#(\d+);/gi, (match, numStr) => {
            let num = parseInt(numStr, 10);
            return String.fromCharCode(num);
        });
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

    /**
     * Get a promise that resolves after the given number of milliseconds.
     */
    public sleep(milliseconds: number) {
        return new Promise((resolve) => {
            setTimeout(resolve, milliseconds);
        });
    }

    /**
     * Convert an arbitrary range-like object into a proper vscode.Range instance
     */
    public toRange(range: { start: { line: number; character: number }; end: { line: number; character: number } }) {
        return new vscode.Range(
            new vscode.Position(range.start.line, range.start.character),
            new vscode.Position(range.end.line, range.end.character)
        );
    }

    /**
     * Is the value null or undefined
     */
    public isNullish(value?: any) {
        return value === undefined || value === null;
    }

    /**
      * Conceals (scrambles/obfuscates) any of the specified keys across all string properties in the object
      */
    public concealObject(object: Record<string, any>, secretKeys: string[]) {
        const result = new Map<string, { value: string; originalValue: string }>();
        const secretValues = Object.entries(object)
            //only keep the non-blank string keys
            .filter(([key, value]) => secretKeys.includes(key) && typeof value === 'string' && value?.toString() !== '')
            .map(([, value]) => value) as string[];

        //build the initial result
        for (const [key, value] of Object.entries(object)) {
            result.set(key, {
                value: value,
                originalValue: value
            });
        }

        //do value transforms
        for (let [key, entry] of result) {
            let { value } = entry;
            for (const secretValue of secretValues) {
                if (typeof value === 'string') {
                    const regexp = new RegExp(
                        //escape the regex, or use an unmatchable regex if unable to escape it
                        util.escapeRegex(secretValue) ?? /(?!)/,
                        'g'
                    );
                    entry.value = entry.value.replace(regexp, this.concealString(secretValue));
                }
            }
        }

        return result;
    }

    private concealCache = new Cache<string, string>();

    /**
     * Given a string, replace the alphanumeric characters with random values.
     * This is useful for things like scrambling a uuid
     */
    public concealString(text: string) {
        return this.concealCache.getOrAdd(text, () => {
            if (this.isNullish(text)) {
                return text;
            } else {
                return text.replace(/[a-z0-9]/ig, (match) => {
                    // is a number
                    if (parseInt(match)) {
                        return this.getRandomChar('0123456789');

                        //is an uppercase letter
                    } else if (match.toUpperCase() === match) {
                        return this.getRandomChar('ABCDEFGHIJKLMNOPQRSTUVWXYZ');

                        //is a lower case number
                    } else {
                        return this.getRandomChar('abcdefghijklmnopqrstuvwxyz');
                    }
                });
            }
        });
    }

    private getRandomChar(dictionary: string) {
        return dictionary.charAt(Math.floor(Math.random() * dictionary.length));
    }

    /**
     * Escapes a string so that it can be used as a regex pattern
     */
    public escapeRegex(text: string) {
        return text?.toString().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    }

    /**
     * Do an http GET request
     */
    public httpGet(url: string) {
        return new Promise<Response>((resolve, reject) => {
            request.get(url, (err, response) => {
                return err ? reject(err) : resolve(response);
            });
        });
    }

    /**
     * Do an http POST request
     */
    public httpPost(url: string) {
        return new Promise<Response>((resolve, reject) => {
            request.post(url, (err, response) => {
                return err ? reject(err) : resolve(response);
            });
        });
    }
}

const util = new Util();
export { util };
