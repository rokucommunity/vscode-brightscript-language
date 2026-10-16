import { expect } from 'chai';
import { createSandbox } from 'sinon';
import * as path from 'path';
import { vscode } from '../../mockVscode.spec';

let Module = require('module');
const { require: oldRequire } = Module.prototype;
Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    }
    return oldRequire.apply(this, arguments);
};

import { RokuConfigProjectProvider } from './RokuConfigProjectProvider';

const sinon = createSandbox();

const ROKU_CONFIG_FILENAME = 'roku-config.ts';

function makeUri(fsPath: string) {
    return vscode.Uri.file(fsPath);
}

describe('RokuConfigProjectProvider', () => {
    let provider: RokuConfigProjectProvider;

    beforeEach(() => {
        sinon.restore();
        provider = new RokuConfigProjectProvider();

        (vscode.workspace as any).asRelativePath = sinon.stub().callsFake((uri: any) => (typeof uri === 'string' ? uri : uri.fsPath)
        );
        (vscode.workspace as any).getWorkspaceFolder = sinon.stub().returns(undefined);

        // Ensure workspace.fs.stat exists so sinon can stub it
        if (!(vscode.workspace.fs as any).stat) {
            (vscode.workspace.fs as any).stat = () => Promise.resolve({});
        }
    });

    afterEach(() => {
        sinon.restore();
    });


    describe('ownsConfig', () => {
        it('returns true for roku-config.ts', () => {
            expect(provider.ownsConfig(makeUri('/project/roku-config.ts'))).to.be.true;
        });

        it('returns false for other filenames', () => {
            expect(provider.ownsConfig(makeUri('/project/roku-config.js'))).to.be.false;
            expect(provider.ownsConfig(makeUri('/project/bsconfig.json'))).to.be.false;
            expect(provider.ownsConfig(makeUri('/project/config.ts'))).to.be.false;
        });

        it('returns false when only the directory contains roku-config.ts as part of its name', () => {
            expect(provider.ownsConfig(makeUri('/roku-config.ts-dir/other.ts'))).to.be.false;
        });
    });


    describe('findProjectConfigs', () => {
        it('calls workspace.findFiles with the roku-config.ts glob', async () => {
            const uri = makeUri('/project/roku-config.ts');
            const stub = sinon.stub(vscode.workspace, 'findFiles').resolves([uri]);

            const results = await provider.findProjectConfigs();

            expect(stub.calledOnce).to.be.true;
            expect((stub.firstCall.args[0] as string)).to.include(ROKU_CONFIG_FILENAME);
            expect(results).to.eql([uri]);
        });

        it('returns an empty array when no config files are found', async () => {
            sinon.stub(vscode.workspace, 'findFiles').resolves([]);

            const results = await provider.findProjectConfigs();

            expect(results).to.eql([]);
        });
    });


    describe('findProjectConfigFromFile', () => {
        let statStub: sinon.SinonStub;

        beforeEach(() => {
            statStub = sinon.stub(vscode.workspace.fs as any, 'stat');
        });

        it('returns the config URI when roku-config.ts exists in the same directory', async () => {
            const projectDir = '/workspace/project';
            const fileUri = makeUri(path.join(projectDir, 'src', 'main.brs'));
            const expectedConfig = path.join(projectDir, 'src', ROKU_CONFIG_FILENAME);

            (vscode.workspace as any).getWorkspaceFolder = sinon.stub().returns({
                uri: makeUri('/workspace')
            });

            statStub.callsFake((uri: any) => {
                if (uri.fsPath === expectedConfig) {
                    return {};
                }
                throw new Error('not found');
            });

            const results = await provider.findProjectConfigFromFile(fileUri);

            expect(results).to.have.length(1);
            expect(results[0].fsPath).to.equal(expectedConfig);
        });

        it('walks up to a parent directory to find roku-config.ts', async () => {
            const projectDir = '/workspace/project';
            const fileUri = makeUri(path.join(projectDir, 'src', 'components', 'main.brs'));
            const expectedConfig = path.join(projectDir, ROKU_CONFIG_FILENAME);

            (vscode.workspace as any).getWorkspaceFolder = sinon.stub().returns({
                uri: makeUri('/workspace')
            });

            statStub.callsFake((uri: any) => {
                if (uri.fsPath === expectedConfig) {
                    return {};
                }
                throw new Error('not found');
            });

            const results = await provider.findProjectConfigFromFile(fileUri);

            expect(results).to.have.length(1);
            expect(results[0].fsPath).to.equal(expectedConfig);
        });

        it('returns an empty array when roku-config.ts is not found anywhere in the tree', async () => {
            const fileUri = makeUri('/workspace/project/src/main.brs');

            (vscode.workspace as any).getWorkspaceFolder = sinon.stub().returns({
                uri: makeUri('/workspace')
            });

            // stat always rejects — no config file anywhere
            statStub.rejects(new Error('not found'));

            const results = await provider.findProjectConfigFromFile(fileUri);

            expect(results).to.eql([]);
        });

        it('stops walking at the workspace root', async () => {
            const workspaceRoot = path.join(path.sep, 'workspace');
            const fileUri = makeUri(path.join(workspaceRoot, 'src', 'main.brs'));

            (vscode.workspace as any).getWorkspaceFolder = sinon.stub().returns({
                uri: makeUri(workspaceRoot)
            });

            // Config only exists above the workspace root — should not be found
            statStub.callsFake((uri: any) => {
                if (uri.fsPath === path.join('/', ROKU_CONFIG_FILENAME)) {
                    return {};
                }
                throw new Error('not found');
            });

            const results = await provider.findProjectConfigFromFile(fileUri);

            expect(results).to.eql([]);
        });

        it('returns an empty array when there is no workspace folder', async () => {
            const fileUri = makeUri('/workspace/project/src/main.brs');
            (vscode.workspace as any).getWorkspaceFolder = sinon.stub().returns(undefined);
            statStub.rejects(new Error('not found'));

            const results = await provider.findProjectConfigFromFile(fileUri);

            expect(results).to.eql([]);
        });
    });


    describe('createProject', () => {
        it('generates a taskName from the relative config path', () => {
            const configUri = makeUri('/workspace/project/roku-config.ts');
            (vscode.workspace as any).asRelativePath = sinon.stub().returns('project/roku-config.ts');

            const result = provider.createProject(configUri);

            expect(result.taskName).to.equal('build project/roku-config.ts');
        });

        it('uses "npx rk build --dev" as the task command', () => {
            const configUri = makeUri('/workspace/project/roku-config.ts');

            const result = provider.createProject(configUri);

            expect(result.taskConfig.command).to.equal('npx --no rk build --dev');
        });

        it('sets the task cwd to the project directory', () => {
            const configUri = makeUri('/workspace/project/roku-config.ts');

            const result = provider.createProject(configUri);

            expect(result.taskConfig.cwd).to.equal('/workspace/project');
        });

        it('sets the debug rootDir to dist-build/bundle inside the project', () => {
            const configUri = makeUri('/workspace/project/roku-config.ts');

            const result = provider.createProject(configUri);

            expect(result.debugConfig.rootDir).to.equal(
                path.join('/workspace/project', 'dist-build', 'bundle')
            );
        });

        it('names the debug config "Debug <projectName>"', () => {
            const configUri = makeUri('/workspace/myapp/roku-config.ts');

            const result = provider.createProject(configUri);

            expect(result.debugConfig.name).to.equal('Debug myapp');
        });

        it('sets preLaunchTask to match the generated taskName', () => {
            const configUri = makeUri('/workspace/project/roku-config.ts');
            (vscode.workspace as any).asRelativePath = sinon.stub().returns('project/roku-config.ts');

            const result = provider.createProject(configUri);

            expect(result.debugConfig.preLaunchTask).to.equal('BrightScript: build project/roku-config.ts');
        });

        it('populates project.projectDir and project.projectName correctly', () => {
            const configUri = makeUri('/workspace/myapp/roku-config.ts');

            const result = provider.createProject(configUri);

            expect(result.project.projectDir).to.equal('/workspace/myapp');
            expect(result.project.projectName).to.equal('myapp');
        });
    });
});
