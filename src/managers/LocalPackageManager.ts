/* eslint-disable @typescript-eslint/consistent-indexed-object-style */
import * as fsExtra from 'fs-extra';
import { standardizePath as s } from 'brighterscript';
import { util } from '../util';
import type { ExtensionContext } from 'vscode';
import * as lodash from 'lodash';
import * as md5 from 'md5';
import * as semver from 'semver';
import * as path from 'path';

const USAGE_KEY = 'local-package-usage';

/**
 * Manages all node_module packages that are installed by this extension
 */
export class LocalPackageManager {
    constructor(
        public readonly storageLocation: string,
        public readonly context: ExtensionContext
    ) {
        this.catalogPath = s`${this.storageLocation}/catalog.json`;
    }

    private catalogPath: string;

    /**
     * Load the catalog object from disk
     */
    private getCatalog(): PackageCatalog {
        //load from disk
        return fsExtra.readJsonSync(this.catalogPath, { throws: false }) ?? {};
    }

    /**
     * Write the catalog object to disk
     */
    private setCatalog(catalog: PackageCatalog) {
        fsExtra.outputJsonSync(this.catalogPath, catalog);
    }

    private setCatalogPackageInfo(packageName: string, version: string, info: PackageCatalogPackageInfo) {
        const catalog = this.getCatalog();

        lodash.set(catalog, ['packages', packageName, version], info);

        this.setCatalog(catalog);
    }

    /**
     * Is the given package installed
     * @param packageName name of the package
     * @param versionInfo versionInfo of the package
     * @returns true if the package is installed, false if not
     */
    public isInstalled(packageName: string, versionInfo: string) {
        return this.getPackageInfo(packageName, versionInfo).isInstalled;
    }

    /**
     * Install a package with the given name and version information
     * @param packageName the name of the package
     * @param versionInfo the versionInfo of the package. See {versionInfo} for more details
     * @returns the absolute path to the installed package
     */
    public async install(packageName: string, versionInfo: string): Promise<PackageInfo> {
        const packageInfo = this.getPackageInfo(packageName, versionInfo);

        //if this package is already installed, skip the install
        if (packageInfo.isInstalled) {
            return;
        }
        const rootDir = s`${this.storageLocation}/${packageName}/${packageInfo.versionDirName}`;

        fsExtra.ensureDirSync(rootDir);

        //write a simple package.json file referencing the version of brighterscript we want
        await fsExtra.outputJson(`${rootDir}/package.json`, {
            name: 'vscode-brighterscript-host',
            private: true,
            version: '1.0.0',
            dependencies: {
                [packageName]: versionInfo
            }
        });

        //install the package
        await util.spawnNpmAsync(['install'], {
            cwd: rootDir
        });

        //update the catalog
        this.setCatalogPackageInfo(packageName, versionInfo, {
            versionDirName: packageInfo.versionDirName,
            installDate: Date.now()
        });

        return this.getPackageInfo(packageName, versionInfo);
    }

    /**
     * Remove a specific version of a package
     * @param packageName name of the package
     * @param version version of the package to remove
     */
    public async uninstall(packageName: string, version: VersionInfo, catalog?: PackageCatalog) {
        await this.withCatalog(async (catalog) => {
            const info = this.getPackageInfo(packageName, version, catalog);
            await fsExtra.remove(info.rootDir);
            delete catalog.packages?.[packageName]?.[version];
        }, catalog);
    }

    /**
     * Run an action with a given catalog object. If no catalog is provided, the catalog will be loaded from disk and saved back to disk after the action is complete.
     * If a catalog is provided, it's assumed the outside caller will handle saving the catalog to disk
     */
    private async withCatalog<T = any>(callback: (catalog: PackageCatalog) => T | PromiseLike<T>, catalog?: PackageCatalog): Promise<T> {
        let hasExternalCatalog = !!catalog;
        catalog ??= this.getCatalog();

        const result = await Promise.resolve(
            callback(catalog)
        );

        if (!hasExternalCatalog) {
            this.setCatalog(catalog);
        }
        return result;
    }

    /**
     * Remove all packages with the given name
     * @param packageName the name of the package that will have all versions removed
     */
    public async removePackage(packageName: string) {
        //delete the package folder
        await fsExtra.remove(s`${this.storageLocation}/${packageName}`);

        const catalog = this.getCatalog();
        delete catalog.packages?.[packageName];
        this.setCatalog(catalog);
    }

    /**
     * Remove all packages and their versions
     */
    public async removeAll() {
        await fsExtra.emptyDir(this.storageLocation);
    }

    /**
     * Create a filesystem-safe name for the given version. This will be used as the directory name for the package version.
     * Will also handle collisions with existing directories by appending a number to the end of the directory name if we already have
     * a directory with the same name for this package
     * @param version
     * @returns
     */
    private getVersionDirName(packageName: string, version: string, catalog = this.getCatalog()) {
        const existingVersionDirName = catalog.packages?.[packageName]?.[version]?.versionDirName;

        //if there's already a directory for this package, return it
        if (existingVersionDirName) {
            return existingVersionDirName;
        }

        //this is a valid semver number, so we can use it as the directory name
        if (semver.valid(version)) {
            return version;
        } else {

            //hash the string to create a unique folder name. There is next to zero possibility these will clash, but we'll handle collisions anyway
            const hash = md5(version.trim());
            const existingHashes = Object.values(catalog.packages?.[packageName] ?? {}).map(x => x.versionDirName);
            let newHash = hash;
            let i = 0;
            while (existingHashes.includes(newHash)) {
                newHash = hash + i++;
            }
            return newHash;
        }
    }

    /**
     * Get info about this package (regardless of whether it's installed or not).
     * If the package is not installed, all
     * @param packageName name of the package
     * @param versionInfo versionInfo of the package
     * @param catalog the catalog object. If not provided, it will be loaded from disk
     * @returns
     */
    private getPackageInfo(packageName: string, versionInfo: VersionInfo, catalog = this.getCatalog()): PackageInfo {
        //TODO derive a better name for some edge cases (like urls or tags)
        const versionDirName = this.getVersionDirName(packageName, versionInfo, catalog);

        const rootDir = s`${this.storageLocation}/${packageName}/${versionDirName}`;
        const packageDir = s`${rootDir}/node_modules/${packageName}`;
        const packageInfo = (catalog.packages?.[packageName]?.[versionInfo] ?? {}) as PackageCatalogPackageInfo;
        const lastUseDate = this.context.globalState.get(USAGE_KEY, {})[packageName]?.[versionInfo];
        return {
            packageName: packageName,
            versionInfo: versionInfo,
            rootDir: rootDir,
            packageDir: packageDir,
            versionDirName: versionDirName,
            version: fsExtra.readJsonSync(s`${packageDir}/package.json`, { throws: false })?.version,
            isInstalled: fsExtra.pathExistsSync(packageDir),
            lastUsedDate: lastUseDate ? new Date(lastUseDate) : undefined,
            installDate: packageInfo.installDate ? new Date(packageInfo.installDate) : undefined
        };
    }

    /**
     * Mark a package as being used by the user right now. This can help with determining which packages are safe to remove after a period of time.
     * @param packageName the name of the package
     * @param version the version of the package
     */
    public async setUsage(packageName: string, version: VersionInfo, dateUsed: Date = new Date()) {
        const usage = this.context.globalState.get(USAGE_KEY, {});
        lodash.set(usage, [packageName, version], dateUsed.getTime());
        await this.context.globalState.update(USAGE_KEY, usage);
    }

    /**
     * Delete packages that havent been used since the given cutoff date
     * @param cutoffDate any package not used since this date will be deleted
     */
    public async deletePackagesNotUsedSince(cutoffDate: Date) {
        //get the list of directories from the storage folder (these are our package names)
        const packageNames = (await fsExtra.readdir(this.storageLocation))
            .filter(x => x !== 'catalog.json');

        let onDiskPackages = {};

        //get every version folder for each package
        await Promise.all(
            packageNames.map(async (packageName) => {
                onDiskPackages[packageName] = {};
                for (const versionDirName of await fsExtra.readdir(s`${this.storageLocation}/${packageName}`)) {
                    //set to the oldest date possible
                    onDiskPackages[packageName][versionDirName] = 0;
                }
            })
        );

        const catalog = this.getCatalog();

        //now get the actual usage dates
        const usage = this.context.globalState.get(USAGE_KEY, {});
        for (const [packageName, versions] of Object.entries(usage)) {
            for (const [version, dateUsed] of Object.entries(versions)) {
                const packageInfo = this.getPackageInfo(packageName, version, catalog);
                onDiskPackages[packageName][packageInfo.versionDirName] = dateUsed;
            }
        }

        let cutoffDateMs = cutoffDate.getTime();
        //now delete every directory that's older than our date
        for (const [packageName, versions] of Object.entries(onDiskPackages)) {
            for (const [versionDirName, lastUsedDate] of Object.entries(versions)) {
                if (lastUsedDate < cutoffDateMs) {
                    await this.uninstall(packageName, versionDirName);
                }
            }
        }
        this.setCatalog(catalog);
    }

    /**
     * Parse the versionInfo string into a ParsedVersionInfo object which gives us more details about how to handle it
     * @param versionInfo the string to evaluate
     * @param cwd a current working directory to use when resolving relative paths
     * @returns an object with parsed information about the versionInfo
     */
    public parseVersionInfo(versionInfo: string, cwd: string): ParsedVersionInfo {
        //is empty string or undefined, return undefined
        if (!util.isNonEmptyString(versionInfo)) {
            return undefined;

            //is an exact semver value
        } else if (semver.valid(versionInfo)) {
            return {
                type: 'semver-exact',
                value: versionInfo
            };
            //is a semver range
        } else if (semver.validRange(versionInfo)) {
            return {
                type: 'semver-range',
                value: versionInfo
            };
            //is a dist tag (like @next, @latest, etc...)
        } else if (/^@[a-zA-Z][a-zA-Z0-9-_]*$/.test(versionInfo)) {
            return {
                type: 'semver-range',
                value: versionInfo
            };

            //is a url, return as-is
        } else if (/^(http|https):\/\//.test(versionInfo)) {
            return {
                type: 'url',
                value: versionInfo
            };

            //path to a tgz
        } else if (/\.tgz$/i.test(versionInfo)) {
            return {
                type: 'tgz-path',
                value: versionInfo
            };

            //an absolute path
        } else if (path.isAbsolute(versionInfo)) {
            return {
                type: 'dir',
                value: versionInfo
            };

            //assume relative path, resolve it to the cwd
        } else {
            return {
                type: 'dir',
                value: path.resolve(cwd, versionInfo)
            };
        }
    }

    public dispose() {

    }
}

/**
 * The versionInfo of a package. This can be:
 *  - specific version number (i.e. `1.0.0`, `2.3.4-alpha.1`)
 *  - a url to a package (i.e. `https://github.com/rokucommunity/brighterscript/releases/download/v0.0.0-packages/brighterscript-0.67.5-lsp-refactor.20240806164122.tgz`)
 *  - TODO: a path to a local package (i.e. `file:/path/to/package.tgz`)
 *  - TODO: a release tag (i.e. `@latest`, `@next`)
 *  - TODO: a release line (i.e. `insider:lsp-rewrite`)
 */
export type VersionInfo = string;

export interface PackageCatalog {
    packages: {
        [packageName: string]: {
            [version: string]: PackageCatalogPackageInfo;
        };
    };
}

export interface PackageCatalogPackageInfo {
    versionDirName: string;
    installDate: number;
}

export interface PackageInfo {
    /**
     * The name of the package
     */
    packageName: string;
    /**
     * The versionInfo of the package.
     */
    versionInfo: VersionInfo;
    /**
     * The directory where the top-level folder for this package and version will be located. (i.e. `${storageDir}/${packageName}/${versionDirName}`).
     * Due to how how we install packages, this will be the root directory for the package which contains a barebones `package.json` file,
     * and once installed, will also contain the `node_modules/${packageName}` folder.
     */
    rootDir: string;
    /**
     * Directory where this package will actually be located (i.e. `${packageDir}/node_modules/${packageName}`)
     */
    packageDir: string;
    /**
     * The version from this package's `package.json` file. Will be `undefined` if unable to read the file
     */
    version?: string;
    /**
     * The name of the directory representing this version. If versionInfo is a semantic version, we'll use that for the dirName.
     * Otherwise, we'll create a unique hash of the versionInfo
     */
    versionDirName: string;
    /**
     * Is this package currently installed
     */
    isInstalled: boolean;
    /**
     * Date this package was installed
     */
    installDate: Date;
    /**
     * Date this package was last used by vscode
     */
    lastUsedDate: Date;
}

export type ParsedVersionInfo = {
    type: 'url';
    value: string;
} | {
    type: 'tgz-path';
    value: string;
} | {
    type: 'semver-exact';
    value: string;
} | {
    type: 'semver-range';
    value: string;
} | {
    type: 'dist-tag';
    value: string;
} | {
    type: 'dir';
    value: string;
};
