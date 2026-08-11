import { vscode } from '../mockVscode.spec';
import type { SinonStub } from 'sinon';
import { createSandbox } from 'sinon';
import { RekeyAndPackageCommand } from './RekeyAndPackageCommand';
import { rokuDeploy } from 'roku-deploy';
import { expect } from 'chai';

const sinon = createSandbox();

describe('RekeyAndPackageCommand', () => {
    let command: RekeyAndPackageCommand;
    let userInputManager: any;

    beforeEach(() => {
        command = new RekeyAndPackageCommand();
        userInputManager = {
            promptForHost: sinon.stub()
        };
        command.register(vscode.context as any, {} as any, userInputManager);
    });

    afterEach(() => {
        sinon.restore();
    });

    /**
     * Stub every dialog the manual rekey flow walks through: the config-source quick pick,
     * the password/signingPassword input boxes, and the signed-package + confirmation modals
     */
    function stubRekeyDialogs() {
        sinon.stub(vscode.window, 'showQuickPick').resolves('Enter manually' as any);
        const inputBox = sinon.stub(vscode.window, 'showInputBox');
        inputBox.onFirstCall().resolves('devPassword');
        inputBox.onSecondCall().resolves('signingPassword');
        const infoMessage = sinon.stub(vscode.window, 'showInformationMessage') as SinonStub;
        //signed-package modal, then the confirmation modal, then the success toast
        infoMessage.onFirstCall().resolves('Open file picker');
        infoMessage.onSecondCall().resolves('Rekey');
        sinon.stub(vscode.window, 'showOpenDialog').resolves([{ fsPath: '/path/to/signed.pkg' } as any]);
        return { infoMessage: infoMessage };
    }

    describe('rekeyDevice', () => {
        it('passes the picked LAN device config through to rokuDeploy.rekeyDevice', async () => {
            stubRekeyDialogs();
            userInputManager.promptForHost.resolves({ host: '1.1.1.1', deviceInfo: {}, device: { host: '1.1.1.1' } });
            const rekeyStub = sinon.stub(rokuDeploy, 'rekeyDevice').resolves();

            await command['rekeyDevice']();

            expect(rekeyStub.getCall(0).args[0]).to.eql({
                device: { host: '1.1.1.1' },
                password: 'devPassword',
                signingPassword: 'signingPassword',
                pkg: '/path/to/signed.pkg'
            });
        });

        it('passes a cloud emulator device config through to rokuDeploy.rekeyDevice', async () => {
            const cloudDevice = { instanceUrl: 'https://rce.example.com/instance', rceToken: 'token' };
            const { infoMessage } = stubRekeyDialogs();
            userInputManager.promptForHost.resolves({ host: undefined, deviceInfo: {}, device: cloudDevice, rce: { status: 'running' } });
            const rekeyStub = sinon.stub(rokuDeploy, 'rekeyDevice').resolves();

            await command['rekeyDevice']();

            expect(rekeyStub.getCall(0).args[0]).to.eql({
                device: cloudDevice,
                password: 'devPassword',
                signingPassword: 'signingPassword',
                pkg: '/path/to/signed.pkg'
            });
            //the confirmation dialog names the device by its instance url instead of "host: undefined"
            const confirmDetail = infoMessage.getCall(1).args[1];
            expect(confirmDetail.detail).to.include('device: https://rce.example.com/instance');
        });

        it('rejects a cloud emulator device that is not running', async () => {
            stubRekeyDialogs();
            userInputManager.promptForHost.resolves({ host: undefined, deviceInfo: {}, device: { id: 83, rceToken: 'token' }, rce: { status: 'stopped' } });
            const rekeyStub = sinon.stub(rokuDeploy, 'rekeyDevice').resolves();

            let error: Error | undefined;
            try {
                await command['rekeyDevice']();
            } catch (e) {
                error = e as Error;
            }

            expect(error?.message).to.include('not running');
            expect(rekeyStub.called).to.be.false;
        });
    });

    describe('resolveDeviceConfig', () => {
        it('returns undefined when the picker was dismissed', () => {
            expect(command['resolveDeviceConfig'](undefined)).to.be.undefined;
        });

        it('falls back to a host-based config when the pick has no device config', () => {
            expect(command['resolveDeviceConfig']({ host: '1.1.1.1' } as any)).to.eql({ host: '1.1.1.1' });
        });
    });

    describe('describeDevice', () => {
        it('names devices by whichever address field they carry', () => {
            expect(command['describeDevice']({ host: '1.1.1.1' })).to.equal('1.1.1.1');
            expect(command['describeDevice']({ instanceUrl: 'https://rce.example.com', rceToken: 'token' })).to.equal('https://rce.example.com');
            expect(command['describeDevice']({ id: 83, rceToken: 'token' })).to.equal('83');
            expect(command['describeDevice']({ esn: 'RCE123', rceToken: 'token' })).to.equal('RCE123');
            expect(command['describeDevice'](undefined)).to.equal('unknown');
        });
    });
});
