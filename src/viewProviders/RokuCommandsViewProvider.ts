import * as path from 'path';
import * as rta from 'roku-test-automation';
import * as fs from 'fs';
import { BaseRdbViewProvider } from './BaseRdbViewProvider';
import { ViewProviderId } from './ViewProviderId';

export class RokuCommandsViewProvider extends BaseRdbViewProvider {
    public readonly id = ViewProviderId.rokuCommandsView;

    protected additionalScriptContents() {
        const requestArgsPath = path.join(rta.utils.getClientFilesPath(), 'requestArgs.schema.json');

        return [
            `const requestArgsSchema = ${fs.readFileSync(requestArgsPath, 'utf8')};`,
            `const odcCommands = ['${this.odcCommands.join(`','`)}'];`
        ];
    }
}
