import { vscode } from '../mockVscode.spec';
import { createSandbox } from 'sinon';
import { CaptureScreenshotCommand } from './CaptureScreenshotCommand';
import { BrightScriptCommands } from '../BrightScriptCommands';
import * as rokuDeploy from 'roku-deploy';
import { expect } from 'chai';
import URI from 'vscode-uri';
import { standardizePath as s } from 'brighterscript';

const cwd = s`${process.cwd()}`;

const sinon = createSandbox();

describe('CaptureScreenshotCommand', () => {
    let brightScriptCommands: BrightScriptCommands;
    let command: CaptureScreenshotCommand;
    let context = vscode.context;
    let workspace = vscode.workspace;

    beforeEach(() => {
        command = new CaptureScreenshotCommand();
        brightScriptCommands = new BrightScriptCommands({} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
        command.register(context, brightScriptCommands);
    });

    afterEach(() => {
        sinon.restore();
        workspace.workspaceFolders = [];
    });

    it('gets remoteHost and remotePassword when hostParam is not provided', async () => {
        sinon.stub(brightScriptCommands, 'getRemoteHost').resolves('1.1.1.1');
        sinon.stub(brightScriptCommands, 'getRemotePassword').resolves('password');

        const { host, password } = await command['getHostAndPassword']();

        expect(host).to.eql('1.1.1.1');
        expect(password).to.eql('password');
    });

    it('gets remotePassword when hostParam matches remoteHost', async () => {
        await context.workspaceState.update('remoteHost', '1.1.1.1');
        await context.workspaceState.update('remotePassword', 'password');

        const { host, password } = await command['getHostAndPassword']('1.1.1.1');

        expect(host).to.eql('1.1.1.1');
        expect(password).to.eql('password');
    });

    it('prompts for password when hostParam does not match remoteHost', async () => {
        sinon.stub(vscode.window, 'showInputBox').resolves('password');

        const { host, password } = await command['getHostAndPassword']('1.1.1.1');

        expect(host).to.eql('1.1.1.1');
        expect(password).to.eql('password');
    });

    it('shows error message when captureScreenshot fails', async () => {
        const stub = sinon.stub(command as any, 'getHostAndPassword').callsFake(() => Promise.resolve({ host: '1.1.1.1', password: 'password' }));
        sinon.stub(rokuDeploy, 'takeScreenshot').rejects(new Error('Screenshot failed'));
        const stubError = sinon.stub(vscode.window, 'showErrorMessage');

        await command['captureScreenshot']('1.1.1.1');

        expect(stub.getCall(0).args[0]).to.eql('1.1.1.1');
        expect(stubError.calledOnce).to.be.true;
    });

    it('uses temp dir when screenshotDir is not defined', async () => {
        sinon.stub(command as any, 'getHostAndPassword').callsFake(() => Promise.resolve({ host: '1.1.1.1', password: 'password' }));
        const stub = sinon.stub(rokuDeploy, 'takeScreenshot').returns(Promise.resolve('screenshot.png'));

        await command['captureScreenshot']();

        expect(stub.getCall(0).args[0]).to.eql({ host: '1.1.1.1', password: 'password' });
    });

    it('uses screenshotDir with single workspace', async () => {
        sinon.stub(command as any, 'getHostAndPassword').callsFake(() => Promise.resolve({ host: '1.1.1.1', password: 'password' }));
        const stub = sinon.stub(rokuDeploy, 'takeScreenshot').returns(Promise.resolve('screenshot.png'));
        workspace._configuration = {
            'brightscript.screenshotDir': '${workspaceFolder}/screenshots'
        };
        workspace.workspaceFolders = [
            {
                uri: URI.file(s`${cwd}/workspace`),
                name: 'test-workspace',
                index: 0
            }
        ];

        await command['captureScreenshot']();

        expect(stub.getCall(0).args[0]).to.eql({ host: '1.1.1.1', password: 'password', outDir: s`${cwd}/workspace/screenshots` });
    });

    it('uses relative screenshotDir with single workspace', async () => {
        sinon.stub(command as any, 'getHostAndPassword').callsFake(() => Promise.resolve({ host: '1.1.1.1', password: 'password' }));
        const stub = sinon.stub(rokuDeploy, 'takeScreenshot').returns(Promise.resolve('screenshot.png'));
        workspace._configuration = {
            'brightscript.screenshotDir': 'screenshots'
        };
        workspace.workspaceFolders = [
            {
                uri: URI.file(s`${cwd}/workspace`),
                name: 'test-workspace',
                index: 0
            }
        ];

        await command['captureScreenshot']();

        expect(stub.getCall(0).args[0]).to.eql({ host: '1.1.1.1', password: 'password', outDir: s`${cwd}/workspace/screenshots` });
    });

    it('uses screenshotDir with multiple workspace', async () => {
        sinon.stub(command as any, 'getHostAndPassword').callsFake(() => Promise.resolve({ host: '1.1.1.1', password: 'password' }));
        const stub = sinon.stub(rokuDeploy, 'takeScreenshot').returns(Promise.resolve('screenshot.png'));
        const workspaceFolders = [
            {
                uri: URI.file(s`${cwd}/workspace1`),
                name: 'test-workspace',
                index: 0
            },
            {
                uri: URI.file(s`${cwd}/workspace2`),
                name: 'test-workspace2',
                index: 1
            }
        ];
        workspace.workspaceFolders = workspaceFolders;
        workspace._configuration = {
            'brightscript.screenshotDir': '${workspaceFolder}/screenshots'
        };
        sinon.stub(vscode.window, 'showWorkspaceFolderPick').resolves(workspaceFolders[1]);

        await command['captureScreenshot']();

        expect(stub.getCall(0).args[0]).to.eql({ host: '1.1.1.1', password: 'password', outDir: s`${cwd}/workspace2/screenshots` });
    });

    it('uses relative screenshotDir with multiple workspace', async () => {
        sinon.stub(command as any, 'getHostAndPassword').callsFake(() => Promise.resolve({ host: '1.1.1.1', password: 'password' }));
        const stub = sinon.stub(rokuDeploy, 'takeScreenshot').returns(Promise.resolve('screenshot.png'));
        const workspaceFolders = [
            {
                uri: URI.file(s`${cwd}/workspace1`),
                name: 'test-workspace',
                index: 0
            },
            {
                uri: URI.file(s`${cwd}/workspace2`),
                name: 'test-workspace2',
                index: 1
            }
        ];
        workspace.workspaceFolders = workspaceFolders;
        workspace._configuration = {
            'brightscript.screenshotDir': 'screenshots'
        };
        sinon.stub(vscode.window, 'showWorkspaceFolderPick').resolves(workspaceFolders[1]);

        await command['captureScreenshot']();

        expect(stub.getCall(0).args[0]).to.eql({ host: '1.1.1.1', password: 'password', outDir: s`${cwd}/workspace2/screenshots` });
    });
});
