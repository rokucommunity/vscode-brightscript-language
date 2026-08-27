import { expect } from 'chai';
import { createSandbox } from 'sinon';
import * as path from 'path';
import { util } from 'brighterscript';
import { util as rokuDeployUtil } from 'roku-deploy';
import { vscode } from '../../mockVscode.spec';

let Module = require('module');
const { require: oldRequire } = Module.prototype;
Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    }
    return oldRequire.apply(this, arguments);
};

import { BsConfigProjectProvider } from './BsConfigProjectProvider';

const sinon = createSandbox();

function makeUri(fsPath: string) {
    return vscode.Uri.file(fsPath);
}

describe('BsConfigProjectProvider', () => {
    let provider: BsConfigProjectProvider;

    beforeEach(() => {
        sinon.restore();
        provider = new BsConfigProjectProvider();

        // asRelativePath is not in the vscode mock; add a passthrough stub
        (vscode.workspace as any).asRelativePath = sinon.stub().callsFake((uri: any) => {
            return typeof uri === 'string' ? uri : uri.fsPath;
        });
        (vscode.workspace as any).getWorkspaceFolder = sinon.stub().returns(undefined);
    });

    afterEach(() => {
        sinon.restore();
    });


    describe('ownsConfig', () => {
        it('returns true for bsconfig.json', () => {
            expect(provider.ownsConfig(makeUri('/project/bsconfig.json'))).to.be.true;
        });

        it('returns true for bsconfig.prod.json', () => {
            expect(provider.ownsConfig(makeUri('/project/bsconfig.prod.json'))).to.be.true;
        });

        it('returns true for bsconfig-dev.json', () => {
            expect(provider.ownsConfig(makeUri('/project/bsconfig-dev.json'))).to.be.true;
        });

        it('returns true for bsconfigFoo.json', () => {
            expect(provider.ownsConfig(makeUri('/project/bsconfigFoo.json'))).to.be.true;
        });

        it('returns false for tsconfig.json', () => {
            expect(provider.ownsConfig(makeUri('/project/tsconfig.json'))).to.be.false;
        });

        it('returns false for package.json', () => {
            expect(provider.ownsConfig(makeUri('/project/package.json'))).to.be.false;
        });

        it('returns false for a file that starts with bsconfig but has no .json extension', () => {
            expect(provider.ownsConfig(makeUri('/project/bsconfig.ts'))).to.be.false;
        });

        it('returns false for a non-file scheme URI', () => {
            const uri = { fsPath: '/project/bsconfig.json', scheme: 'untitled' } as any;
            expect(provider.ownsConfig(uri)).to.be.false;
        });
    });


    describe('findProjectConfigs', () => {
        it('calls workspace.findFiles for the bsconfig glob and returns results', async () => {
            const uri1 = makeUri('/project/bsconfig.json');
            const uri2 = makeUri('/project/bsconfig.prod.json');
            (vscode.workspace as any).findFiles = sinon.stub().resolves([uri1, uri2]);

            const results = await provider.findProjectConfigs();

            expect(results).to.eql([uri1, uri2]);
        });

        it('returns an empty array when no config files are found', async () => {
            (vscode.workspace as any).findFiles = sinon.stub().resolves([]);

            const results = await provider.findProjectConfigs();

            expect(results).to.eql([]);
        });
    });


    describe('afterConfigRegistered', () => {
        it('populates the configByPath with resolved files and rootDir', () => {
            const projectDir = '/project';
            const configUri = makeUri(path.join(projectDir, 'bsconfig.json'));
            const fakeConfig = { files: ['src/**/*.brs'], rootDir: projectDir };

            sinon.stub(util, 'loadConfigFile').returns(fakeConfig as any);
            sinon.stub(util, 'normalizeConfig').returns({
                files: fakeConfig.files,
                rootDir: projectDir,
                stagingDir: path.join(projectDir, 'out', '.roku-deploy-staging')
            } as any);

            provider.afterConfigRegistered(configUri);

            const indexed = (provider as any).configByPath.get(configUri.fsPath);
            expect(indexed).to.not.be.undefined;
            expect(indexed.rootDir).to.equal(projectDir);
        });

        it('silently ignores an invalid or unreadable bsconfig', () => {
            const configUri = makeUri('/project/bsconfig.json');
            sinon.stub(util, 'loadConfigFile').throws(new Error('parse error'));

            expect(() => provider.afterConfigRegistered(configUri)).to.not.throw();
            expect((provider as any).configByPath.has(configUri.fsPath)).to.be.false;
        });

        it('uses stagingFolderPath (deprecated field) when stagingDir is absent', () => {
            const projectDir = '/project';
            const configUri = makeUri(path.join(projectDir, 'bsconfig.json'));

            sinon.stub(util, 'loadConfigFile').returns({} as any);
            sinon.stub(util, 'normalizeConfig').returns({
                files: [],
                rootDir: projectDir,
                stagingDir: undefined,
                stagingFolderPath: 'custom-staging'
            } as any);

            provider.afterConfigRegistered(configUri);

            const indexed = (provider as any).configByPath.get(configUri.fsPath);
            expect(indexed.stagingDir).to.equal(path.resolve(projectDir, 'custom-staging'));
        });

        it('falls back to the default staging dir when neither stagingDir nor stagingFolderPath is set', () => {
            const projectDir = '/project';
            const configUri = makeUri(path.join(projectDir, 'bsconfig.json'));

            sinon.stub(util, 'loadConfigFile').returns({} as any);
            sinon.stub(util, 'normalizeConfig').returns({
                files: [],
                rootDir: projectDir
            } as any);

            provider.afterConfigRegistered(configUri);

            const indexed = (provider as any).configByPath.get(configUri.fsPath);
            expect(indexed.stagingDir).to.equal(path.join(projectDir, 'out', '.roku-deploy-staging'));
        });
    });

    describe('afterConfigUnregistered', () => {
        it('removes the entry from the configByPath', () => {
            const projectDir = '/project';
            const configUri = makeUri(path.join(projectDir, 'bsconfig.json'));

            sinon.stub(util, 'loadConfigFile').returns({} as any);
            sinon.stub(util, 'normalizeConfig').returns({ files: [], rootDir: projectDir } as any);

            provider.afterConfigRegistered(configUri);
            expect((provider as any).configByPath.has(configUri.fsPath)).to.be.true;

            provider.afterConfigUnregistered(configUri);
            expect((provider as any).configByPath.has(configUri.fsPath)).to.be.false;
        });

        it('does not throw when the URI was never registered', () => {
            const configUri = makeUri('/project/bsconfig.json');
            expect(() => provider.afterConfigUnregistered(configUri)).to.not.throw();
        });
    });


    describe('findProjectConfigFromFile', () => {
        it('returns matching config URIs for a file that is part of the project', async () => {
            const projectDir = '/project';
            const configUri = makeUri(path.join(projectDir, 'bsconfig.json'));
            const fileUri = makeUri(path.join(projectDir, 'src', 'main.brs'));

            // Populate the index
            (provider as any).configByPath.set(configUri.fsPath, {
                configUri: configUri,
                files: [{ src: 'src/**/*.brs', dest: 'source' }],
                rootDir: projectDir,
                stagingDir: path.join(projectDir, 'out')
            });

            sinon.stub(rokuDeployUtil, 'getDestPath').returns('source/main.brs');

            const results = await provider.findProjectConfigFromFile(fileUri);

            expect(results).to.have.length(1);
            expect(results[0].fsPath).to.equal(configUri.fsPath);
        });

        it('returns an empty array when no indexed config owns the file', async () => {
            const fileUri = makeUri('/project/src/main.brs');
            sinon.stub(rokuDeployUtil, 'getDestPath').returns(undefined as any);

            const results = await provider.findProjectConfigFromFile(fileUri);

            expect(results).to.have.length(0);
        });

        it('returns multiple matches when several configs own the same file', async () => {
            const projectDir = '/project';
            const configUri1 = makeUri(path.join(projectDir, 'bsconfig.json'));
            const configUri2 = makeUri(path.join(projectDir, 'bsconfig.prod.json'));
            const fileUri = makeUri(path.join(projectDir, 'src', 'main.brs'));

            (provider as any).configByPath.set(configUri1.fsPath, {
                configUri: configUri1, files: [], rootDir: projectDir, stagingDir: ''
            });
            (provider as any).configByPath.set(configUri2.fsPath, {
                configUri: configUri2, files: [], rootDir: projectDir, stagingDir: ''
            });

            sinon.stub(rokuDeployUtil, 'getDestPath').returns('source/main.brs');

            const results = await provider.findProjectConfigFromFile(fileUri);

            expect(results).to.have.length(2);
        });
    });


    describe('createProject', () => {
        it('generates the correct task name from the config URI', () => {
            const configUri = makeUri('/workspace/project/bsconfig.json');
            (vscode.workspace as any).asRelativePath = sinon.stub().returns('project/bsconfig.json');
            (provider as any).configByPath.set(configUri.fsPath, {
                configUri: configUri,
                files: [],
                rootDir: '/workspace/project',
                stagingDir: '/workspace/project/out/.roku-deploy-staging'
            });

            const result = provider.createProject(configUri);

            expect(result.taskName).to.equal('build project/bsconfig.json');
        });

        it('embeds the config filename in the bsc command', () => {
            const configUri = makeUri('/workspace/project/bsconfig.json');
            (vscode.workspace as any).asRelativePath = sinon.stub().returns('project/bsconfig.json');
            (provider as any).configByPath.set(configUri.fsPath, {
                configUri: configUri,
                files: [],
                rootDir: '/workspace/project',
                stagingDir: '/workspace/project/out/.roku-deploy-staging'
            });

            const result = provider.createProject(configUri);

            expect(result.taskConfig.command).to.include('"bsconfig.json"');
        });

        it('produces a debug config name with no flavor for bsconfig.json', () => {
            const configUri = makeUri('/workspace/myapp/bsconfig.json');
            (vscode.workspace as any).asRelativePath = sinon.stub().returns('myapp/bsconfig.json');
            (provider as any).configByPath.set(configUri.fsPath, {
                configUri: configUri,
                files: [],
                rootDir: '/workspace/myapp',
                stagingDir: '/workspace/myapp/out/.roku-deploy-staging'
            });

            const result = provider.createProject(configUri);

            expect(result.debugConfig.name).to.equal('Debug myapp');
        });

        it('appends the flavor in parentheses for bsconfig.prod.json', () => {
            const configUri = makeUri('/workspace/myapp/bsconfig.prod.json');
            (vscode.workspace as any).asRelativePath = sinon.stub().returns('myapp/bsconfig.prod.json');
            (provider as any).configByPath.set(configUri.fsPath, {
                configUri: configUri,
                files: [],
                rootDir: '/workspace/myapp',
                stagingDir: '/workspace/myapp/out/.roku-deploy-staging'
            });

            const result = provider.createProject(configUri);

            expect(result.debugConfig.name).to.equal('Debug myapp (prod)');
        });

        it('uses the indexed stagingDir as the debug rootDir', () => {
            const configUri = makeUri('/workspace/myapp/bsconfig.json');
            const stagingDir = '/workspace/myapp/custom-staging';
            (vscode.workspace as any).asRelativePath = sinon.stub().returns('myapp/bsconfig.json');
            (provider as any).configByPath.set(configUri.fsPath, {
                configUri: configUri,
                files: [],
                rootDir: '/workspace/myapp',
                stagingDir: stagingDir
            });

            const result = provider.createProject(configUri);

            expect(result.debugConfig.rootDir).to.equal(stagingDir);
        });

        it('falls back to resolving stagingDir from file when not indexed', () => {
            const projectDir = '/workspace/myapp';
            const configUri = makeUri(path.join(projectDir, 'bsconfig.json'));
            (vscode.workspace as any).asRelativePath = sinon.stub().returns('myapp/bsconfig.json');

            sinon.stub(util, 'loadConfigFile').returns({} as any);
            sinon.stub(util, 'normalizeConfig').returns({
                files: [],
                rootDir: projectDir,
                stagingDir: path.join(projectDir, 'out', '.roku-deploy-staging')
            } as any);

            const result = provider.createProject(configUri);

            expect(result.debugConfig.rootDir).to.equal(path.join(projectDir, 'out', '.roku-deploy-staging'));
        });

        it('sets files to ["**/*"] in the debug config so the debugger deploys all staged files', () => {
            const configUri = makeUri('/workspace/myapp/bsconfig.json');
            (vscode.workspace as any).asRelativePath = sinon.stub().returns('myapp/bsconfig.json');
            (provider as any).configByPath.set(configUri.fsPath, {
                configUri: configUri, files: [], rootDir: '/workspace/myapp',
                stagingDir: '/workspace/myapp/out/.roku-deploy-staging'
            });

            const result = provider.createProject(configUri);

            expect(result.debugConfig.files).to.eql(['**/*']);
        });

        it('includes the preLaunchTask in the debug config', () => {
            const configUri = makeUri('/workspace/myapp/bsconfig.json');
            (vscode.workspace as any).asRelativePath = sinon.stub().returns('myapp/bsconfig.json');
            (provider as any).configByPath.set(configUri.fsPath, {
                configUri: configUri, files: [], rootDir: '/workspace/myapp',
                stagingDir: '/workspace/myapp/out/.roku-deploy-staging'
            });

            const result = provider.createProject(configUri);

            expect(result.debugConfig.preLaunchTask).to.equal('BrightScript: build myapp/bsconfig.json');
        });

        it('sets the cwd of the task to the project directory', () => {
            const configUri = makeUri('/workspace/myapp/bsconfig.json');
            (vscode.workspace as any).asRelativePath = sinon.stub().returns('myapp/bsconfig.json');
            (provider as any).configByPath.set(configUri.fsPath, {
                configUri: configUri, files: [], rootDir: '/workspace/myapp',
                stagingDir: '/workspace/myapp/out/.roku-deploy-staging'
            });

            const result = provider.createProject(configUri);

            expect(result.taskConfig.cwd).to.equal('/workspace/myapp');
        });
    });
});
