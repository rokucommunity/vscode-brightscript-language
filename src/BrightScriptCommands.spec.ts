/* tslint:disable:no-unused-expression */
/* tslint:disable:no-var-requires */
import * as sinon from 'sinon';
let Module = require('module');

import { vscode } from './mockVscode.spec';

//override the "require" call to mock certain items
const { require: oldRequire } = Module.prototype;

Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

import { BrightScriptCommands } from './BrightScriptCommands';

describe('BrightScriptFileUtils ', () => {
    let commands: BrightScriptCommands;
    let commandsMock;
    let languagesMock;

    beforeEach(() => {
        commands = new BrightScriptCommands();
        commandsMock = sinon.mock(commands);
        languagesMock = sinon.mock(vscode.languages);
    });

    afterEach(() => {
        languagesMock.restore();
        commandsMock.restore();
    });

    describe('onToggleXml ', () => {
        it('does nothing when no active document', () => {
            vscode.window.activeTextEditor = undefined;

            commands.onToggleXml();

            languagesMock.verify();
            commandsMock.verify();
        });

        it('tries to ascertain alternate filename', () => {
            vscode.window.activeTextEditor = { document: { fileName: 'notValid.json' } };
            commands.onToggleXml();

            languagesMock.verify();
            commandsMock.verify();
        });

        it('calls openFile when the document is valid', () => {
            vscode.window.activeTextEditor = { document: { fileName: 'valid.brs' } };
            commandsMock.expects('openFile').once();

            commands.onToggleXml();

            languagesMock.verify();
            commandsMock.verify();
        });
    });
});
