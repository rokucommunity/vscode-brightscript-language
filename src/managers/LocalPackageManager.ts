/* eslint-disable @typescript-eslint/consistent-indexed-object-style */
import * as fsExtra from 'fs-extra';
import { standardizePath as s } from 'brighterscript';
import { util } from '../util';

/**
 * Manages all node_module packages that are installed by this extension
 */
export class LocalPackageManager {
    constructor(
        public readonly storageLocation: string
    ) {
        this.catalogPath = s`${this.storageLocation}/catalog.json`;
    }

    private catalogPath: string;

    /**
     * Load the catalog object from disk
     */
    private getCatalog(): PackageCatalog {
        //load from disk
        return fsExtra.readJsonSync(this.catalogPath, { throws: false }) || {};
    }

    /**
     * Write the catalog object to disk
     */
    private setCatalog(catalog: PackageCatalog) {
        fsExtra.outputJsonSync(this.catalogPath, catalog);
    }

    private setCatalogPackageInfo(packageName: string, version: string, info: PackageInfo) {
        const catalog = this.getCatalog();

        catalog.packages ??= {};
        catalog.packages[packageName] ??= {};
        catalog.packages[packageName][version] = info;
        this.setCatalog(catalog);
    }

    private getPackageDir(packageName: string, version: string): string {
        return s`${this.storageLocation}/${packageName}/${version}`;
    }

    public isInstalled(packageName: string, version: string) {
        return fsExtra.pathExistsSync(
            this.getPackageDir(packageName, version)
        );
    }

    /**
     * Install a package with the given name and version information
     * @param packageName the name of the package
     * @param version the versionInfo of the package. See {versionInfo} for more details
     * @returns the absolute path to the installed package
     */
    public async install(packageName: string, version: string): Promise<string> {
        const packageDir = this.getPackageDir(packageName, version);

        //if this package is already installed, skip the install
        if (this.isInstalled(packageName, version)) {
            return;
        }

        fsExtra.ensureDirSync(packageDir);

        //write a simple package.json file referencing the version of brighterscript we want
        await fsExtra.outputJson(`${packageDir}/package.json`, {
            name: 'vscode-brighterscript-host',
            private: true,
            version: '1.0.0',
            dependencies: {
                [packageName]: version
            }
        });

        //install the package
        await util.spawnNpmAsync(['install'], {
            cwd: packageDir
        });

        //update the catalog
        this.setCatalogPackageInfo(packageName, version, {
            dir: packageDir,
            installDate: Date.now()
        });

        return s`${packageDir}/node_modules/${packageName}`;
    }

    /**
     * Remove a specific version of a package
     * @param packageName name of the package
     * @param version version of the package to remove
     */
    public async removePackageVersion(packageName: string, version: VersionInfo) {
        const packageDir = this.getPackageDir(packageName, version);
        if (packageDir) {
            await fsExtra.remove(packageDir);

            const catalog = this.getCatalog();
            delete catalog.packages?.[packageName]?.[version];
            this.setCatalog(catalog);
        }
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

    public dispose() {

    }
}

/**
 * The versionInfo of a package. This can be a specific version number, a semver range, a url to a package, or a release channel
 */
export type VersionInfo = string;

export interface PackageCatalog {
    packages: {
        [packageName: string]: {
            [version: string]: PackageInfo;
        };
    };
}

export interface PackageInfo {
    /**
     * The path to the package on disk
     */
    dir: string;
    installDate: number;
}
