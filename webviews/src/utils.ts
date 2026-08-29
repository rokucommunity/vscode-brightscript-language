import type { AppUIResponseChild } from 'roku-test-automation';

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
        //some views (e.g. RceVideoView) store their own raw object state instead of the
        //utils-owned JSON string, so only attempt to parse actual strings and tolerate anything
        //that fails to parse as JSON
        if (typeof state === 'string') {
            try {
                this.storage = JSON.parse(state);
            } catch (e) {
                this.storage = {};
            }
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
        if (!this.storage.hasOwnProperty(key)) {
            //nothing changed, so avoid overwriting state a view may have set directly (not
            //through this utils-owned storage) with an unrelated empty object
            return;
        }
        delete this.storage[key];
        this.getVscodeApi().setState(JSON.stringify(this.storage));
    }

    /**
     * Helps improve performance by removing the children from the AppUIResponseChild object to make the object being passed around much smaller
     */
    public getShallowCloneOfAppUIResponseChild(appUIResponseChild: AppUIResponseChild) {
        return { ...appUIResponseChild, children: [] };
    }
}

const utils = new Utils();
export {
    utils
};
