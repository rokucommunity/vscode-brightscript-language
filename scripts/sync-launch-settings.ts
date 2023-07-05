import { EOL } from 'os';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
const cwd = __dirname;
const packageJsonPath = path.resolve(`${cwd}/../package.json`);
const packageJson = fsExtra.readJsonSync(packageJsonPath);

console.log('Sync launch.json definitions into brightscript.debug.* user settings definitions...');
// extract object from 'package.json'
const configurationArray = packageJson.contributes.configuration;

const newDebugProperties = {};
let debugIndex;

for (let index = 0; index < configurationArray.length; index++) {
    const configurationItem = configurationArray[index];
    if (configurationItem.id === 'debug') {
        debugIndex = index;
        const debugProperties = configurationItem.properties;
        for (const [key, data] of Object.entries(debugProperties)) {
            // start off by just copying over the existing values (straight 1-1 copy)
            newDebugProperties[key] = data;
        }
    }
}

// now have to also join in data from package.json .... other part of file ...
const launchProperties = packageJson.contributes.debuggers[0].configurationAttributes.launch.properties;

for (const [key, data] of Object.entries(launchProperties)) {
    const launchProperty = {};
    for (const [dataKey, dataValue] of Object.entries(data as any)) {
        launchProperty[dataKey] = dataValue;
    }
    const scope = 'scope';
    launchProperty[scope] = 'resource';
    const brightscriptDebugKey = 'brightscript.debug.' + key;
    // note: if duplicate keys exist, we overwrite (new source data should be identical anyway)
    newDebugProperties[brightscriptDebugKey] = launchProperty;
}

// have to parse final output object to get clean JSON
const newDebugPropertiesParsed = JSON.parse(JSON.stringify(newDebugProperties));

// finally replace elements back into 'package.json' file
configurationArray[debugIndex].properties = newDebugPropertiesParsed;
packageJson.contributes.configuration = configurationArray;

try {
    fsExtra.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 4), 'utf8');
    fsExtra.appendFileSync(packageJsonPath, EOL, 'utf8');
} catch (e) {
    console.error(e);
}

console.log('done!');
