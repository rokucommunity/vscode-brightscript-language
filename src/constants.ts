import * as fsExtra from 'fs-extra';

export let ROKU_DEBUG_VERSION: string;
try {
    ROKU_DEBUG_VERSION = fsExtra.readJsonSync(__dirname + '/../node_modules/roku-debug/package.json').version;
} catch (e) { }

export const EXTENSION_ID = 'RokuCommunity.brightscript';
