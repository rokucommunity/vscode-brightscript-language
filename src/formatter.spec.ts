import { expect } from 'chai';
import * as sinon from 'sinon';
import * as fsExtra from 'fs-extra';
import { standardizePath as s } from 'brighterscript';
import { vscode } from './mockVscode.spec';
import type { FormattingOptions } from 'brighterscript-formatter';
import { Formatter as BrighterScriptFormatter } from 'brighterscript-formatter';

let Module = require('module');

//override the "require" call to mock certain items
const { require: oldRequire } = Module.prototype;

Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

import { Formatter } from './formatter';

describe('Formatter', () => {
    let sandbox: sinon.SinonSandbox;
    let tempDir: string;
    let formatter: Formatter;
    let customFormattingOptions: FormattingOptions = {
        keywordCase: 'upper',
        formatIndent: true
    };

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        tempDir = s`${process.cwd()}/.tmp/formatter-tests`;
        fsExtra.ensureDirSync(tempDir);
        formatter = new Formatter();
    });

    afterEach(() => {
        sandbox.restore();
        if (fsExtra.pathExistsSync(tempDir)) {
            fsExtra.removeSync(tempDir);
        }
        // Clean up vscode workspace state
        vscode.workspace.workspaceFolders = [];
        vscode.workspace._configuration = {};
    });

    /**
     * Helper to create a mock document
     */
    function createMockDocument(uri: string, text: string) {
        const lines = text.split(/\r?\n/);
        return {
            uri: vscode.Uri.file(uri),
            getText: () => text,
            lineAt: (lineNumber: number) => ({
                text: lines[lineNumber] || ''
            }),
            validateRange: (range) => range
        };
    }

    /**
     * Helper to create a mock range
     */
    function createMockRange(startLine: number, endLine: number) {
        return {
            start: { line: startLine, character: 0 },
            end: { line: endLine, character: 0 }
        } as any;
    }

    /**
     * Helper to create formatting options
     */
    function createMockFormattingOptions() {
        return {
            tabSize: 4,
            insertSpaces: true
        };
    }

    /**
     * Helper to test formatter with various configurations
     */
    async function doTest(options: {
        /** Name for the workspace folder */
        workspaceName: string;
        /** Optional config files to create. Key is path relative to workspace, value is the config content */
        configFiles?: Record<string, any>;
        /** VS Code workspace configuration settings */
        vscodeConfig?: Record<string, any>;
        /** Source text to format */
        sourceText: string;
        /** Expected formatting options that should be applied */
        expectedFormattingOptions: FormattingOptions;
        /** Optional custom verification function */
        customVerify?: (edits: any[]) => void;
    }) {
        const workspaceFolder = s`${tempDir}/${options.workspaceName}`;
        fsExtra.ensureDirSync(workspaceFolder);

        // Create any config files
        if (options.configFiles) {
            for (const [relativePath, content] of Object.entries(options.configFiles)) {
                const fullPath = s`${workspaceFolder}/${relativePath}`;
                fsExtra.ensureDirSync(s`${fullPath}/..`);
                fsExtra.writeJsonSync(fullPath, content);
            }
        }

        // Set up workspace
        vscode.workspace.workspaceFolders = [{
            uri: vscode.Uri.file(workspaceFolder),
            name: options.workspaceName,
            index: 0
        }];

        sandbox.stub(vscode.workspace, 'getWorkspaceFolder').returns(vscode.workspace.workspaceFolders[0]);

        // Apply VS Code configuration
        vscode.workspace._configuration = options.vscodeConfig || {};

        // Create document and format
        const document = createMockDocument(
            s`${workspaceFolder}/source/main.brs`,
            options.sourceText
        );
        const lineCount = options.sourceText.split('\n').length;
        const range = createMockRange(0, lineCount - 1);
        const formattingOptions = createMockFormattingOptions();

        const edits = await formatter.provideDocumentRangeFormattingEdits(document as any, range, formattingOptions as any);

        // Custom verification or default verification
        if (options.customVerify) {
            options.customVerify(edits);
        } else {
            expect(edits).to.exist;
            expect(edits.length).to.be.greaterThan(0);

            // Format with expected settings and compare
            const bsFormatter = new BrighterScriptFormatter();
            const expectedFormatted = bsFormatter.format(options.sourceText, options.expectedFormattingOptions);
            const actualFormatted = edits.map(e => e.newText).join('\n');
            expect(actualFormatted).to.equal(expectedFormatted);
        }
    }

    describe('settings resolution', () => {
        it('uses default settings when no config file found', async () => {
            await doTest({
                workspaceName: 'workspace1',
                vscodeConfig: {
                    'brightscript.format.keywordCase': 'lower',
                    'brightscript.format.formatIndent': true
                },
                sourceText: 'SUB Main()\nPRINT "hello"\nEND SUB',
                expectedFormattingOptions: {}
            });
        });

        it('uses bsfmt.json found at root folder', async () => {
            await doTest({
                workspaceName: 'workspace2',
                configFiles: {
                    'bsfmt.json': customFormattingOptions
                },
                vscodeConfig: {
                    'brightscript.format.keywordCase': 'lower'
                },
                sourceText: 'sub main()\nprint "hello"\nend sub',
                expectedFormattingOptions: { ...customFormattingOptions }
            });
        });

        it('reads brightscript.format.bsfmtPath from workspace settings', async () => {
            const customConfigFolder = s`${tempDir}/custom-config`;
            fsExtra.ensureDirSync(customConfigFolder);

            // Create a custom config file in a different location
            const customBsfmtPath = s`${customConfigFolder}/my-custom-bsfmt.json`;
            fsExtra.writeJsonSync(customBsfmtPath, customFormattingOptions);

            await doTest({
                workspaceName: 'workspace3',
                vscodeConfig: {
                    'brightscript.format.bsfmtPath': customBsfmtPath,
                    'brightscript.format.keywordCase': 'lower'
                },
                sourceText: 'sub main()\nprint "hello"\nend sub',
                expectedFormattingOptions: { ...customFormattingOptions }
            });
        });

        it('reads brightscript.format.bsfmtPath as relative path from workspace', async () => {
            await doTest({
                workspaceName: 'workspace4',
                configFiles: {
                    '.vscode/custom-bsfmt.json': customFormattingOptions
                },
                vscodeConfig: {
                    'brightscript.format.bsfmtPath': '.vscode/custom-bsfmt.json'
                },
                sourceText: 'sub main()\nelse if true\nend if\nend sub',
                expectedFormattingOptions: { ...customFormattingOptions }
            });
        });

        it('prioritizes bsfmtPath setting over default bsfmt.json in workspace', async () => {
            const defaultConfig: FormattingOptions = {
                keywordCase: 'lower'
            };

            await doTest({
                workspaceName: 'workspace5',
                configFiles: {
                    'bsfmt.json': defaultConfig,
                    'config/custom-bsfmt.json': customFormattingOptions
                },
                vscodeConfig: {
                    'brightscript.format.bsfmtPath': 'config/custom-bsfmt.json'
                },
                sourceText: 'sub main()\nend sub',
                expectedFormattingOptions: { ...customFormattingOptions }
            });
        });

        it('handles error when custom bsfmtPath does not exist', async () => {
            const errorStub = sandbox.stub(vscode.window, 'showErrorMessage');

            await doTest({
                workspaceName: 'workspace6',
                vscodeConfig: {
                    'brightscript.format.bsfmtPath': 'non-existent-config.json'
                },
                sourceText: 'sub main()\nend sub',
                expectedFormattingOptions: {},
                customVerify: () => {
                    // The getBsfmtOptions throws an error when custom bsfmtPath doesn't exist
                    // This gets caught in the try-catch block and shown to the user
                    expect(errorStub.called).to.be.true;
                    expect(errorStub.firstCall.args[0]).to.include('does not exist');
                }
            });
        });
    });
});
