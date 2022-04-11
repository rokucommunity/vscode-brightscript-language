class Utils {
    public debugLog(...args) {
        if (window.localStorage.enableDebugLogging) {
            console.log(...args);
        }
    }

    public isObjectWithProperty<Y extends PropertyKey>
    (obj: any, prop: Y): obj is Record<Y, unknown> {
        if (obj === null || typeof obj !== 'object') {
            return false;
        }
        return obj.hasOwnProperty(prop)
    }

}

const utils = new Utils;
export {
    utils
}
