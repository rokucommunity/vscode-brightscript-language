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
}

const utils = new Utils();
export {
    utils
};
