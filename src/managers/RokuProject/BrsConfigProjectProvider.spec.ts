import { expect } from 'chai';
import { createSandbox } from 'sinon';
import * as path from 'path';
import * as fs from 'fs';
import { rokuDeploy } from 'roku-deploy';
import { vscode } from '../../mockVscode.spec';

let Module = require('module');
const { require: oldRequire } = Module.prototype;
Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    }
    return oldRequire.apply(this, arguments);
};

import { BrsConfigProjectProvider } from './BrsConfigProjectProvider';

const sinon = createSandbox();

function makeUri(fsPath: string) {
    return vscode.Uri.file(fsPath);
}

describe('BrsConfigProjectProvider', () => {
    let provider: BrsConfigProjectProvider;

    beforeEach(() => {
        sinon.restore();
        provider = new BrsConfigProjectProvider();

        (vscode.workspace as any).asRelativePath = sinon.stub().callsFake((uri: any) => (typeof uri === 'string' ? uri : uri.fsPath));
        (vscode.workspace as any).getWorkspaceFolder = sinon.stub().returns(undefined);
    });

    afterEach(() => {
        sinon.restore();
    });

    // -------------------------------------------------------------------------
    // ownsConfig
    // -------------------------------------------------------------------------

    describe('ownsConfig', () => {
        it('returns true for brsconfig.json', () => {
            expect(provider.ownsConfig(makeUri('/project/brsconfig.json'))).to.be.true;
        });

        it('returns true for brsconfig.prod.json', () => {
            expect(provider.ownsConfig(makeUri('/project/brsconfig.prod.json'))).to.be.true;
        });

        it('returns true for brsconfig-dev.json', () => {
            expect(provider.ownsConfig(makeUri('/project/brsconfig-dev.json'))).to.be.true;
        });

        it('returns true for brsconfigFoo.json', () => {
            expect(provider.ownsConfig(makeUri('/project/brsconfigFoo.json'))).to.be.true;
        });

        it('returns false for tsconfig.json', () => {
            expect(provider.ownsConfig(makeUri('/project/tsconfig.json'))).to.be.false;
        });

        it('returns false for bsconfig.json', () => {
            expect(provider.ownsConfig(makeUri('/project/bsconfig.json'))).to.be.false;
        });

        it('returns false for package.json', () => {
            expect(provider.ownsConfig(makeUri('/project/package.json'))).to.be.false;
        });

        it('returns false for a file that starts with brsconfig but has no .json extension', () => {
            expect(provider.ownsConfig(makeUri('/project/brsconfig.ts'))).to.be.false;
        });

        it('returns false for a non-file scheme URI', () => {
            const uri = { fsPath: '/project/brsconfig.json', scheme: 'untitled' } as any;
            expect(provider.ownsConfig(uri)).to.be.false;
        });
    });

    // -------------------------------------------------------------------------
    // findProjectConfigs
    // -------------------------------------------------------------------------

    describe('findProjectConfigs', () => {
        it('calls workspace.findFiles for the brsconfig glob and returns results', async () => {
            const uri1 = makeUri('/project/brsconfig.json');
            const uri2 = makeUri('/project/brsconfig.prod.json');
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

    // -------------------------------------------------------------------------
    // afterConfigRegistered / afterConfigUnregistered
    // -------------------------------------------------------------------------

    describe('afterConfigRegistered', () => {
        it('populates the configByPath with files and rootDir', () => {
            const projectDir = '/project';
            const configUri = makeUri(path.join(projectDir, 'brsconfig.json'));
            const fakeConfig = { files: ['src/**/*.brs'], rootDir: 'src' };

            sinon.stub(fs, 'readFileSync').returns(JSON.stringify(fakeConfig) as any);

            provider.afterConfigRegistered(configUri);

            const indexed = (provider as any).configByPath.get(configUri.fsPath);
            expect(indexed).to.not.be.undefined;
            expect(indexed.files).to.eql(fakeConfig.files);
            expect(indexed.rootDir).to.equal(path.resolve(projectDir, 'src'));
        });

        it('uses the projectDir as rootDir when rootDir is absent from config', () => {
            const configUri = makeUri(path.join('/project', 'brsconfig.json'));

            sinon.stub(fs, 'readFileSync').returns(JSON.stringify({ files: [] }) as any);

            provider.afterConfigRegistered(configUri);

            const indexed = (provider as any).configByPath.get(configUri.fsPath);
            // Use path.dirname to get the OS-normalized expected value (avoids / vs \ on Windows)
            expect(indexed.rootDir).to.equal(path.dirname(configUri.fsPath));
        });

        it('silently ignores an invalid or unreadable brsconfig', () => {
            const configUri = makeUri('/project/brsconfig.json');
            sinon.stub(fs, 'readFileSync').throws(new Error('read error'));

            expect(() => provider.afterConfigRegistered(configUri)).to.not.throw();
            expect((provider as any).configByPath.has(configUri.fsPath)).to.be.false;
        });

        it('silently ignores a brsconfig with invalid JSON', () => {
            const configUri = makeUri('/project/brsconfig.json');
            sinon.stub(fs, 'readFileSync').returns('not valid json' as any);

            expect(() => provider.afterConfigRegistered(configUri)).to.not.throw();
            expect((provider as any).configByPath.has(configUri.fsPath)).to.be.false;
        });

        it('defaults files to an empty array when the field is absent', () => {
            const projectDir = '/project';
            const configUri = makeUri(path.join(projectDir, 'brsconfig.json'));

            sinon.stub(fs, 'readFileSync').returns(JSON.stringify({}) as any);

            provider.afterConfigRegistered(configUri);

            const indexed = (provider as any).configByPath.get(configUri.fsPath);
            expect(indexed.files).to.eql([]);
        });
    });

    describe('afterConfigUnregistered', () => {
        it('removes the entry from the configByPath', () => {
            const projectDir = '/project';
            const configUri = makeUri(path.join(projectDir, 'brsconfig.json'));

            sinon.stub(fs, 'readFileSync').returns(JSON.stringify({ files: [], rootDir: projectDir }) as any);

            provider.afterConfigRegistered(configUri);
            expect((provider as any).configByPath.has(configUri.fsPath)).to.be.true;

            provider.afterConfigUnregistered(configUri);
            expect((provider as any).configByPath.has(configUri.fsPath)).to.be.false;
        });

        it('does not throw when the URI was never registered', () => {
            const configUri = makeUri('/project/brsconfig.json');
            expect(() => provider.afterConfigUnregistered(configUri)).to.not.throw();
        });
    });

    // -------------------------------------------------------------------------
    // findProjectConfigFromFile
    // -------------------------------------------------------------------------

    describe('findProjectConfigFromFile', () => {
        it('returns matching config URIs for a file that is part of the project', async () => {
            const projectDir = '/project';
            const configUri = makeUri(path.join(projectDir, 'brsconfig.json'));
            const fileUri = makeUri(path.join(projectDir, 'src', 'main.brs'));

            (provider as any).configByPath.set(configUri.fsPath, {
                configUri: configUri,
                files: [{ src: 'src/**/*.brs', dest: 'source' }],
                rootDir: projectDir
            });

            sinon.stub(rokuDeploy, 'getDestPath').returns('source/main.brs');

            const results = await provider.findProjectConfigFromFile(fileUri);

            expect(results).to.have.length(1);
            expect(results[0].fsPath).to.equal(configUri.fsPath);
        });

        it('returns an empty array when no indexed config owns the file', async () => {
            const fileUri = makeUri('/project/src/main.brs');
            sinon.stub(rokuDeploy, 'getDestPath').returns(undefined as any);

            const results = await provider.findProjectConfigFromFile(fileUri);

            expect(results).to.have.length(0);
        });

        it('returns multiple matches when several configs own the same file', async () => {
            const projectDir = '/project';
            const configUri1 = makeUri(path.join(projectDir, 'brsconfig.json'));
            const configUri2 = makeUri(path.join(projectDir, 'brsconfig.prod.json'));
            const fileUri = makeUri(path.join(projectDir, 'src', 'main.brs'));

            (provider as any).configByPath.set(configUri1.fsPath, {
                configUri: configUri1, files: [], rootDir: projectDir
            });
            (provider as any).configByPath.set(configUri2.fsPath, {
                configUri: configUri2, files: [], rootDir: projectDir
            });

            sinon.stub(rokuDeploy, 'getDestPath').returns('source/main.brs');

            const results = await provider.findProjectConfigFromFile(fileUri);

            expect(results).to.have.length(2);
        });
    });

    // -------------------------------------------------------------------------
    // createProject
    // -------------------------------------------------------------------------

    describe('createProject', () => {
        it('produces a debug config name with no flavor for brsconfig.json', () => {
            const configUri = makeUri('/workspace/myapp/brsconfig.json');
            (provider as any).configByPath.set(configUri.fsPath, {
                configUri: configUri, files: [], rootDir: '/workspace/myapp'
            });

            const result = provider.createProject(configUri);

            expect(result.debugConfig.name).to.equal('Debug myapp');
        });

        it('appends the flavor in parentheses for brsconfig.prod.json', () => {
            const configUri = makeUri('/workspace/myapp/brsconfig.prod.json');
            (provider as any).configByPath.set(configUri.fsPath, {
                configUri: configUri, files: [], rootDir: '/workspace/myapp'
            });

            const result = provider.createProject(configUri);

            expect(result.debugConfig.name).to.equal('Debug myapp (prod)');
        });

        it('uses the indexed rootDir as the debug rootDir', () => {
            const configUri = makeUri('/workspace/myapp/brsconfig.json');
            const rootDir = '/workspace/myapp/src';
            (provider as any).configByPath.set(configUri.fsPath, {
                configUri: configUri, files: [], rootDir: rootDir
            });

            const result = provider.createProject(configUri);

            expect(result.debugConfig.rootDir).to.equal(rootDir);
        });

        it('falls back to projectDir when no config is indexed', () => {
            const configUri = makeUri('/workspace/myapp/brsconfig.json');

            const result = provider.createProject(configUri);

            expect(result.debugConfig.rootDir).to.equal('/workspace/myapp');
        });

        it('includes the files array from the indexed config in the debug config', () => {
            const configUri = makeUri('/workspace/myapp/brsconfig.json');
            const files = [{ src: 'src/**/*.brs', dest: 'source' }];
            (provider as any).configByPath.set(configUri.fsPath, {
                configUri: configUri, files: files, rootDir: '/workspace/myapp'
            });

            const result = provider.createProject(configUri);

            expect(result.debugConfig.files).to.eql(files);
        });

        it('does not include a taskName or taskConfig', () => {
            const configUri = makeUri('/workspace/myapp/brsconfig.json');
            (provider as any).configByPath.set(configUri.fsPath, {
                configUri: configUri, files: [], rootDir: '/workspace/myapp'
            });

            const result = provider.createProject(configUri);

            expect(result.taskName).to.be.undefined;
            expect(result.taskConfig).to.be.undefined;
        });

        it('does not include a preLaunchTask in the debug config', () => {
            const configUri = makeUri('/workspace/myapp/brsconfig.json');
            (provider as any).configByPath.set(configUri.fsPath, {
                configUri: configUri, files: [], rootDir: '/workspace/myapp'
            });

            const result = provider.createProject(configUri);

            expect(result.debugConfig.preLaunchTask).to.be.undefined;
        });

        it('populates project.projectDir and project.projectName correctly', () => {
            const configUri = makeUri('/workspace/myapp/brsconfig.json');
            (provider as any).configByPath.set(configUri.fsPath, {
                configUri: configUri, files: [], rootDir: '/workspace/myapp'
            });

            const result = provider.createProject(configUri);

            expect(result.project.projectDir).to.equal('/workspace/myapp');
            expect(result.project.projectName).to.equal('myapp');
        });
    });
});
