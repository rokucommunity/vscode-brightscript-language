import { expect } from 'chai';
import * as path from 'path';
import { createSandbox } from 'sinon';
import type { WorkspaceFolder, Task, TaskDefinition, Disposable, TaskScope } from 'vscode';
import Uri from 'vscode-uri';
import { BrightScriptTaskProvider } from './BrightScriptTaskProvider';
import { vscode } from './mockVscode.spec';
import { standardizePath as s } from 'brighterscript';
import * as fsExtra from 'fs-extra';
import { EventEmitter } from 'events';

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
        sinon.stub(vscode.tasks, 'registerTaskProvider').callsFake((type: string, provider: any) => {
            taskProviderCallback = provider;
            return {
                dispose: taskProviderDispose
            } as Disposable;
        });

        taskProvider = new BrightScriptTaskProvider();
    });

    afterEach(() => {
        if (taskProvider) {
            taskProvider.dispose();
        }
        fsExtra.emptyDirSync(tempDir);
        sinon.restore();
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
            sinon.stub(vscode.workspace, 'getWorkspaceFolder').returns(folder);

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'cd ${folderForFile: **/bsconfig.json} && npm run build'
            });

            const result = await taskProviderCallback.resolveTask(task);
            expect(result).to.not.be.undefined;
            // Variable resolution happens inside pseudoterminal, not in resolveTask
            expect(result.definition.command).to.include('${folderForFile');
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
            sinon.stub(vscode.workspace, 'getWorkspaceFolder').returns(folder);
            sinon.stub(vscode.window, 'showQuickPick').resolves('project1');

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'cd ${folderForFile: **/bsconfig.json} && npm run build'
            });

            const result = await taskProviderCallback.resolveTask(task);
            expect(result).to.not.be.undefined;
            // Variable resolution happens inside pseudoterminal, not in resolveTask
            expect(result.definition.command).to.include('${folderForFile');
        });

        it('returns task when user cancels ${folderForFile} selection (cancellation handled at runtime)', async () => {
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
            sinon.stub(vscode.workspace, 'getWorkspaceFolder').returns(folder);
            sinon.stub(vscode.window, 'showQuickPick').resolves(undefined);

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'cd ${folderForFile: **/bsconfig.json} && npm run build'
            });

            const result = await taskProviderCallback.resolveTask(task);
            // ResolveTask still returns a task; cancellation is handled when the task runs
            expect(result).to.not.be.undefined;
        });

        it('returns task when no files match ${folderForFile} pattern (error shown at runtime)', async () => {
            (vscode.workspace as any).findFiles = sinon.stub().resolves([]);
            sinon.stub(vscode.window, 'showWarningMessage');

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'cd ${folderForFile: **/bsconfig.json} && npm run build'
            });

            const result = await taskProviderCallback.resolveTask(task);
            // ResolveTask still returns a task; error is shown when the task runs
            expect(result).to.not.be.undefined;
        });

        it('resolves ${folderForFile} with spaces in pattern', async () => {
            // Create a bsconfig.json file
            const projectDir = path.join(rootDir, 'my-project');
            fsExtra.ensureDirSync(projectDir);
            fsExtra.writeFileSync(path.join(projectDir, 'bsconfig.json'), '{}');

            (vscode.workspace as any).findFiles = sinon.stub().resolves([
                Uri.file(path.join(projectDir, 'bsconfig.json'))
            ]);
            sinon.stub(vscode.workspace, 'getWorkspaceFolder').returns(folder);

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'cd ${folderForFile:   **/bsconfig.json  } && npm run build'
            });

            const result = await taskProviderCallback.resolveTask(task);
            expect(result).to.not.be.undefined;
            // Variable resolution happens inside pseudoterminal, not in resolveTask
            expect(result.definition.command).to.include('${folderForFile');
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
            sinon.stub(vscode.workspace, 'getWorkspaceFolder').returns(folder);

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'cd ${folderForFile: **/bsconfig.json} && cd ${folderForFile: **/package.json} && npm run build'
            });

            const result = await taskProviderCallback.resolveTask(task);
            expect(result).to.not.be.undefined;
            // Variable resolution happens inside pseudoterminal, not in resolveTask
            expect(result.definition.command).to.include('${folderForFile');
        });

        it('resolves ${folderForFile} for root directory when file is at root', async () => {
            // Create bsconfig.json at root
            fsExtra.writeFileSync(path.join(rootDir, 'bsconfig.json'), '{}');

            (vscode.workspace as any).findFiles = sinon.stub().resolves([
                Uri.file(path.join(rootDir, 'bsconfig.json'))
            ]);
            sinon.stub(vscode.workspace, 'getWorkspaceFolder').returns(folder);

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'cd ${folderForFile: **/bsconfig.json} && npm run build'
            });

            const result = await taskProviderCallback.resolveTask(task);
            expect(result).to.not.be.undefined;
            // Variable resolution happens inside pseudoterminal, not in resolveTask
            expect(result.definition.command).to.include('${folderForFile');
        });
    });

    describe('dispose', () => {
        it('disposes the task provider', () => {
            expect(taskProviderDispose.called).to.be.false;
            taskProvider.dispose();
            expect(taskProviderDispose.called).to.be.true;
        });
    });

    describe('createPseudoterminal', () => {
        let childProcessStub: any;
        let mockProcess: EventEmitter;
        let mockStdout: EventEmitter;
        let mockStderr: EventEmitter;
        let originalPlatform: string;

        beforeEach(() => {
            originalPlatform = process.platform;

            // Create mock process with stdout/stderr
            mockStdout = new EventEmitter();
            mockStderr = new EventEmitter();
            mockProcess = new EventEmitter();
            (mockProcess as any).stdout = mockStdout;
            (mockProcess as any).stderr = mockStderr;
            (mockProcess as any).kill = sinon.stub();
            (mockProcess as any).killed = false;

            // Mock child_process.spawn
            const childProcessModule = require('child_process');
            childProcessStub = sinon.stub(childProcessModule, 'spawn').returns(mockProcess);
        });

        afterEach(() => {
            childProcessStub.restore();
            Object.defineProperty(process, 'platform', { value: originalPlatform });
        });

        it('creates pseudoterminal with correct lifecycle', async () => {
            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo "hello"'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            expect(resolvedTask).to.not.be.undefined;

            // Get the pseudoterminal by calling the execution callback
            const pty = await (resolvedTask.execution).callback();

            expect(pty).to.have.property('onDidWrite');
            expect(pty).to.have.property('onDidClose');
            expect(pty).to.have.property('open');
            expect(pty).to.have.property('close');
        });

        it('executes command and streams stdout output', async () => {
            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo "hello"'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            const outputs: string[] = [];
            pty.onDidWrite((data: string) => {
                outputs.push(data);
            });

            // Start the pseudoterminal
            await pty.open();

            // Verify spawn was called
            expect(childProcessStub.called).to.be.true;

            // Simulate stdout data
            mockStdout.emit('data', Buffer.from('hello world'));

            // Verify output was captured
            expect(outputs.some(o => o.includes('hello world'))).to.be.true;
        });

        it('executes command and streams stderr output', async () => {
            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo "error" >&2'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            const outputs: string[] = [];
            pty.onDidWrite((data: string) => {
                outputs.push(data);
            });

            await pty.open();

            // Simulate stderr data
            mockStderr.emit('data', Buffer.from('error message'));

            // Verify error output was captured
            expect(outputs.some(o => o.includes('error message'))).to.be.true;
        });

        it('fires close event with exit code on process exit', async () => {
            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'npm run build'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            let exitCode: number | undefined;
            pty.onDidClose((code: number) => {
                exitCode = code;
            });

            await pty.open();

            // Simulate process exit with code 0
            mockProcess.emit('exit', 0);

            expect(exitCode).to.equal(0);
        });

        it('handles non-zero exit codes', async () => {
            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'exit 1'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            let exitCode: number | undefined;
            pty.onDidClose((code: number) => {
                exitCode = code;
            });

            await pty.open();

            // Simulate process exit with error code
            mockProcess.emit('exit', 1);

            expect(exitCode).to.equal(1);
        });

        it('handles process error events', async () => {
            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'invalid-command'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            const outputs: string[] = [];
            let exitCode: number | undefined;

            pty.onDidWrite((data: string) => {
                outputs.push(data);
            });
            pty.onDidClose((code: number) => {
                exitCode = code;
            });

            await pty.open();

            // Simulate process error
            const error = new Error('Command not found');
            mockProcess.emit('error', error);

            // Verify error was written and exited with code 1
            expect(outputs.some(o => o.includes('Error executing command'))).to.be.true;
            expect(outputs.some(o => o.includes('Command not found'))).to.be.true;
            expect(exitCode).to.equal(1);
        });

        it('handles user cancellation during variable resolution', async () => {
            // Create multiple bsconfig.json files to trigger picker
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
            sinon.stub(vscode.workspace, 'getWorkspaceFolder').returns(folder);
            sinon.stub(vscode.window, 'showQuickPick').resolves(undefined);

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'cd ${folderForFile: **/bsconfig.json} && npm run build'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            const outputs: string[] = [];
            let exitCode: number | undefined;

            pty.onDidWrite((data: string) => {
                outputs.push(data);
            });
            pty.onDidClose((code: number) => {
                exitCode = code;
            });

            await pty.open();

            // Verify error message for user cancellation and exit code
            expect(outputs.some(o => o.includes('Task failed: error resolving command variables'))).to.be.true;
            expect(outputs.some(o => o.includes('User cancelled folder selection'))).to.be.true;
            expect(exitCode).to.equal(1);
            // spawn should not have been called since user cancelled
            expect(childProcessStub.called).to.be.false;
        });

        it('exits with code 1 when no files found for ${folderForFile} variable', async () => {
            // Mock findFiles to return empty array (no files found)
            (vscode.workspace as any).findFiles = sinon.stub().resolves([]);
            sinon.stub(vscode.window, 'showWarningMessage');

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'cd ${folderForFile: **/bsconfig.json} && npm run build'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            const outputs: string[] = [];
            let exitCode: number | undefined;

            pty.onDidWrite((data: string) => {
                outputs.push(data);
            });
            pty.onDidClose((code: number) => {
                exitCode = code;
            });

            await pty.open();

            // Verify warning was shown
            expect((vscode.window.showWarningMessage as any).called).to.be.true;
            expect((vscode.window.showWarningMessage as any).firstCall.args[0]).to.include('No files found matching pattern');

            // Verify task failed with error message and exited with code 1
            expect(outputs.some(o => o.includes('Task failed: error resolving command variables'))).to.be.true;
            expect(outputs.some(o => o.includes('No files found matching pattern'))).to.be.true;
            expect(exitCode).to.equal(1);
            // spawn should not have been called since no files were found
            expect(childProcessStub.called).to.be.false;
        });

        it('exits with code 1 when resolveCommandVariables throws an error', async () => {
            // Create a bsconfig.json file
            const projectDir = path.join(rootDir, 'project1');
            fsExtra.ensureDirSync(projectDir);
            fsExtra.writeFileSync(path.join(projectDir, 'bsconfig.json'), '{}');

            // Mock findFiles to throw an error during variable resolution
            (vscode.workspace as any).findFiles = sinon.stub().rejects(new Error('File system error'));

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'cd ${folderForFile: **/bsconfig.json} && npm run build'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            const outputs: string[] = [];
            let exitCode: number | undefined;

            pty.onDidWrite((data: string) => {
                outputs.push(data);
            });
            pty.onDidClose((code: number) => {
                exitCode = code;
            });

            await pty.open();

            // Verify error message contains the error details
            expect(outputs.some(o => o.includes('Task failed: error resolving command variables'))).to.be.true;
            expect(outputs.some(o => o.includes('File system error'))).to.be.true;
            expect(exitCode).to.equal(1);
            // spawn should not have been called since resolution failed
            expect(childProcessStub.called).to.be.false;
        });

        it('kills process when pseudoterminal is closed', async () => {
            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'long-running-process'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            // Process should have been spawned
            expect(childProcessStub.called).to.be.true;

            // Close the pseudoterminal
            pty.close();

            // Verify kill was called
            expect((mockProcess as any).kill.called).to.be.true;
        });

        it('does not kill already-killed process on close', async () => {
            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo "done"'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            // Mark process as killed
            (mockProcess as any).killed = true;

            // Close the pseudoterminal
            pty.close();

            // Verify kill was NOT called
            expect((mockProcess as any).kill.called).to.be.false;
        });

        it('displays command and working directory in output', async () => {
            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'npm run build'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            const outputs: string[] = [];
            pty.onDidWrite((data: string) => {
                outputs.push(data);
            });

            await pty.open();

            // Verify execution message was displayed
            expect(outputs.some(o => o.includes('Executing task'))).to.be.true;
            expect(outputs.some(o => o.includes('npm run build'))).to.be.true;
        });
    });

    describe('getShellConfiguration', () => {
        let originalPlatform: string;
        let configStub: any;
        let childProcessStub: any;
        let mockProcess: EventEmitter;
        let mockStdout: EventEmitter;
        let mockStderr: EventEmitter;

        beforeEach(() => {
            originalPlatform = process.platform;

            // Create mock process with stdout/stderr
            mockStdout = new EventEmitter();
            mockStderr = new EventEmitter();
            mockProcess = new EventEmitter();
            (mockProcess as any).stdout = mockStdout;
            (mockProcess as any).stderr = mockStderr;
            (mockProcess as any).kill = sinon.stub();
            (mockProcess as any).killed = false;

            // Mock child_process.spawn
            const childProcessModule = require('child_process');
            childProcessStub = sinon.stub(childProcessModule, 'spawn').returns(mockProcess);

            // Mock workspace configuration
            configStub = {
                get: sinon.stub()
            };
            sinon.stub(vscode.workspace, 'getConfiguration').returns(configStub);
        });

        afterEach(() => {
            childProcessStub.restore();
            Object.defineProperty(process, 'platform', { value: originalPlatform });
            sinon.restore();
        });

        it('returns Windows shell configuration on win32', async () => {
            Object.defineProperty(process, 'platform', { value: 'win32' });

            configStub.get.withArgs('shell.windows').returns('powershell.exe');
            configStub.get.withArgs('env.windows').returns({ CUSTOM_VAR: 'value' });

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo "test"'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);

            expect(spawnCall.args[2].shell).to.equal('powershell.exe');
            expect(spawnCall.args[2].env).to.include({ CUSTOM_VAR: 'value' });
        });

        it('uses default shell on Windows when not configured', async () => {
            Object.defineProperty(process, 'platform', { value: 'win32' });

            configStub.get.withArgs('shell.windows').returns(undefined);
            configStub.get.withArgs('env.windows').returns({});

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo "test"'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);

            // Should use true to let Node.js choose
            expect(spawnCall.args[2].shell).to.equal(true);
        });

        it('returns macOS shell configuration on darwin', async () => {
            Object.defineProperty(process, 'platform', { value: 'darwin' });

            configStub.get.withArgs('shell.osx').returns('/bin/zsh');
            configStub.get.withArgs('env.osx').returns({ PATH: '/custom/path' });

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo "test"'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);

            expect(spawnCall.args[2].shell).to.equal('/bin/zsh');
            expect(spawnCall.args[2].env).to.include({ PATH: '/custom/path' });
        });

        it('uses default zsh on macOS when not configured', async () => {
            Object.defineProperty(process, 'platform', { value: 'darwin' });

            configStub.get.withArgs('shell.osx').returns(undefined);
            configStub.get.withArgs('env.osx').returns({});

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo "test"'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);

            expect(spawnCall.args[2].shell).to.equal('/bin/zsh');
        });

        it('returns Linux shell configuration', async () => {
            Object.defineProperty(process, 'platform', { value: 'linux' });

            configStub.get.withArgs('shell.linux').returns('/bin/bash');
            configStub.get.withArgs('env.linux').returns({ LANG: 'en_US.UTF-8' });

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo "test"'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);

            expect(spawnCall.args[2].shell).to.equal('/bin/bash');
            expect(spawnCall.args[2].env).to.include({ LANG: 'en_US.UTF-8' });
        });

        it('uses default bash on Linux when not configured', async () => {
            Object.defineProperty(process, 'platform', { value: 'linux' });

            configStub.get.withArgs('shell.linux').returns(undefined);
            configStub.get.withArgs('env.linux').returns({});

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo "test"'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);

            expect(spawnCall.args[2].shell).to.equal('/bin/bash');
        });
    });

    describe('task options and environment merging', () => {
        let configStub: any;
        let childProcessStub: any;
        let mockProcess: EventEmitter;
        let mockStdout: EventEmitter;
        let mockStderr: EventEmitter;
        let originalPlatform: string;

        beforeEach(() => {
            originalPlatform = process.platform;
            // Create mock process with stdout/stderr
            mockStdout = new EventEmitter();
            mockStderr = new EventEmitter();
            mockProcess = new EventEmitter();
            (mockProcess as any).stdout = mockStdout;
            (mockProcess as any).stderr = mockStderr;
            (mockProcess as any).kill = sinon.stub();
            (mockProcess as any).killed = false;

            // Mock child_process.spawn
            const childProcessModule = require('child_process');
            childProcessStub = sinon.stub(childProcessModule, 'spawn').returns(mockProcess);

            // Mock workspace configuration
            configStub = {
                get: sinon.stub().returns(undefined)
            };
            sinon.stub(vscode.workspace, 'getConfiguration').returns(configStub);
        });

        afterEach(() => {
            Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
            childProcessStub.restore();
            sinon.restore();
        });

        it('merges environment variables with correct precedence', async () => {
            // Ensure we're on macOS for this test
            Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

            // Set up user settings environment
            configStub.get.withArgs('env.osx').returns({
                USER_SETTING: 'from-settings',
                SHARED_VAR: 'from-settings'
            });

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo "test"',
                options: {
                    env: {
                        TASK_VAR: 'from-task',
                        SHARED_VAR: 'from-task'
                    }
                }
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);
            const env = spawnCall.args[2].env;

            // Task options should override user settings
            expect(env.TASK_VAR).to.equal('from-task');
            expect(env.SHARED_VAR).to.equal('from-task');
            expect(env.USER_SETTING).to.equal('from-settings');
            // Process env should be included (PATH on Unix, Path on Windows)
            const pathKey = Object.keys(env).find(x => x?.toLowerCase() === 'path');
            expect(env[pathKey]).to.exist;
        });

        it('uses task shell option over user setting on macOS', async () => {
            Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
            configStub.get.withArgs('shell.osx').returns('/bin/zsh');

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo "test"',
                options: {
                    shell: {
                        executable: '/bin/bash'
                    }
                }
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);

            // Task shell should override user setting
            expect(spawnCall.args[2].shell).to.equal('/bin/bash');
        });

        it('uses task shell option over user setting on Windows', async () => {
            Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
            configStub.get.withArgs('shell.windows').returns('powershell.exe');

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo "test"',
                options: {
                    shell: {
                        executable: 'cmd.exe'
                    }
                }
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);

            // Task shell should override user setting
            expect(spawnCall.args[2].shell).to.equal('cmd.exe');
        });

        it('uses task shell option over user setting on Linux', async () => {
            Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
            configStub.get.withArgs('shell.linux').returns('/bin/bash');

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo "test"',
                options: {
                    shell: {
                        executable: '/bin/sh'
                    }
                }
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);

            // Task shell should override user setting
            expect(spawnCall.args[2].shell).to.equal('/bin/sh');
        });

        it('uses task cwd option over workspace folder', async () => {
            const customCwd = path.join(rootDir, 'custom-dir');
            fsExtra.ensureDirSync(customCwd);

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo "test"',
                options: {
                    cwd: customCwd
                }
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);

            expect(spawnCall.args[2].cwd).to.equal(customCwd);
        });

        it('uses workspace folder when no cwd option specified', async () => {
            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo "test"'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);

            expect(spawnCall.args[2].cwd).to.equal(rootDir);
        });

        it('handles empty task options', async () => {
            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo "test"'
                // No options specified
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            // Should not throw and should use defaults
            expect(childProcessStub.called).to.be.true;
        });
    });

    describe('getWorkspaceFolderFromScope', () => {
        let childProcessStub: any;
        let mockProcess: EventEmitter;
        let mockStdout: EventEmitter;
        let mockStderr: EventEmitter;

        beforeEach(() => {
            // Create mock process with stdout/stderr
            mockStdout = new EventEmitter();
            mockStderr = new EventEmitter();
            mockProcess = new EventEmitter();
            (mockProcess as any).stdout = mockStdout;
            (mockProcess as any).stderr = mockStderr;
            (mockProcess as any).kill = sinon.stub();
            (mockProcess as any).killed = false;

            // Mock child_process.spawn
            const childProcessModule = require('child_process');
            childProcessStub = sinon.stub(childProcessModule, 'spawn').returns(mockProcess);
        });

        afterEach(() => {
            childProcessStub.restore();
        });

        it('returns the workspace folder when scope is already a WorkspaceFolder', async () => {
            const customFolder: WorkspaceFolder = {
                uri: Uri.file(path.join(rootDir, 'custom-folder')),
                name: 'custom-folder',
                index: 1
            };

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo "test"'
            }, customFolder);

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            const outputs: string[] = [];
            pty.onDidWrite((data: string) => {
                outputs.push(data);
            });

            await pty.open();

            // Should use the custom folder's path
            expect(outputs.some(o => o.includes('custom-folder'))).to.be.true;

            const spawnCall = childProcessStub.getCall(0);
            expect(spawnCall.args[2].cwd).to.equal(customFolder.uri.fsPath);
        });

        it('exits with code 1 when there are no workspace folders', async () => {
            vscode.workspace.workspaceFolders = [];

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo "test"'
            }, vscode.TaskScope.Workspace);

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            const outputs: string[] = [];
            let exitCode: number | undefined;

            pty.onDidWrite((data: string) => {
                outputs.push(data);
            });
            pty.onDidClose((code: number) => {
                exitCode = code;
            });

            await pty.open();

            // Task should fail when no workspace folders exist
            expect(outputs.some(o => o.includes('Task cancelled: no workspace folder selected'))).to.be.true;
            expect(exitCode).to.equal(1);
            // spawn should not have been called since task failed early
            expect(childProcessStub.called).to.be.false;
        });

        it('returns the single workspace folder when there is only one', async () => {
            // Already set to single folder in beforeEach
            expect(vscode.workspace.workspaceFolders).to.have.lengthOf(1);

            const quickPickSpy = sinon.spy(vscode.window, 'showQuickPick');

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo "test"'
            }, vscode.TaskScope.Workspace);

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);
            expect(spawnCall.args[2].cwd).to.equal(folder.uri.fsPath);

            // showQuickPick should NOT have been called
            expect(quickPickSpy.called).to.be.false;
            quickPickSpy.restore();
        });

        it('shows a picker and returns selected folder when there are multiple workspace folders', async () => {
            const folder2: WorkspaceFolder = {
                uri: Uri.file(path.join(rootDir, 'folder2')),
                name: 'folder2',
                index: 1
            };
            vscode.workspace.workspaceFolders = [folder, folder2];

            const workspaceFolderPickStub = sinon.stub(vscode.window, 'showWorkspaceFolderPick').resolves(folder2);

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo "test"'
            }, vscode.TaskScope.Workspace);

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            // Verify picker was shown
            expect(workspaceFolderPickStub.called).to.be.true;

            // Verify the selected folder was used
            const spawnCall = childProcessStub.getCall(0);
            expect(spawnCall.args[2].cwd).to.equal(folder2.uri.fsPath);
        });

        it('handles user cancellation when picking from multiple folders', async () => {
            const folder2: WorkspaceFolder = {
                uri: Uri.file(path.join(rootDir, 'folder2')),
                name: 'folder2',
                index: 1
            };
            vscode.workspace.workspaceFolders = [folder, folder2];

            sinon.stub(vscode.window, 'showWorkspaceFolderPick').resolves(undefined);

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo "test"'
            }, vscode.TaskScope.Workspace);

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            const outputs: string[] = [];
            let exitCode: number | undefined;

            pty.onDidWrite((data: string) => {
                outputs.push(data);
            });
            pty.onDidClose((code: number) => {
                exitCode = code;
            });

            await pty.open();

            // Verify cancellation message
            expect(outputs.some(o => o.includes('Task cancelled: no workspace folder selected'))).to.be.true;
            expect(exitCode).to.equal(1);

            // spawn should not have been called since user cancelled
            expect(childProcessStub.called).to.be.false;
        });
    });

    describe('cwd precedence', () => {
        let childProcessStub: any;
        let mockProcess: EventEmitter;
        let mockStdout: EventEmitter;
        let mockStderr: EventEmitter;

        beforeEach(() => {
            // Create mock process with stdout/stderr
            mockStdout = new EventEmitter();
            mockStderr = new EventEmitter();
            mockProcess = new EventEmitter();
            (mockProcess as any).stdout = mockStdout;
            (mockProcess as any).stderr = mockStderr;
            (mockProcess as any).kill = sinon.stub();
            (mockProcess as any).killed = false;

            // Mock child_process.spawn
            const childProcessModule = require('child_process');
            childProcessStub = sinon.stub(childProcessModule, 'spawn').returns(mockProcess);
        });

        afterEach(() => {
            childProcessStub.restore();
        });

        it('task options cwd takes precedence over task workspace folder', async () => {
            const customFolder: WorkspaceFolder = {
                uri: Uri.file(path.join(rootDir, 'workspace-folder')),
                name: 'workspace-folder',
                index: 1
            };

            const customCwd = path.join(rootDir, 'custom-cwd-dir');
            fsExtra.ensureDirSync(customCwd);

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo "test"',
                options: {
                    cwd: customCwd
                }
            }, customFolder);

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);

            // Task options cwd should win over workspace folder
            expect(spawnCall.args[2].cwd).to.equal(customCwd);
            expect(spawnCall.args[2].cwd).to.not.equal(customFolder.uri.fsPath);
        });

        it('uses task workspace folder when no cwd option specified', async () => {
            const customFolder: WorkspaceFolder = {
                uri: Uri.file(path.join(rootDir, 'workspace-folder')),
                name: 'workspace-folder',
                index: 1
            };
            fsExtra.ensureDirSync(customFolder.uri.fsPath);

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo "test"'
                // No cwd option
            }, customFolder);

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);

            // Should use workspace folder when no cwd specified
            expect(spawnCall.args[2].cwd).to.equal(customFolder.uri.fsPath);
        });
    });

    describe('workspace variable resolution', () => {
        let childProcessStub: any;
        let mockProcess: EventEmitter;
        let mockStdout: EventEmitter;
        let mockStderr: EventEmitter;

        beforeEach(() => {
            // Create mock process with stdout/stderr
            mockStdout = new EventEmitter();
            mockStderr = new EventEmitter();
            mockProcess = new EventEmitter();
            (mockProcess as any).stdout = mockStdout;
            (mockProcess as any).stderr = mockStderr;
            (mockProcess as any).kill = sinon.stub();
            (mockProcess as any).killed = false;

            // Mock child_process.spawn
            const childProcessModule = require('child_process');
            childProcessStub = sinon.stub(childProcessModule, 'spawn').returns(mockProcess);
        });

        afterEach(() => {
            childProcessStub.restore();
        });

        it('resolves ${workspaceFolder} to workspace folder path', async () => {
            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${workspaceFolder}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);
            const command = spawnCall.args[0];

            // Command should have ${workspaceFolder} replaced with actual path
            expect(command).to.equal(`echo ${folder.uri.fsPath}`);
            expect(command).to.not.include('${workspaceFolder}');
        });

        it('resolves ${workspaceFolderBasename} to workspace folder basename', async () => {
            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${workspaceFolderBasename}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);
            const command = spawnCall.args[0];

            // Command should have ${workspaceFolderBasename} replaced with basename
            const expectedBasename = path.basename(folder.uri.fsPath);
            expect(command).to.equal(`echo ${expectedBasename}`);
            expect(command).to.not.include('${workspaceFolderBasename}');
        });

        it('resolves ${fileWorkspaceFolderBasename} to active file workspace folder basename', async () => {
            const activeFile = path.join(rootDir, 'test.brs');
            fsExtra.writeFileSync(activeFile, 'test content');

            // Mock active editor
            const mockEditor = {
                document: {
                    uri: Uri.file(activeFile)
                }
            };
            (vscode.window as any).activeTextEditor = mockEditor;
            sinon.stub(vscode.workspace, 'getWorkspaceFolder').returns(folder);

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${fileWorkspaceFolderBasename}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);
            const command = spawnCall.args[0];

            // Command should have ${fileWorkspaceFolderBasename} replaced with basename
            const expectedBasename = path.basename(folder.uri.fsPath);
            expect(command).to.equal(`echo ${expectedBasename}`);
            expect(command).to.not.include('${fileWorkspaceFolderBasename}');
        });

        it('resolves multiple workspace variables in same command', async () => {
            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'cd ${workspaceFolder} && echo ${workspaceFolderBasename}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);
            const command = spawnCall.args[0];

            // Both variables should be replaced
            const expectedBasename = path.basename(folder.uri.fsPath);
            expect(command).to.equal(`cd ${folder.uri.fsPath} && echo ${expectedBasename}`);
            expect(command).to.not.include('${workspaceFolder}');
            expect(command).to.not.include('${workspaceFolderBasename}');
        });

        it('resolves multiple instances of the same workspace variable', async () => {
            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${workspaceFolder} && cd ${workspaceFolder}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);
            const command = spawnCall.args[0];

            // All instances should be replaced
            expect(command).to.equal(`echo ${folder.uri.fsPath} && cd ${folder.uri.fsPath}`);
            expect(command).to.not.include('${workspaceFolder}');
        });

        it('throws error for ${workspaceFolder} when no workspace folder is available', async () => {
            vscode.workspace.workspaceFolders = [];

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${workspaceFolder}'
            }, vscode.TaskScope.Workspace);

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            const outputs: string[] = [];
            let exitCode: number | undefined;

            pty.onDidWrite((data: string) => {
                outputs.push(data);
            });
            pty.onDidClose((code: number) => {
                exitCode = code;
            });

            await pty.open();

            // Task should fail with error about no workspace folder
            expect(outputs.some(o => o.includes('Task cancelled: no workspace folder selected'))).to.be.true;
            expect(exitCode).to.equal(1);
            expect(childProcessStub.called).to.be.false;
        });

        it('throws error for ${workspaceFolderBasename} when no workspace folder is available', async () => {
            // Temporarily clear workspace folders
            const originalFolders = vscode.workspace.workspaceFolders;
            vscode.workspace.workspaceFolders = undefined as any;

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${workspaceFolderBasename}'
            }, vscode.TaskScope.Workspace);

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            const outputs: string[] = [];
            let exitCode: number | undefined;

            pty.onDidWrite((data: string) => {
                outputs.push(data);
            });
            pty.onDidClose((code: number) => {
                exitCode = code;
            });

            await pty.open();

            // Restore workspace folders
            vscode.workspace.workspaceFolders = originalFolders;

            // Task should fail with error about no workspace folder
            expect(outputs.some(o => o.includes('Task cancelled: no workspace folder selected'))).to.be.true;
            expect(exitCode).to.equal(1);
            expect(childProcessStub.called).to.be.false;
        });

        it('throws error for ${fileWorkspaceFolderBasename} when no active editor', async () => {
            // Clear active editor
            (vscode.window as any).activeTextEditor = undefined;

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${fileWorkspaceFolderBasename}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            const outputs: string[] = [];
            let exitCode: number | undefined;

            pty.onDidWrite((data: string) => {
                outputs.push(data);
            });
            pty.onDidClose((code: number) => {
                exitCode = code;
            });

            await pty.open();

            // Task should fail with error about no active file
            expect(outputs.some(o => o.includes('Task failed: error resolving command variables'))).to.be.true;
            expect(outputs.some(o => o.includes('Cannot resolve ${fileWorkspaceFolderBasename}: no active file'))).to.be.true;
            expect(exitCode).to.equal(1);
            expect(childProcessStub.called).to.be.false;
        });

        it('throws error for ${fileWorkspaceFolderBasename} when active file is not in workspace', async () => {
            const fileOutsideWorkspace = '/tmp/external-file.brs';

            // Mock active editor with file outside workspace
            const mockEditor = {
                document: {
                    uri: Uri.file(fileOutsideWorkspace)
                }
            };
            (vscode.window as any).activeTextEditor = mockEditor;
            sinon.stub(vscode.workspace, 'getWorkspaceFolder').returns(undefined);

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${fileWorkspaceFolderBasename}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            const outputs: string[] = [];
            let exitCode: number | undefined;

            pty.onDidWrite((data: string) => {
                outputs.push(data);
            });
            pty.onDidClose((code: number) => {
                exitCode = code;
            });

            await pty.open();

            // Task should fail with error about file not in workspace
            expect(outputs.some(o => o.includes('Task failed: error resolving command variables'))).to.be.true;
            expect(outputs.some(o => o.includes('Cannot resolve ${fileWorkspaceFolderBasename}: active file is not in a workspace folder'))).to.be.true;
            expect(exitCode).to.equal(1);
            expect(childProcessStub.called).to.be.false;
        });

        // File-related variables
        it('resolves ${file} to active file path', async () => {
            const activeFile = path.join(rootDir, 'test.brs');
            fsExtra.writeFileSync(activeFile, 'test content');

            // Mock active editor
            const mockEditor = {
                document: {
                    uri: Uri.file(activeFile)
                }
            };
            (vscode.window as any).activeTextEditor = mockEditor;

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${file}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);
            const command = spawnCall.args[0];

            expect(command).to.equal(`echo ${activeFile}`);
            expect(command).to.not.include('${file}');
        });

        it('resolves ${fileWorkspaceFolder} to active file workspace folder', async () => {
            const activeFile = path.join(rootDir, 'test.brs');
            fsExtra.writeFileSync(activeFile, 'test content');

            // Mock active editor
            const mockEditor = {
                document: {
                    uri: Uri.file(activeFile)
                }
            };
            (vscode.window as any).activeTextEditor = mockEditor;
            sinon.stub(vscode.workspace, 'getWorkspaceFolder').returns(folder);

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${fileWorkspaceFolder}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);
            const command = spawnCall.args[0];

            expect(command).to.equal(`echo ${folder.uri.fsPath}`);
            expect(command).to.not.include('${fileWorkspaceFolder}');
        });

        it('resolves ${relativeFile} to active file relative to workspace', async () => {
            const subDir = path.join(rootDir, 'src');
            fsExtra.ensureDirSync(subDir);
            const activeFile = path.join(subDir, 'test.brs');
            fsExtra.writeFileSync(activeFile, 'test content');

            // Mock active editor
            const mockEditor = {
                document: {
                    uri: Uri.file(activeFile)
                }
            };
            (vscode.window as any).activeTextEditor = mockEditor;
            sinon.stub(vscode.workspace, 'getWorkspaceFolder').returns(folder);

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${relativeFile}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);
            const command = spawnCall.args[0];

            expect(command).to.equal(`echo ${path.join('src', 'test.brs')}`);
            expect(command).to.not.include('${relativeFile}');
        });

        it('resolves ${relativeFileDirname} to active file dirname relative to workspace', async () => {
            const subDir = path.join(rootDir, 'src', 'components');
            fsExtra.ensureDirSync(subDir);
            const activeFile = path.join(subDir, 'test.brs');
            fsExtra.writeFileSync(activeFile, 'test content');

            // Mock active editor
            const mockEditor = {
                document: {
                    uri: Uri.file(activeFile)
                }
            };
            (vscode.window as any).activeTextEditor = mockEditor;
            sinon.stub(vscode.workspace, 'getWorkspaceFolder').returns(folder);

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${relativeFileDirname}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);
            const command = spawnCall.args[0];

            expect(command).to.equal(`echo ${path.join('src', 'components')}`);
            expect(command).to.not.include('${relativeFileDirname}');
        });

        it('resolves ${fileBasename} to active file basename', async () => {
            const activeFile = path.join(rootDir, 'test.brs');
            fsExtra.writeFileSync(activeFile, 'test content');

            // Mock active editor
            const mockEditor = {
                document: {
                    uri: Uri.file(activeFile)
                }
            };
            (vscode.window as any).activeTextEditor = mockEditor;

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${fileBasename}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);
            const command = spawnCall.args[0];

            expect(command).to.equal('echo test.brs');
            expect(command).to.not.include('${fileBasename}');
        });

        it('resolves ${fileBasenameNoExtension} to active file basename without extension', async () => {
            const activeFile = path.join(rootDir, 'test.brs');
            fsExtra.writeFileSync(activeFile, 'test content');

            // Mock active editor
            const mockEditor = {
                document: {
                    uri: Uri.file(activeFile)
                }
            };
            (vscode.window as any).activeTextEditor = mockEditor;

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${fileBasenameNoExtension}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);
            const command = spawnCall.args[0];

            expect(command).to.equal('echo test');
            expect(command).to.not.include('${fileBasenameNoExtension}');
        });

        it('resolves ${fileExtname} to active file extension', async () => {
            const activeFile = path.join(rootDir, 'test.brs');
            fsExtra.writeFileSync(activeFile, 'test content');

            // Mock active editor
            const mockEditor = {
                document: {
                    uri: Uri.file(activeFile)
                }
            };
            (vscode.window as any).activeTextEditor = mockEditor;

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${fileExtname}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);
            const command = spawnCall.args[0];

            expect(command).to.equal('echo .brs');
            expect(command).to.not.include('${fileExtname}');
        });

        it('resolves ${fileDirname} to active file dirname', async () => {
            const subDir = path.join(rootDir, 'src');
            fsExtra.ensureDirSync(subDir);
            const activeFile = path.join(subDir, 'test.brs');
            fsExtra.writeFileSync(activeFile, 'test content');

            // Mock active editor
            const mockEditor = {
                document: {
                    uri: Uri.file(activeFile)
                }
            };
            (vscode.window as any).activeTextEditor = mockEditor;

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${fileDirname}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);
            const command = spawnCall.args[0];

            expect(command).to.equal(`echo ${subDir}`);
            expect(command).to.not.include('${fileDirname}');
        });

        it('resolves ${fileDirnameBasename} to active file folder name', async () => {
            const subDir = path.join(rootDir, 'src');
            fsExtra.ensureDirSync(subDir);
            const activeFile = path.join(subDir, 'test.brs');
            fsExtra.writeFileSync(activeFile, 'test content');

            // Mock active editor
            const mockEditor = {
                document: {
                    uri: Uri.file(activeFile)
                }
            };
            (vscode.window as any).activeTextEditor = mockEditor;

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${fileDirnameBasename}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);
            const command = spawnCall.args[0];

            expect(command).to.equal('echo src');
            expect(command).to.not.include('${fileDirnameBasename}');
        });

        it('throws error for ${file} when no active editor', async () => {
            // Clear active editor
            (vscode.window as any).activeTextEditor = undefined;

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${file}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            const outputs: string[] = [];
            let exitCode: number | undefined;

            pty.onDidWrite((data: string) => {
                outputs.push(data);
            });
            pty.onDidClose((code: number) => {
                exitCode = code;
            });

            await pty.open();

            // Task should fail with error about no active file
            expect(outputs.some(o => o.includes('Task failed: error resolving command variables'))).to.be.true;
            expect(outputs.some(o => o.includes('Cannot resolve file variables: no active file'))).to.be.true;
            expect(exitCode).to.equal(1);
            expect(childProcessStub.called).to.be.false;
        });

        it('throws error for ${fileWorkspaceFolder} when active file not in workspace', async () => {
            const fileOutsideWorkspace = '/tmp/external-file.brs';

            // Mock active editor with file outside workspace
            const mockEditor = {
                document: {
                    uri: Uri.file(fileOutsideWorkspace)
                }
            };
            (vscode.window as any).activeTextEditor = mockEditor;
            sinon.stub(vscode.workspace, 'getWorkspaceFolder').returns(undefined);

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${fileWorkspaceFolder}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            const outputs: string[] = [];
            let exitCode: number | undefined;

            pty.onDidWrite((data: string) => {
                outputs.push(data);
            });
            pty.onDidClose((code: number) => {
                exitCode = code;
            });

            await pty.open();

            // Task should fail with error about file not in workspace
            expect(outputs.some(o => o.includes('Task failed: error resolving command variables'))).to.be.true;
            expect(outputs.some(o => o.includes('Cannot resolve ${fileWorkspaceFolder}: active file is not in a workspace folder'))).to.be.true;
            expect(exitCode).to.equal(1);
            expect(childProcessStub.called).to.be.false;
        });

        // Editor/selection variables
        it('resolves ${lineNumber} to current line number', async () => {
            const activeFile = path.join(rootDir, 'test.brs');
            fsExtra.writeFileSync(activeFile, 'line1\nline2\nline3');

            // Mock active editor with selection
            const mockEditor = {
                document: {
                    uri: Uri.file(activeFile)
                },
                selection: {
                    active: {
                        line: 1, // 0-based, should become 2 (1-based)
                        character: 5
                    }
                }
            };
            (vscode.window as any).activeTextEditor = mockEditor;

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${lineNumber}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);
            const command = spawnCall.args[0];

            expect(command).to.equal('echo 2'); // 1-based
            expect(command).to.not.include('${lineNumber}');
        });

        it('resolves ${columnNumber} to current column number', async () => {
            const activeFile = path.join(rootDir, 'test.brs');
            fsExtra.writeFileSync(activeFile, 'line1\nline2\nline3');

            // Mock active editor with selection
            const mockEditor = {
                document: {
                    uri: Uri.file(activeFile)
                },
                selection: {
                    active: {
                        line: 1,
                        character: 4 // 0-based, should become 5 (1-based)
                    }
                }
            };
            (vscode.window as any).activeTextEditor = mockEditor;

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${columnNumber}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);
            const command = spawnCall.args[0];

            expect(command).to.equal('echo 5'); // 1-based
            expect(command).to.not.include('${columnNumber}');
        });

        it('resolves ${selectedText} to current selected text', async () => {
            const activeFile = path.join(rootDir, 'test.brs');
            fsExtra.writeFileSync(activeFile, 'hello world');

            // Mock active editor with selection
            const mockEditor = {
                document: {
                    uri: Uri.file(activeFile),
                    getText: (range: any) => 'hello'
                },
                selection: {
                    active: {
                        line: 0,
                        character: 0
                    }
                }
            };
            (vscode.window as any).activeTextEditor = mockEditor;

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${selectedText}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);
            const command = spawnCall.args[0];

            expect(command).to.equal('echo hello');
            expect(command).to.not.include('${selectedText}');
        });

        it('throws error for ${lineNumber} when no active editor', async () => {
            // Clear active editor
            (vscode.window as any).activeTextEditor = undefined;

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${lineNumber}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            const outputs: string[] = [];
            let exitCode: number | undefined;

            pty.onDidWrite((data: string) => {
                outputs.push(data);
            });
            pty.onDidClose((code: number) => {
                exitCode = code;
            });

            await pty.open();

            // Task should fail with error about no active editor
            expect(outputs.some(o => o.includes('Task failed: error resolving command variables'))).to.be.true;
            expect(outputs.some(o => o.includes('Cannot resolve editor variables: no active editor'))).to.be.true;
            expect(exitCode).to.equal(1);
            expect(childProcessStub.called).to.be.false;
        });

        // System variables
        it('resolves ${userHome} to user home directory', async () => {
            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${userHome}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);
            const command = spawnCall.args[0];

            const os = require('os');
            expect(command).to.equal(`echo ${os.homedir()}`);
            expect(command).to.not.include('${userHome}');
        });

        it('resolves ${cwd} to current working directory', async () => {
            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${cwd}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);
            const command = spawnCall.args[0];

            expect(command).to.equal(`echo ${process.cwd()}`);
            expect(command).to.not.include('${cwd}');
        });

        it('resolves ${execPath} to VS Code executable path', async () => {
            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${execPath}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);
            const command = spawnCall.args[0];

            expect(command).to.equal(`echo ${process.execPath}`);
            expect(command).to.not.include('${execPath}');
        });

        it('resolves ${pathSeparator} to path separator', async () => {
            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${pathSeparator}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);
            const command = spawnCall.args[0];

            expect(command).to.equal(`echo ${path.sep}`);
            expect(command).to.not.include('${pathSeparator}');
        });

        it('resolves ${/} to path separator', async () => {
            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${/}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);
            const command = spawnCall.args[0];

            expect(command).to.equal(`echo ${path.sep}`);
            expect(command).to.not.include('${/}');
        });

        it('resolves multiple variable types in same command', async () => {
            const activeFile = path.join(rootDir, 'test.brs');
            fsExtra.writeFileSync(activeFile, 'test content');

            // Mock active editor
            const mockEditor = {
                document: {
                    uri: Uri.file(activeFile),
                    getText: (range: any) => 'selected'
                },
                selection: {
                    active: {
                        line: 0,
                        character: 0
                    }
                }
            };
            (vscode.window as any).activeTextEditor = mockEditor;

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'echo ${workspaceFolder} ${file} ${fileBasename} ${userHome} ${pathSeparator}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            await pty.open();

            const spawnCall = childProcessStub.getCall(0);
            const command = spawnCall.args[0];

            const os = require('os');
            expect(command).to.equal(`echo ${folder.uri.fsPath} ${activeFile} test.brs ${os.homedir()} ${path.sep}`);
            expect(command).to.not.include('${workspaceFolder}');
            expect(command).to.not.include('${file}');
            expect(command).to.not.include('${fileBasename}');
            expect(command).to.not.include('${userHome}');
            expect(command).to.not.include('${pathSeparator}');
        });

        it('resolves workspace variables alongside ${folderForFile} variable', async () => {
            // Create a bsconfig.json file
            const projectDir = path.join(rootDir, 'my-project');
            fsExtra.ensureDirSync(projectDir);
            fsExtra.writeFileSync(path.join(projectDir, 'bsconfig.json'), '{}');

            const findFilesStub = sinon.stub();
            findFilesStub.resolves([
                Uri.file(path.join(projectDir, 'bsconfig.json'))
            ]);
            (vscode.workspace as any).findFiles = findFilesStub;
            sinon.stub(vscode.workspace, 'getWorkspaceFolder').returns(folder);

            // Mock showQuickPick to return the relative folder path
            const relativePath = path.relative(folder.uri.fsPath, projectDir);
            sinon.stub(vscode.window, 'showQuickPick').resolves(relativePath);

            const task = createMockTask({
                type: 'brightscript',
                task: 'test-task',
                command: 'cd ${workspaceFolder} && cd ${folderForFile: **/bsconfig.json} && echo ${workspaceFolderBasename}'
            });

            const resolvedTask = await taskProviderCallback.resolveTask(task);
            const pty = await (resolvedTask.execution).callback();

            const outputs: string[] = [];

            pty.onDidWrite((data: string) => {
                outputs.push(data);
            });

            await pty.open();

            // Verify spawn was called (command was resolved successfully)
            expect(childProcessStub.called).to.be.true;

            const spawnCall = childProcessStub.getCall(0);
            const command = spawnCall.args[0];

            // Both workspace variable and folderForFile should be resolved
            const expectedBasename = path.basename(folder.uri.fsPath);
            expect(command).to.include(folder.uri.fsPath); // ${workspaceFolder}
            expect(command).to.include(projectDir); // ${folderForFile: **/bsconfig.json}
            expect(command).to.include(expectedBasename); // ${workspaceFolderBasename}
            expect(command).to.not.include('${workspaceFolder}');
            expect(command).to.not.include('${workspaceFolderBasename}');
            expect(command).to.not.include('${folderForFile');
        });
    });

    /**
     * Helper function to create a mock task
     */
    function createMockTask(definition: TaskDefinition, scope?: WorkspaceFolder | TaskScope): Task {
        return {
            definition: definition,
            scope: scope ?? folder,
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
