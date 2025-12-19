import { vscode } from '../mockVscode.spec';
import { createSandbox } from 'sinon';
import { CaptureScreenshotCommand } from './CaptureScreenshotCommand';
import * as rokuDeploy from 'roku-deploy';
import { expect } from 'chai';
import URI from 'vscode-uri';

const sinon = createSandbox();

describe('CaptureScreenshotCommand', () => {
    let command: CaptureScreenshotCommand;
    let context = vscode.context;
    let workspace = vscode.workspace;

    beforeEach(() => {
        command = new CaptureScreenshotCommand();
        command.register(context, undefined);
    });

    afterEach(() => {
        sinon.restore();
        workspace._configuration = {};
        workspace.workspaceFolders = [];
    });

    it('uses temp dir when screenshotDir is not defined', async () => {
        sinon.stub(command as any, 'getHostAndPassword').callsFake(() => Promise.resolve({ host: '1.1.1.1', password: 'password' }));
        const stub = sinon.stub(rokuDeploy, 'takeScreenshot').returns(Promise.resolve('screenshot.png'));

        await command['captureScreenshot']('1.1.1.1');

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
                uri: URI.file('/workspace'),
                name: 'test-workspace',
                index: 0
            }
        ];

        await command['captureScreenshot']('1.1.1.1');

        expect(stub.getCall(0).args[0]).to.eql({ host: '1.1.1.1', password: 'password', outDir: '/workspace/screenshots' });
    });

    it('uses relative screenshotDir with single workspace', async () => {
        sinon.stub(command as any, 'getHostAndPassword').callsFake(() => Promise.resolve({ host: '1.1.1.1', password: 'password' }));
        const stub = sinon.stub(rokuDeploy, 'takeScreenshot').returns(Promise.resolve('screenshot.png'));
        workspace._configuration = {
            'brightscript.screenshotDir': 'screenshots'
        };
        workspace.workspaceFolders = [
            {
                uri: URI.file('/workspace'),
                name: 'test-workspace',
                index: 0
            }
        ];

        await command['captureScreenshot']('1.1.1.1');

        expect(stub.getCall(0).args[0]).to.eql({ host: '1.1.1.1', password: 'password', outDir: '/workspace/screenshots' });
    });

    it('uses screenshotDir with multiple workspace', async () => {
        sinon.stub(command as any, 'getHostAndPassword').callsFake(() => Promise.resolve({ host: '1.1.1.1', password: 'password' }));
        const stub = sinon.stub(rokuDeploy, 'takeScreenshot').returns(Promise.resolve('screenshot.png'));
        const workspaceFolders = [
            {
                uri: URI.file('/workspace'),
                name: 'test-workspace',
                index: 0
            },
            {
                uri: URI.file('/workspace2'),
                name: 'test-workspace2',
                index: 1
            }
        ];
        workspace.workspaceFolders = workspaceFolders;
        workspace._configuration = {
            'brightscript.screenshotDir': '${workspaceFolder}/screenshots'
        };
        sinon.stub(vscode.window, 'showWorkspaceFolderPick').resolves(workspaceFolders[1]);

        await command['captureScreenshot']('1.1.1.1');

        expect(stub.getCall(0).args[0]).to.eql({ host: '1.1.1.1', password: 'password', outDir: '/workspace2/screenshots' });
    });

    it('uses relative screenshotDir with multiple workspace', async () => {
        sinon.stub(command as any, 'getHostAndPassword').callsFake(() => Promise.resolve({ host: '1.1.1.1', password: 'password' }));
        const stub = sinon.stub(rokuDeploy, 'takeScreenshot').returns(Promise.resolve('screenshot.png'));
        const workspaceFolders = [
            {
                uri: URI.file('/workspace'),
                name: 'test-workspace',
                index: 0
            },
            {
                uri: URI.file('/workspace2'),
                name: 'test-workspace2',
                index: 1
            }
        ];
        workspace.workspaceFolders = workspaceFolders;
        workspace._configuration = {
            'brightscript.screenshotDir': 'screenshots'
        };
        sinon.stub(vscode.window, 'showWorkspaceFolderPick').resolves(workspaceFolders[1]);

        await command['captureScreenshot']('1.1.1.1');

        expect(stub.getCall(0).args[0]).to.eql({ host: '1.1.1.1', password: 'password', outDir: '/workspace2/screenshots' });
    });
});
