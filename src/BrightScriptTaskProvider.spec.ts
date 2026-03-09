import { expect } from 'chai';
import * as path from 'path';
import { createSandbox } from 'sinon';
import type { WorkspaceFolder, Task, TaskDefinition, Disposable } from 'vscode';
import Uri from 'vscode-uri';
import { BrightScriptTaskProvider } from './BrightScriptTaskProvider';
import { vscode } from './mockVscode.spec';
import { standardizePath as s } from 'brighterscript';
import * as fsExtra from 'fs-extra';

const sinon = createSandbox();
const Module = require('module');
const cwd = s`${path.dirname(path.dirname(__dirname))}`;
const tempDir = s`${cwd}/.tmp`;
const rootDir = s`${tempDir}/rootDir`;

//override the "require" call to mock certain items
const { require: oldRequire } = Module.prototype;
Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

describe('BrightScriptTaskProvider', () => {
    let taskProvider: BrightScriptTaskProvider;
    let folder: WorkspaceFolder;
    let taskProviderCallback: any;
    let taskProviderDispose: sinon.SinonStub;

    beforeEach(() => {
        fsExtra.emptyDirSync(tempDir);
        fsExtra.ensureDirSync(rootDir);

        folder = {
            uri: Uri.file(rootDir),
            name: 'test-folder',
            index: 0
        };

        vscode.workspace.workspaceFolders = [folder];

        // Setup task provider mock
        taskProviderDispose = sinon.stub();
        (vscode as any).tasks = {
            registerTaskProvider: sinon.stub().callsFake((type: string, provider: any) => {
                taskProviderCallback = provider;
                return {
                    dispose: taskProviderDispose
                } as Disposable;
            })
        };

        taskProvider = new BrightScriptTaskProvider();
    });

    afterEach(() => {
        if (taskProvider) {
            taskProvider.dispose();
        }
        fsExtra.emptyDirSync(tempDir);
        sinon.restore();
        delete (vscode as any).tasks;
    });

    describe('constructor', () => {
        it('registers a task provider for brightscript type', () => {
            expect(((vscode as any).tasks.registerTaskProvider).called).to.be.true;
            expect(((vscode as any).tasks.registerTaskProvider).firstCall.args[0]).to.equal('brightscript');
        });

        it('provides empty array from provideTasks', () => {
            const tasks = taskProviderCallback.provideTasks();
            expect(tasks).to.be.an('array').that.is.empty;
        });
    });

    describe('resolveTask', () => {
        it('returns undefined for task without command', async () => {
            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task'
            });

            const result = await taskProviderCallback.resolveTask(task);
            expect(result).to.be.undefined;
        });

        it('resolves task with simple command', async () => {
            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'npm run build'
            });

            const result = await taskProviderCallback.resolveTask(task);
            expect(result).to.not.be.undefined;
            expect(result.definition.command).to.equal('npm run build');
        });

        it('resolves ${folderForFile: **/bsconfig.json} when only one file exists', async () => {
            // Create a single bsconfig.json file
            const projectDir = path.join(rootDir, 'my-project');
            fsExtra.ensureDirSync(projectDir);
            fsExtra.writeFileSync(path.join(projectDir, 'bsconfig.json'), '{}');

            (vscode.workspace as any).findFiles = sinon.stub().resolves([
                Uri.file(path.join(projectDir, 'bsconfig.json'))
            ]);
            (vscode.workspace as any).getWorkspaceFolder = sinon.stub().returns(folder);

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'cd ${folderForFile: **/bsconfig.json} && npm run build'
            });

            const result = await taskProviderCallback.resolveTask(task);
            expect(result).to.not.be.undefined;
            expect(result.execution.commandLine).to.include(projectDir);
            expect(result.execution.commandLine).to.not.include('${folderForFile');
        });

        it('resolves ${folderForFile: **/bsconfig.json} when user selects from multiple files', async () => {
            // Create multiple bsconfig.json files
            const projectDir1 = path.join(rootDir, 'project1');
            const projectDir2 = path.join(rootDir, 'project2');
            fsExtra.ensureDirSync(projectDir1);
            fsExtra.ensureDirSync(projectDir2);
            fsExtra.writeFileSync(path.join(projectDir1, 'bsconfig.json'), '{}');
            fsExtra.writeFileSync(path.join(projectDir2, 'bsconfig.json'), '{}');

            (vscode.workspace as any).findFiles = sinon.stub().resolves([
                Uri.file(path.join(projectDir1, 'bsconfig.json')),
                Uri.file(path.join(projectDir2, 'bsconfig.json'))
            ]);
            (vscode.workspace as any).getWorkspaceFolder = sinon.stub().returns(folder);
            const showQuickPickStub = sinon.stub(vscode.window, 'showQuickPick').resolves('project1');

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'cd ${folderForFile: **/bsconfig.json} && npm run build'
            });

            const result = await taskProviderCallback.resolveTask(task);
            expect(result).to.not.be.undefined;
            expect(result.execution.commandLine).to.include(projectDir1);
            expect(result.execution.commandLine).to.not.include('${folderForFile');
            expect(showQuickPickStub.called).to.be.true;
        });

        it('returns undefined when user cancels ${folderForFile} selection', async () => {
            // Create multiple bsconfig.json files
            const projectDir1 = path.join(rootDir, 'project1');
            const projectDir2 = path.join(rootDir, 'project2');
            fsExtra.ensureDirSync(projectDir1);
            fsExtra.ensureDirSync(projectDir2);
            fsExtra.writeFileSync(path.join(projectDir1, 'bsconfig.json'), '{}');
            fsExtra.writeFileSync(path.join(projectDir2, 'bsconfig.json'), '{}');

            (vscode.workspace as any).findFiles = sinon.stub().resolves([
                Uri.file(path.join(projectDir1, 'bsconfig.json')),
                Uri.file(path.join(projectDir2, 'bsconfig.json'))
            ]);
            (vscode.workspace as any).getWorkspaceFolder = sinon.stub().returns(folder);
            const showQuickPickStub = sinon.stub(vscode.window, 'showQuickPick').resolves(undefined);

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'cd ${folderForFile: **/bsconfig.json} && npm run build'
            });

            const result = await taskProviderCallback.resolveTask(task);
            expect(result).to.be.undefined;
            expect(showQuickPickStub.called).to.be.true;
        });

        it('returns undefined when no files match ${folderForFile} pattern', async () => {
            (vscode.workspace as any).findFiles = sinon.stub().resolves([]);
            const showWarningStub = sinon.stub(vscode.window, 'showWarningMessage');

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'cd ${folderForFile: **/bsconfig.json} && npm run build'
            });

            const result = await taskProviderCallback.resolveTask(task);
            expect(result).to.be.undefined;
            expect(showWarningStub.called).to.be.true;
        });

        it('resolves ${folderForFile} with spaces in pattern', async () => {
            // Create a bsconfig.json file
            const projectDir = path.join(rootDir, 'my-project');
            fsExtra.ensureDirSync(projectDir);
            fsExtra.writeFileSync(path.join(projectDir, 'bsconfig.json'), '{}');

            (vscode.workspace as any).findFiles = sinon.stub().resolves([
                Uri.file(path.join(projectDir, 'bsconfig.json'))
            ]);
            (vscode.workspace as any).getWorkspaceFolder = sinon.stub().returns(folder);

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'cd ${folderForFile:   **/bsconfig.json  } && npm run build'
            });

            const result = await taskProviderCallback.resolveTask(task);
            expect(result).to.not.be.undefined;
            expect(result.execution.commandLine).to.include(projectDir);
            expect(result.execution.commandLine).to.not.include('${folderForFile');
        });

        it('resolves multiple ${folderForFile} variables in same command', async () => {
            // Create files for both patterns
            const bsconfigDir = path.join(rootDir, 'project1');
            const packageDir = path.join(rootDir, 'project2');
            fsExtra.ensureDirSync(bsconfigDir);
            fsExtra.ensureDirSync(packageDir);
            fsExtra.writeFileSync(path.join(bsconfigDir, 'bsconfig.json'), '{}');
            fsExtra.writeFileSync(path.join(packageDir, 'package.json'), '{}');

            const findFilesStub = sinon.stub();
            findFilesStub.onFirstCall().resolves([Uri.file(path.join(bsconfigDir, 'bsconfig.json'))]);
            findFilesStub.onSecondCall().resolves([Uri.file(path.join(packageDir, 'package.json'))]);
            (vscode.workspace as any).findFiles = findFilesStub;
            (vscode.workspace as any).getWorkspaceFolder = sinon.stub().returns(folder);

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'cd ${folderForFile: **/bsconfig.json} && cd ${folderForFile: **/package.json} && npm run build'
            });

            const result = await taskProviderCallback.resolveTask(task);
            expect(result).to.not.be.undefined;
            expect(result.execution.commandLine).to.include(bsconfigDir);
            expect(result.execution.commandLine).to.include(packageDir);
            expect(result.execution.commandLine).to.not.include('${folderForFile');
        });

        it('resolves ${folderForFile} for root directory when file is at root', async () => {
            // Create bsconfig.json at root
            fsExtra.writeFileSync(path.join(rootDir, 'bsconfig.json'), '{}');

            (vscode.workspace as any).findFiles = sinon.stub().resolves([
                Uri.file(path.join(rootDir, 'bsconfig.json'))
            ]);
            (vscode.workspace as any).getWorkspaceFolder = sinon.stub().returns(folder);

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'cd ${folderForFile: **/bsconfig.json} && npm run build'
            });

            const result = await taskProviderCallback.resolveTask(task);
            expect(result).to.not.be.undefined;
            expect(result.execution.commandLine).to.include(rootDir);
            expect(result.execution.commandLine).to.not.include('${folderForFile');
        });
    });

    describe('dispose', () => {
        it('disposes the task provider', () => {
            expect(taskProviderDispose.called).to.be.false;
            taskProvider.dispose();
            expect(taskProviderDispose.called).to.be.true;
        });
    });

    /**
     * Helper function to create a mock task
     */
    function createMockTask(definition: TaskDefinition): Task {
        return {
            definition: definition,
            scope: folder,
            name: definition.task || 'test-task',
            source: 'brightscript',
            execution: undefined,
            isBackground: false,
            presentationOptions: {},
            problemMatchers: [],
            runOptions: {},
            detail: undefined
        } as Task;
    }
});
