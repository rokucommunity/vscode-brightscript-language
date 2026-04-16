import { odc } from './ExtensionIntermediary';
import type { AppUIResponseChildWithAppUIKeyPath } from './shared/types';

type AllowedStorageTypes = string | number | boolean | Record<string, string | number | boolean>;

class Utils {
    private storage: Record<string, AllowedStorageTypes>;

    public debugLog(...args) {
        if (this.getStorageBooleanValue('enableDebugLogging')) {
            console.log(...args);
        }
    }

    public isObjectWithProperty<Y extends PropertyKey>
    (obj: any, prop: Y): obj is Record<Y, unknown> {
        if (obj === null || typeof obj !== 'object') {
            return false;
        }
        return obj.hasOwnProperty(prop);
    }

    private getVscodeApi() {
        return window.vscode;
    }

    private setupStorage() {
        if (this.storage) {
            return;
        }

        this.storage = {};
        const state = this.getVscodeApi().getState();
        if (state) {
            this.storage = JSON.parse(state);
        }
    }

    public getStorageValue(key: string, defaultValue = null) {
        this.setupStorage();
        if (this.storage.hasOwnProperty(key)) {
            return this.storage[key];
        } else {
            return defaultValue;
        }
    }

    public getStorageBooleanValue(key: string, defaultValue = false) {
        const value = this.getStorageValue(key);
        if (typeof value === 'boolean') {
            return value;
        } else {
            return defaultValue;
        }
    }

    public setStorageValue(key: string, value: AllowedStorageTypes) {
        this.setupStorage();
        this.storage[key] = value;
        this.getVscodeApi().setState(JSON.stringify(this.storage));
    }

    public deleteStorageValue(key: string) {
        this.setupStorage();
        delete this.storage[key];
        this.getVscodeApi().setState(JSON.stringify(this.storage));
    }

    /**
     * Helps improve performance by removing the children from the AppUIResponseChild object to make the object being passed around much smaller
     */
    public getShallowCloneOfAppUIResponseChild(appUIResponseChild: AppUIResponseChildWithAppUIKeyPath) {
        return { ...appUIResponseChild, children: [] };
    }

    /** Provides a central spot to convert key path to be scene based to avoid extra appUI calls */
    public async convertAppUIKeyPathToSceneKeyPath(child: AppUIResponseChildWithAppUIKeyPath) {
        const { keyPath } = await odc.convertKeyPathToSceneKeyPath({
            base: child.base,
            keyPath: child.keyPath
        });

        // Keeping existing appUI key path to allow more fallback options if needed
        child.appUIKeyPath = child.keyPath;

        child.base = 'scene';
        child.keyPath = keyPath;
    }
}

const utils = new Utils();
export {
    utils
};
