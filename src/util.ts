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
