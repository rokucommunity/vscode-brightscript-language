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
import * as os from 'os';
import * as path from 'path';
import URI from 'vscode-uri';
import { RokuDevConfigProvider } from './RokuDevConfigProvider';

describe('RokuDevConfigProvider', () => {
    let provider: RokuDevConfigProvider;

    const fakeHome = path.join(path.sep, 'home', 'test-user');
    const homeConfigPath = path.join(fakeHome, 'roku-dev-config.json');
    const workspaceDir = path.join(path.sep, 'projects', 'my-app');
    const workspaceConfigPath = path.join(workspaceDir, '.roku', 'roku-dev-config.json');
    const ancestorConfigPath = path.join(path.sep, 'projects', '.roku', 'roku-dev-config.json');

    /**
     * Stub all fs access the provider performs so tests never touch the real filesystem
     * (including the developer's actual ~/roku-dev-config.json). Map values are the parsed
     * JSON to return; an Error value makes readJsonSync throw (broken file simulation).
     */
    function stubFiles(files: Record<string, any>) {
        sinon.stub(fsExtra, 'existsSync').callsFake((p: any) => p in files);
        sinon.stub(fsExtra, 'pathExistsSync').callsFake((p: any) => p in files);
        sinon.stub(fsExtra, 'readJsonSync').callsFake((p: any) => {
            const value = files[p];
            if (value instanceof Error) {
                throw value;
            }
            return value;
        });
    }

    beforeEach(() => {
        sinon.stub(os, 'homedir').returns(fakeHome);
        //the shared mock watcher/subscription stubs don't return disposables, so provide ones that do
        sinon.stub(vscode.workspace, 'createFileSystemWatcher').returns({
            onDidCreate: () => ({ dispose: () => { } }),
            onDidChange: () => ({ dispose: () => { } }),
            onDidDelete: () => ({ dispose: () => { } }),
            dispose: () => { }
        } as any);
        sinon.stub(vscode.workspace, 'onDidChangeWorkspaceFolders').returns({ dispose: () => { } } as any);
    });

    afterEach(() => {
        provider?.dispose();
        provider = undefined;
        sinon.restore();
    });

    describe('getConfiguredDevices', () => {
        it('discovers devices from ~/roku-dev-config.json in the home directory', () => {
            stubFiles({
                [homeConfigPath]: { devices: [{ ip: '192.168.1.100', name: 'Home Device', password: 'home-pass' }] }
            });

            provider = new RokuDevConfigProvider();

            expect(provider.getConfiguredDevices()).to.deep.equal([{
                host: '192.168.1.100',
                name: 'Home Device',
                password: 'home-pass'
            }]);
        });

        it('returns no devices when no config files exist anywhere', () => {
            stubFiles({});

            provider = new RokuDevConfigProvider();

            expect(provider.getConfiguredDevices()).to.deep.equal([]);
        });

        it('workspace config overrides home config for the same device', () => {
            stubFiles({
                [homeConfigPath]: { devices: [{ id: 'dev-1', ip: '10.0.0.1', name: 'From Home', password: 'home-pass' }] },
                [workspaceConfigPath]: { devices: [{ id: 'dev-1', ip: '10.0.0.1', name: 'From Workspace', password: 'ws-pass' }] }
            });

            provider = new RokuDevConfigProvider();
            provider['workspaceConfigPaths'].add(workspaceConfigPath);

            expect(provider.getConfiguredDevices()).to.deep.equal([{
                host: '10.0.0.1',
                name: 'From Workspace',
                password: 'ws-pass'
            }]);
        });

        it('ancestor config overrides home config for the same device', () => {
            vscode.workspace.workspaceFolders = [{
                uri: URI.file(workspaceDir),
                name: 'my-app',
                index: 0
            }] as any;
            stubFiles({
                [homeConfigPath]: { devices: [{ id: 'dev-1', ip: '10.0.0.1', name: 'From Home' }] },
                [ancestorConfigPath]: { devices: [{ id: 'dev-1', ip: '10.0.0.1', name: 'From Ancestor' }] }
            });

            provider = new RokuDevConfigProvider();

            const devices = provider.getConfiguredDevices();
            expect(devices.length).to.equal(1);
            expect(devices[0].name).to.equal('From Ancestor');
        });

        it('merges home-only devices alongside devices from more specific configs', () => {
            stubFiles({
                [homeConfigPath]: { devices: [{ ip: '10.0.0.2', name: 'Home Only' }] },
                [workspaceConfigPath]: { devices: [{ ip: '10.0.0.1', name: 'Workspace Only' }] }
            });

            provider = new RokuDevConfigProvider();
            provider['workspaceConfigPaths'].add(workspaceConfigPath);

            const devices = provider.getConfiguredDevices();
            const names = devices.map(d => d.name).sort();
            expect(names).to.deep.equal(['Home Only', 'Workspace Only']);
        });

        it('still loads home devices when another config file is broken', () => {
            stubFiles({
                [homeConfigPath]: { devices: [{ ip: '10.0.0.3', name: 'Home Device' }] },
                [workspaceConfigPath]: new Error('unexpected token')
            });

            provider = new RokuDevConfigProvider();
            provider['workspaceConfigPaths'].add(workspaceConfigPath);

            expect(provider.getConfiguredDevices()).to.deep.equal([{
                host: '10.0.0.3',
                name: 'Home Device',
                password: undefined
            }]);
        });

        it('skips home config entries that have no ip', () => {
            stubFiles({
                [homeConfigPath]: { devices: [{ name: 'No IP' }, { ip: '10.0.0.4', name: 'Valid' }] }
            });

            provider = new RokuDevConfigProvider();

            const devices = provider.getConfiguredDevices();
            expect(devices.length).to.equal(1);
            expect(devices[0].host).to.equal('10.0.0.4');
        });

        it('falls back to the config file defaultPassword when a device has no password', () => {
            stubFiles({
                [homeConfigPath]: {
                    defaultPassword: 'shared-pass',
                    devices: [
                        { ip: '10.0.0.1', name: 'No Password' },
                        { ip: '10.0.0.2', name: 'Own Password', password: 'own-pass' }
                    ]
                }
            });

            provider = new RokuDevConfigProvider();

            expect(provider.getConfiguredDevices()).to.deep.equal([
                { host: '10.0.0.1', name: 'No Password', password: 'shared-pass' },
                { host: '10.0.0.2', name: 'Own Password', password: 'own-pass' }
            ]);
        });

        it('reads the config from $ROKU_DEV_CONFIG_PATH instead of the home directory when set', () => {
            const overridePath = path.resolve(path.sep, 'custom', 'my-config.json');
            process.env.ROKU_DEV_CONFIG_PATH = overridePath;
            try {
                stubFiles({
                    [homeConfigPath]: { devices: [{ ip: '10.0.0.1', name: 'From Home' }] },
                    [overridePath]: { devices: [{ ip: '10.0.0.2', name: 'From Override' }] }
                });

                provider = new RokuDevConfigProvider();

                const devices = provider.getConfiguredDevices();
                expect(devices.length).to.equal(1);
                expect(devices[0].name).to.equal('From Override');
            } finally {
                delete process.env.ROKU_DEV_CONFIG_PATH;
            }
        });
    });

    describe('getPasswordCandidates', () => {
        it('returns the matched device password followed by defaultPassword values', () => {
            stubFiles({
                [homeConfigPath]: {
                    defaultPassword: 'home-default',
                    devices: [{ ip: '10.0.0.1', password: 'device-pass' }]
                }
            });

            provider = new RokuDevConfigProvider();

            expect(provider.getPasswordCandidates('10.0.0.1')).to.deep.equal(['device-pass', 'home-default']);
        });

        it('uses the file defaultPassword for a matched device without its own password', () => {
            stubFiles({
                [homeConfigPath]: {
                    defaultPassword: 'home-default',
                    devices: [{ ip: '10.0.0.1' }]
                }
            });

            provider = new RokuDevConfigProvider();

            expect(provider.getPasswordCandidates('10.0.0.1')).to.deep.equal(['home-default', 'home-default']);
        });

        it('returns defaultPassword values even when the host is not registered in any config', () => {
            stubFiles({
                [homeConfigPath]: {
                    defaultPassword: 'home-default',
                    devices: [{ ip: '10.0.0.1', password: 'other-device-pass' }]
                }
            });

            provider = new RokuDevConfigProvider();

            expect(provider.getPasswordCandidates('192.168.9.9')).to.deep.equal(['home-default']);
        });

        it('orders matched passwords most-specific config first', () => {
            stubFiles({
                [homeConfigPath]: { devices: [{ ip: '10.0.0.1', password: 'home-pass' }] },
                [workspaceConfigPath]: { devices: [{ ip: '10.0.0.1', password: 'ws-pass' }] }
            });

            provider = new RokuDevConfigProvider();
            provider['workspaceConfigPaths'].add(workspaceConfigPath);

            expect(provider.getPasswordCandidates('10.0.0.1')).to.deep.equal(['ws-pass', 'home-pass']);
        });

        it('returns an empty list when no configs exist', () => {
            stubFiles({});

            provider = new RokuDevConfigProvider();

            expect(provider.getPasswordCandidates('10.0.0.1')).to.deep.equal([]);
        });
    });
});
