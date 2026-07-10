import { expect } from 'chai';
import * as sinon from 'sinon';
let Module = require('module');

import { vscode } from '../mockVscode.spec';

//override the "require" call to mock certain items
const { require: oldRequire } = Module.prototype;

Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

import * as fsExtra from 'fs-extra';
import * as path from 'path';
import URI from 'vscode-uri';
import { SdkPasswordCandidateProvider } from './SdkPasswordCandidateProvider';

describe('SdkPasswordCandidateProvider', () => {
    const host = '10.0.0.1';
    const workspaceDir = path.join(path.sep, 'projects', 'my-app');
    const workspaceLeaseDir = path.join(workspaceDir, '.roku', 'leases');

    const envKeys = [
        'ROKU_DEV_PASSWORD',
        'RK_DEVICE_PASSWORD',
        'RK_DEVICE_LEASE_DIR',
        'RK_DEVICE_LEASE_ID',
        'RK_ALLOW_LITERAL_PASSWORD',
        'LAB_PW_TEST'
    ];

    let deviceManager: any;
    let rokuDevConfigProvider: any;
    let provider: SdkPasswordCandidateProvider;
    let originalWorkspaceFolders: any;

    /**
     * Stub lease-file fs access. Keys of `dirs` are lease directories; values map lease file
     * name to parsed JSON (or an Error to simulate an unreadable file). Directories not in
     * `dirs` throw ENOENT like the real fs would.
     */
    function stubLeaseFiles(dirs: Record<string, Record<string, any>>) {
        sinon.stub(fsExtra, 'readdirSync').callsFake((dir: any) => {
            if (!(dir in dirs)) {
                throw new Error(`ENOENT: no such directory ${dir}`);
            }
            return Object.keys(dirs[dir]) as any;
        });
        sinon.stub(fsExtra, 'readJsonSync').callsFake((filePath: any) => {
            const dir = path.dirname(filePath);
            const value = dirs[dir]?.[path.basename(filePath)];
            if (value === undefined || value instanceof Error) {
                throw value ?? new Error(`ENOENT: no such file ${filePath}`);
            }
            return value;
        });
    }

    /** Drop undefined/empty entries the same way UserInputManager's addCandidate does. */
    function getCandidates(forHost: string | undefined = host, serialNumber?: string) {
        return provider.getPasswordCandidates(forHost, serialNumber).filter(x => !!x);
    }

    beforeEach(() => {
        for (const key of envKeys) {
            delete process.env[key];
        }
        originalWorkspaceFolders = vscode.workspace.workspaceFolders;
        vscode.workspace.workspaceFolders = [{
            uri: URI.file(workspaceDir),
            name: 'my-app',
            index: 0
        }] as any;
        deviceManager = { getAllDevices: () => [] };
        rokuDevConfigProvider = { getPasswordCandidates: () => [] };
        provider = new SdkPasswordCandidateProvider(deviceManager, rokuDevConfigProvider);
    });

    afterEach(() => {
        for (const key of envKeys) {
            delete process.env[key];
        }
        vscode.workspace.workspaceFolders = originalWorkspaceFolders;
        sinon.restore();
    });

    it('returns no truthy candidates when no source has anything', () => {
        stubLeaseFiles({});
        expect(getCandidates()).to.deep.equal([]);
    });

    it('includes the merged device configuredPassword when the host matches a known device', () => {
        stubLeaseFiles({});
        deviceManager.getAllDevices = () => [
            { ip: '9.9.9.9', configuredPassword: 'other-pw' },
            { ip: host, configuredPassword: 'merged-pw' }
        ];
        expect(getCandidates()).to.deep.equal(['merged-pw']);
    });

    it('includes roku-dev-config candidates for the host, after the merged device password', () => {
        stubLeaseFiles({});
        deviceManager.getAllDevices = () => [{ ip: host, configuredPassword: 'merged-pw' }];
        const getPasswordCandidates = sinon.spy(() => ['config-pw', 'config-default-pw']);
        rokuDevConfigProvider.getPasswordCandidates = getPasswordCandidates;
        expect(getCandidates()).to.deep.equal(['merged-pw', 'config-pw', 'config-default-pw']);
        expect(getPasswordCandidates.calledWith(host)).to.be.true;
    });

    it('includes ROKU_DEV_PASSWORD and RK_DEVICE_PASSWORD from the environment, last', () => {
        stubLeaseFiles({});
        rokuDevConfigProvider.getPasswordCandidates = () => ['config-pw'];
        process.env.ROKU_DEV_PASSWORD = 'rk-cli-env-pw';
        process.env.RK_DEVICE_PASSWORD = 'pool-env-pw';
        expect(getCandidates()).to.deep.equal(['config-pw', 'rk-cli-env-pw', 'pool-env-pw']);
    });

    describe('lease files', () => {
        it('resolves env: passwordRefs from leases whose ip matches the host', () => {
            process.env.LAB_PW_TEST = 'lab-pw';
            stubLeaseFiles({
                [workspaceLeaseDir]: {
                    'lease-1.json': { ip: host, passwordRef: 'env:LAB_PW_TEST' },
                    'lease-2.json': { ip: '9.9.9.9', passwordRef: 'env:LAB_PW_TEST' }
                }
            });
            expect(getCandidates()).to.deep.equal(['lab-pw']);
        });

        it('ignores literal: passwordRefs unless RK_ALLOW_LITERAL_PASSWORD=1, matching the sdk gate', () => {
            stubLeaseFiles({
                [workspaceLeaseDir]: {
                    'lease-1.json': { ip: host, passwordRef: 'literal:plain-pw' }
                }
            });
            expect(getCandidates()).to.deep.equal([]);

            process.env.RK_ALLOW_LITERAL_PASSWORD = '1';
            expect(getCandidates()).to.deep.equal(['plain-pw']);
        });

        it('scans $RK_DEVICE_LEASE_DIR instead of workspace .roku/leases dirs when set', () => {
            const customLeaseDir = path.join(path.sep, 'custom', 'leases');
            process.env.RK_DEVICE_LEASE_DIR = customLeaseDir;
            process.env.LAB_PW_TEST = 'lab-pw';
            stubLeaseFiles({
                [customLeaseDir]: {
                    'lease-1.json': { ip: host, passwordRef: 'env:LAB_PW_TEST' }
                },
                [workspaceLeaseDir]: {
                    'lease-2.json': { ip: host, passwordRef: 'literal:should-not-appear' }
                }
            });
            expect(getCandidates()).to.deep.equal(['lab-pw']);
        });

        it('tries the lease pinned by RK_DEVICE_LEASE_ID before its siblings', () => {
            process.env.RK_DEVICE_LEASE_ID = 'lease-2';
            process.env.RK_ALLOW_LITERAL_PASSWORD = '1';
            stubLeaseFiles({
                [workspaceLeaseDir]: {
                    'lease-1.json': { ip: host, passwordRef: 'literal:sibling-pw' },
                    'lease-2.json': { ip: host, passwordRef: 'literal:pinned-pw' }
                }
            });
            expect(getCandidates()).to.deep.equal(['pinned-pw', 'sibling-pw']);
        });

        it('skips unreadable lease files and missing lease directories without failing', () => {
            process.env.LAB_PW_TEST = 'lab-pw';
            stubLeaseFiles({
                [workspaceLeaseDir]: {
                    'broken.json': new Error('unexpected token'),
                    'lease-1.json': { ip: host, passwordRef: 'env:LAB_PW_TEST' }
                }
            });
            expect(getCandidates()).to.deep.equal(['lab-pw']);
        });

        it('ignores leases with an unset env passwordRef target', () => {
            stubLeaseFiles({
                [workspaceLeaseDir]: {
                    'lease-1.json': { ip: host, passwordRef: 'env:LAB_PW_TEST' }
                }
            });
            expect(getCandidates()).to.deep.equal([]);
        });
    });
});
