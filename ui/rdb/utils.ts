class Utils {
    public debugLog(...args) {
        if (window.localStorage.enableDebugLogging) {
            console.log(...args);
        }
    }
}

const utils = new Utils;
export {
    utils
}
