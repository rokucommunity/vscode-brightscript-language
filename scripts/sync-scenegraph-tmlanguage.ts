import * as fsExtra from 'fs-extra';
import * as r from 'postman-request';
import type { Response } from 'request';
import type * as requestType from 'request';
const request = r as typeof requestType;

(async () => {
    const json = JSON.parse(
        (await httpGet('https://raw.githubusercontent.com/microsoft/vscode/main/extensions/xml/syntaxes/xml.tmLanguage.json')).body
    );
    json.scopeName = 'scenegraph.xml';
    json.name = 'scenegraph';
    json.fileTypes = ['xml'];
    delete json.information_for_contributors;
    delete json.version;
    //find the CDATA pattern
    const pattern = json.patterns.find(x => x.name === 'string.unquoted.cdata.xml');
    pattern.name = 'source.brighterscript.embedded.scenegraph';
    pattern.patterns = [{
        include: 'source.brs'
    }];
    fsExtra.outputFileSync(`${__dirname}/../syntaxes/scenegraph.tmLanguage.json`, JSON.stringify(json, null, 4));
})().catch(e => console.error(e));


/**
 * Do an http GET request
 */
function httpGet(url: string) {
    return new Promise<Response>((resolve, reject) => {
        request.get(url, (err, response) => {
            return err ? reject(err) : resolve(response);
        });
    });
}
