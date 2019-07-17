import * as fs from 'fs';
import * as fsExtra from 'fs-extra';
import * as path from 'path';

const extensions = ['.js', '.ts', '.json', '.jsx', '.tsx', '.vue', '.css', '.mcss', '.scss', '.less', '.html'];

class Util {
    public async readDir(dirPath: string) {
        return await new Promise<string[]>((resolve, reject) => {
            fs.readdir(dirPath, (err, result) => {
                if (err) { reject(err); }
                resolve(result);
            });
        });
    }

    public checkForTrailingSlash(dirPath: string) {
        return dirPath.substr(dirPath.length - 1) !== '/' ? dirPath + '/' : dirPath;
    }

    public async stat(filePath: string) {
        return await new Promise((resolve, reject) => {
            fs.stat(filePath, (err, result) => {
                if (err) {
                    reject(err);
                }
                resolve(result);
            });
        });
    }

    public async fixFilePathExtension(filePath: string) {
        const dirPath = path.join(filePath, '../');
        const fileName = filePath.replace(dirPath, '');

        // with extension, return directly
        if (fileName.indexOf('.') > 0) {
            return filePath;
        }

        // Traverse the directory where the file is located, match the file name. Suffix
        let filePathWithExt = await this.traverse(dirPath, fileName);
        if (filePathWithExt === 'dir') {
            filePathWithExt = await this.traverse(filePath, 'index');
        }
        if (filePathWithExt && filePathWithExt !== 'dir') {
            return filePathWithExt;
        }
        return null;
    }

    private async traverse(dirPath: string, fileName: string) {
        let dir = await this.readDir(dirPath);
        for (let ext of extensions) {
            if (dir.indexOf(fileName + ext) > -1) {
                return path.join(dirPath, fileName + ext);
            }
        }
        if (dir.indexOf(fileName) !== -1) {
            let stats = await this.stat(path.join(dirPath, fileName)) as fs.Stats;
            if (stats.isFile()) {
                return path.join(dirPath, fileName);
            } else if (stats.isDirectory()) {
                return 'dir';
            }
        }
        return null;
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
     * Creates a delay in execution
     * @param ms time to delay in milliseconds
     */
    public delay(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

const util = new Util();
export { util };
