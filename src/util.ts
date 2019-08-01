import * as fs from 'fs';
import * as fsExtra from 'fs-extra';
import * as path from 'path';

const extensions = ['.js', '.ts', '.json', '.jsx', '.tsx', '.vue', '.css', '.mcss', '.scss', '.less', '.html'];

async function readDir(dirPath: string) {
    return await new Promise<string[]>((resolve, reject) => {
        fs.readdir(dirPath, (err, result) => {
            if (err) { reject(err); }
            resolve(result);
        });
    });
}

export function checkForTrailingSlash(dirPath: string) {
    return dirPath.substr(dirPath.length - 1) !== '/' ? dirPath + '/' : dirPath;
}

async function stat(filePath: string) {
    return await new Promise((resolve, reject) => {
        fs.stat(filePath, (err, result) => {
            if (err) {
                reject(err);
            }
            resolve(result);
        });
    });
}

export async function fixFilePathExtension(filePath: string) {
    const dirPath = path.join(filePath, '../');
    const fileName = filePath.replace(dirPath, '');

    // with extension, return directly
    if (fileName.indexOf('.') > 0) {
        return filePath;
    }

    async function traverse(dirPath: string, fileName: string) {
        let dir = await readDir(dirPath);
        for (let ext of extensions) {
            if (dir.indexOf(fileName + ext) > -1) {
                return path.join(dirPath, fileName + ext);
            }
        }
        if (dir.indexOf(fileName) !== -1) {
            let stats = await stat(path.join(dirPath, fileName)) as fs.Stats;
            if (stats.isFile()) {
                return path.join(dirPath, fileName);
            } else if (stats.isDirectory()) {
                return 'dir';
            }
        }
        return null;
    }

    // Traverse the directory where the file is located, match the file name. Suffix
    let filePathWithExt = await traverse(dirPath, fileName);
    if (filePathWithExt === 'dir') {
        filePathWithExt = await traverse(filePath, 'index');
    }
    if (filePathWithExt && filePathWithExt !== 'dir') {
        return filePathWithExt;
    }
    return null;
}

/**
 * Determine if a file exists
 * @param filePath
 */
export async function fileExists(filePath: string) {
    return new Promise((resolve) => {
        fsExtra.exists(filePath, resolve);
    });
}

/**
 * Reads the the manifest file and converts to a javascript object skipping empty lines and comments
 * @param path location of the manifest file
 */
export async function convertManifestToObject(path: string): Promise<{ [key: string]: string } | undefined> {
    if (await fileExists(path) === false) {
        return undefined;
    } else {
        let fileContents = (await fsExtra.readFile(path)).toString();
        let manifestLines = fileContents.split('\n');

        let manifestValues = {};
        manifestLines.map((line) => {
            let match;
            if (match = /(\w+)=(.+)/.exec(line)) {
                manifestValues[match[1]] = match[2];
            }
        });

        return manifestValues;
    }
}

/**
 * Creates a delay in execution
 * @param ms time to delay in milliseconds
 */
export async function delay(ms: number) {
    return new Promise( (resolve) => setTimeout(resolve, ms) );
}

/**
 * With return the differences in two objects
 * @param obj1 base target
 * @param obj2 comparison target
 * @param exclude fields to exclude in the comparison
 */
export function objectDiff(obj1: object, obj2: object, exclude?: string[]) {
    let r = {};

    if (!exclude) {	exclude = []; }

    for (let prop in obj1) {
        if (obj1.hasOwnProperty(prop) && prop !== '__proto__') {
            if (exclude.indexOf(obj1[prop]) === -1) {

                // check if obj2 has prop
                if (!obj2.hasOwnProperty(prop)) { r[prop] = obj1[prop]; } else if (obj1[prop] === Object(obj1[prop])) {
                    let difference = objectDiff(obj1[prop], obj2[prop]);
                    if (Object.keys(difference).length > 0) { r[prop] = difference; }
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
