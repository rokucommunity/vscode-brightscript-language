import { vscode } from '../mockVscode.spec';
import { createSandbox } from 'sinon';
import { CaptureScreenshotCommand } from './CaptureScreenshotCommand';
import { DeviceTargetManager } from '../managers/DeviceTargetManager';
import { rokuDeploy } from 'roku-deploy';
import { expect } from 'chai';
import URI from 'vscode-uri';
import { standardizePath as s } from 'brighterscript';

const cwd = s`${process.cwd()}`;

const sinon = createSandbox();

describe('CaptureScreenshotCommand', () => {
    let deviceTargetManager: DeviceTargetManager;
    let command: CaptureScreenshotCommand;
    let context = vscode.context;
    let workspace = vscode.workspace;

    beforeEach(() => {
        command = new CaptureScreenshotCommand();
        deviceTargetManager = new DeviceTargetManager(vscode.context, {} as any, {} as any);
        command.register(context, deviceTargetManager);
    });

    afterEach(() => {
        sinon.restore();
        workspace.workspaceFolders = [];
    });

    /**
     * Stub the target/password resolution (both delegated to DeviceTargetManager, tested there)
     * so tests can drive captureScreenshot directly
     */
    function stubResolution(device: any = { host: '1.1.1.1' }, label = '1.1.1.1') {
        const resolveTarget = sinon.stub(deviceTargetManager, 'resolveActiveTargetDevice').resolves({ device: device, serialNumber: 'SN1', label: label });
        const resolvePassword = sinon.stub(deviceTargetManager, 'resolveValidatedPassword').resolves('password');
        return { resolveTarget: resolveTarget, resolvePassword: resolvePassword };
    }

    it('passes the reference through to the resolver and the resolved device to rokuDeploy', async () => {
        const { resolveTarget, resolvePassword } = stubResolution();
        const stub = sinon.stub(rokuDeploy, 'captureScreenshot').returns(Promise.resolve({ buffer: Buffer.alloc(0), filePath: 'screenshot.png' }));

        await command['captureScreenshot']({ key: 's:SN1' });

        expect(resolveTarget.getCall(0).args[0]).to.eql({ key: 's:SN1' });
        expect(resolvePassword.getCall(0).args[0]).to.eql({ host: '1.1.1.1' });
        expect(stub.getCall(0).args[0]).to.eql({ device: { host: '1.1.1.1' }, password: 'password', out: true });
    });

    it('captures from a cloud emulator device through its device config', async () => {
        const cloudDevice = { instanceUrl: 'https://rce.example.com/instance', rceToken: 'token' };
        stubResolution(cloudDevice, 'Chris (cloud emulator)');
        const stub = sinon.stub(rokuDeploy, 'captureScreenshot').returns(Promise.resolve({ buffer: Buffer.alloc(0), filePath: 'screenshot.png' }));

        await command['captureScreenshot']({ key: 'rce:83' });

        expect(stub.getCall(0).args[0]).to.eql({ device: cloudDevice, password: 'password', out: true });
    });

    it('returns early when device resolution is cancelled', async () => {
        sinon.stub(deviceTargetManager, 'resolveActiveTargetDevice').resolves(undefined);
        const stub = sinon.stub(rokuDeploy, 'captureScreenshot');

        await command['captureScreenshot']();

        expect(stub.called).to.be.false;
    });

    it('returns early when password resolution is cancelled', async () => {
        sinon.stub(deviceTargetManager, 'resolveActiveTargetDevice').resolves({ device: { host: '1.1.1.1' }, serialNumber: 'SN1', label: '1.1.1.1' });
        sinon.stub(deviceTargetManager, 'resolveValidatedPassword').resolves(undefined);
        const stub = sinon.stub(rokuDeploy, 'captureScreenshot');

        await command['captureScreenshot']();

        expect(stub.called).to.be.false;
    });

    it('shows error message when captureScreenshot fails', async () => {
        const { resolveTarget } = stubResolution();
        sinon.stub(rokuDeploy, 'captureScreenshot').rejects(new Error('Screenshot failed'));
        const stubError = sinon.stub(vscode.window, 'showErrorMessage');

        await command['captureScreenshot']('1.1.1.1');

        expect(resolveTarget.getCall(0).args[0]).to.eql('1.1.1.1');
        expect(stubError.calledOnce).to.be.true;
    });

    it('uses temp dir when screenshotDir is not defined', async () => {
        stubResolution();
        const stub = sinon.stub(rokuDeploy, 'captureScreenshot').returns(Promise.resolve({ buffer: Buffer.alloc(0), filePath: 'screenshot.png' }));

        await command['captureScreenshot']();

        expect(stub.getCall(0).args[0]).to.eql({ device: { host: '1.1.1.1' }, password: 'password', out: true });
    });

    it('uses screenshotDir with single workspace', async () => {
        stubResolution();
        const stub = sinon.stub(rokuDeploy, 'captureScreenshot').returns(Promise.resolve({ buffer: Buffer.alloc(0), filePath: 'screenshot.png' }));
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

        expect(stub.getCall(0).args[0]).to.eql({ device: { host: '1.1.1.1' }, password: 'password', out: true, screenshotDir: s`${cwd}/workspace/screenshots` });
    });

    it('uses relative screenshotDir with single workspace', async () => {
        stubResolution();
        const stub = sinon.stub(rokuDeploy, 'captureScreenshot').returns(Promise.resolve({ buffer: Buffer.alloc(0), filePath: 'screenshot.png' }));
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

        expect(stub.getCall(0).args[0]).to.eql({ device: { host: '1.1.1.1' }, password: 'password', out: true, screenshotDir: s`${cwd}/workspace/screenshots` });
    });

    it('uses screenshotDir with multiple workspace', async () => {
        stubResolution();
        const stub = sinon.stub(rokuDeploy, 'captureScreenshot').returns(Promise.resolve({ buffer: Buffer.alloc(0), filePath: 'screenshot.png' }));
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

        expect(stub.getCall(0).args[0]).to.eql({ device: { host: '1.1.1.1' }, password: 'password', out: true, screenshotDir: s`${cwd}/workspace2/screenshots` });
    });

    it('uses relative screenshotDir with multiple workspace', async () => {
        stubResolution();
        const stub = sinon.stub(rokuDeploy, 'captureScreenshot').returns(Promise.resolve({ buffer: Buffer.alloc(0), filePath: 'screenshot.png' }));
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

        expect(stub.getCall(0).args[0]).to.eql({ device: { host: '1.1.1.1' }, password: 'password', out: true, screenshotDir: s`${cwd}/workspace2/screenshots` });
    });
});
