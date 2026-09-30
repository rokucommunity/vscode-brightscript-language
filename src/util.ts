import type { DeviceConfig } from 'roku-deploy';
import { isLocalDeviceConfig, isRceDeviceConfigByUrl, isRceDeviceConfigById, isRceDeviceConfigByEsn } from 'roku-deploy';

/**
 * If the path does not have a trailing slash, one is appended to it
 * @param dirPath
 */
export function ensureTrailingSlash(dirPath: string) {
    return dirPath.substr(dirPath.length - 1) !== '/' ? dirPath + '/' : dirPath;
}

/**
 * Normalizes the file path to only have one forward slash
 * @param filePath
 */
export function normalizeFileScheme(filePath: string): string {
    return filePath.replace(/^file:[\/\\]*/, 'file:/');
}

/**
 * Wraps a function and calls a callback before calling the original function
 */
export function wrap<T, K extends keyof T>(subject: T, name: K, callback) {
    const original = subject[name] as any;
    (subject as any)[name] = (...args) => {
        callback(...args);
        original.call(subject, ...args);
    };
}

/**
 * Get a promise that resolves after the given number of milliseconds.
 */
export function sleep(milliseconds: number) {
    let handle: NodeJS.Timeout;
    const promise = new Promise((resolve) => {
        handle = setTimeout(resolve, milliseconds);
    }) as Promise<void> & { cancel: () => void };
    promise.cancel = () => {
        clearTimeout(handle);
    };
    return promise;
}

/**
 * Is the value null or undefined
 */
export function isNullish(value?: any) {
    return value === undefined || value === null;
}

/**
 * Escapes a string so that it can be used as a regex pattern
 */
export function escapeRegex(text: string) {
    return text?.toString().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

/**
 * Is the value a non-empty string?
 */
export function isNonEmptyString(value: any): value is string {
    return typeof value === 'string' && value.trim() !== '';
}

/**
 * Describe a roku-deploy device config (a local `{host}` config, or a Roku Cloud Emulator
 * config addressed by instanceUrl/id/esn) by whichever address field it has, for dialogs and
 * error messages. A Roku Cloud Emulator config has no host, so the host cannot be printed
 * directly.
 * @param device the device config to describe
 * @param fallback the label to use when the config carries no recognizable address
 */
export function describeDevice(device: DeviceConfig | undefined, fallback = 'unknown'): string {
    if (!device) {
        return fallback;
    }
    if (isLocalDeviceConfig(device)) {
        return device.host;
    }
    if (isRceDeviceConfigByUrl(device)) {
        return device.instanceUrl;
    }
    if (isRceDeviceConfigById(device)) {
        return String(device.id);
    }
    if (isRceDeviceConfigByEsn(device)) {
        return device.esn;
    }
    return fallback;
}
