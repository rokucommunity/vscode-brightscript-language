import * as path from 'path';
import * as rta from 'roku-test-automation';
import * as fs from 'fs';
import { BaseRdbViewProvider } from './BaseRdbViewProvider';

export class RokuCommandsViewProvider extends BaseRdbViewProvider {
    public readonly id = 'rokuCommandsView';

    protected additionalScriptContents() {
        const requestArgsPath = path.join(rta.utils.getServerFilesPath(), 'requestArgs.schema.json');

        return [
            `const requestArgsSchema = ${fs.readFileSync(requestArgsPath, 'utf8')};`,
            `const odcCommands = ['${this.odcCommands.join(`','`)}'];`
        ];
    }
}
