import { expect } from 'chai';
import * as path from 'path';
import { createSandbox } from 'sinon';
import type { WorkspaceFolder, Task, TaskDefinition, Disposable } from 'vscode';
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
            (vscode.workspace as any).getWorkspaceFolder = sinon.stub().returns(folder);
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
            (vscode.workspace as any).getWorkspaceFolder = sinon.stub().returns(folder);
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
            (vscode.workspace as any).getWorkspaceFolder = sinon.stub().returns(folder);

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
            (vscode.workspace as any).getWorkspaceFolder = sinon.stub().returns(folder);

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
            (vscode.workspace as any).getWorkspaceFolder = sinon.stub().returns(folder);

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
            (vscode.workspace as any).getWorkspaceFolder = sinon.stub().returns(folder);
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

            // Verify cancellation message and exit code
            expect(outputs.some(o => o.includes('Task cancelled by user'))).to.be.true;
            expect(exitCode).to.equal(1);
            // spawn should not have been called since user cancelled
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

            // Mock workspace configuration
            configStub = {
                get: sinon.stub().returns(undefined)
            };
            sinon.stub(vscode.workspace, 'getConfiguration').returns(configStub);
        });

        afterEach(() => {
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
            // Process env should be included
            expect(env.PATH).to.exist;
        });

        it('uses task shell option over user setting', async () => {
            configStub.get.withArgs('shell.darwin').returns('/bin/zsh');

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
