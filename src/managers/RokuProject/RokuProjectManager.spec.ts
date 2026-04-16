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

import { RokuProjectManager } from './RokuProjectManager';
import type { DiscoveredRokuProject, ProjectBuildResult, ProjectConfigProvider } from './RokuProjectManager';

const sinon = createSandbox();

function makeUri(fsPath: string) {
    return vscode.Uri.file(fsPath);
}

function makeProject(projectDir: string, configUri: ReturnType<typeof makeUri>): DiscoveredRokuProject {
    return {
        configUri: configUri,
        projectDir: projectDir,
        projectName: path.basename(projectDir)
    };
}

function makeBuildResult(projectDir: string, configUri: ReturnType<typeof makeUri>): ProjectBuildResult {
    const project = makeProject(projectDir, configUri);
    return {
        project: project,
        taskName: `build ${projectDir}`,
        taskConfig: { command: 'npx bsc', cwd: projectDir, workspaceFolder: undefined },
        debugConfig: { type: 'brightscript', request: 'launch', name: `Debug ${project.projectName}` }
    };
}

function makeMockProvider(ownsResult = false): ProjectConfigProvider {
    return {
        configFileSelector: [{ pattern: '**/bsconfig.json', scheme: 'file' }],
        excludePatterns: [],
        ownsConfig: sinon.stub().returns(ownsResult),
        findProjectConfigs: sinon.stub().resolves([]),
        findProjectConfigFromFile: sinon.stub().resolves([]),
        createProject: sinon.stub(),
        afterConfigRegistered: sinon.stub(),
        afterConfigUnregistered: sinon.stub()
    };
}

describe('RokuProjectManager', () => {
    let manager: RokuProjectManager;
    let taskRegistry: { registerTask: sinon.SinonStub; unregisterTask: sinon.SinonStub };
    let viewProvider: { setProjects: sinon.SinonStub };
    let mockProvider: ProjectConfigProvider;

    beforeEach(() => {
        sinon.restore();

        taskRegistry = {
            registerTask: sinon.stub(),
            unregisterTask: sinon.stub()
        };

        viewProvider = {
            setProjects: sinon.stub()
        };

        // Add methods missing from the mock that RokuProjectManager calls
        (vscode.languages as any).registerCodeLensProvider = sinon.stub().returns({ dispose: () => { } });
        (vscode.window as any).createStatusBarItem = sinon.stub().returns({
            text: '',
            command: undefined,
            tooltip: undefined,
            show: sinon.stub(),
            hide: sinon.stub(),
            dispose: sinon.stub()
        });
        sinon.stub(vscode.commands, 'executeCommand');
        (vscode.workspace as any).asRelativePath = sinon.stub().callsFake((uri: any) => {
            return typeof uri === 'string' ? uri : uri.fsPath;
        });
        // Use a CodeLens class that preserves constructor arguments for assertions
        (vscode as any).CodeLens = class {
            constructor(public range: any, public command: any) { }
        };

        manager = new RokuProjectManager(taskRegistry as any, viewProvider as any);

        mockProvider = makeMockProvider();
        (manager as any).providers = [mockProvider];
    });

    afterEach(() => {
        sinon.restore();
    });

    // -------------------------------------------------------------------------
    // registerProject
    // -------------------------------------------------------------------------

    describe('registerProject', () => {
        it('registers a task and project when a provider owns the URI', () => {
            const uri = makeUri('/workspace/project/bsconfig.json');
            const result = makeBuildResult('/workspace/project', uri);

            (mockProvider.ownsConfig as sinon.SinonStub).returns(true);
            (mockProvider.createProject as sinon.SinonStub).returns(result);

            (manager as any).registerProject(uri);

            expect(taskRegistry.registerTask.calledOnceWith(result.taskName, result.taskConfig)).to.be.true;
            expect(viewProvider.setProjects.calledOnce).to.be.true;
        });

        it('stores the project in discoveredProjects', () => {
            const uri = makeUri('/workspace/project/bsconfig.json');
            const result = makeBuildResult('/workspace/project', uri);

            (mockProvider.ownsConfig as sinon.SinonStub).returns(true);
            (mockProvider.createProject as sinon.SinonStub).returns(result);

            (manager as any).registerProject(uri);

            expect((manager as any).discoveredProjects.has('/workspace/project')).to.be.true;
        });

        it('calls afterConfigRegistered on the owning provider', () => {
            const uri = makeUri('/workspace/project/bsconfig.json');
            const result = makeBuildResult('/workspace/project', uri);

            (mockProvider.ownsConfig as sinon.SinonStub).returns(true);
            (mockProvider.createProject as sinon.SinonStub).returns(result);

            (manager as any).registerProject(uri);

            expect((mockProvider.afterConfigRegistered as sinon.SinonStub).calledOnceWith(uri)).to.be.true;
        });

        it('does nothing when no provider owns the URI', () => {
            const uri = makeUri('/workspace/project/unknown.json');
            (mockProvider.ownsConfig as sinon.SinonStub).returns(false);

            (manager as any).registerProject(uri);

            expect(taskRegistry.registerTask.called).to.be.false;
            expect(viewProvider.setProjects.called).to.be.false;
        });

        it('skips when a higher-priority provider already owns an ancestor directory', () => {
            const highPri = makeMockProvider();
            const lowPri = makeMockProvider();
            (manager as any).providers = [highPri, lowPri];

            // Register /workspace via the high-priority provider
            const highPriUri = makeUri('/workspace/bsconfig.json');
            const highPriBuild = makeBuildResult('/workspace', highPriUri);
            (highPri.ownsConfig as sinon.SinonStub).returns(true);
            (highPri.createProject as sinon.SinonStub).returns(highPriBuild);
            (highPri.afterConfigRegistered as sinon.SinonStub);
            (manager as any).registerProject(highPriUri);

            // Now try to register a project in a subdirectory via the low-priority provider
            // '/workspace/sub'.startsWith('/workspace/') → true → should be skipped
            (highPri.ownsConfig as sinon.SinonStub).returns(false);
            (lowPri.ownsConfig as sinon.SinonStub).returns(true);
            const lowPriUri = makeUri('/workspace/sub/bsconfig.json');
            const lowPriBuild = makeBuildResult('/workspace/sub', lowPriUri);
            (lowPri.createProject as sinon.SinonStub).returns(lowPriBuild);

            const callsBefore = taskRegistry.registerTask.callCount;
            (manager as any).registerProject(lowPriUri);

            expect(taskRegistry.registerTask.callCount).to.equal(callsBefore);
            expect((lowPri.afterConfigRegistered as sinon.SinonStub).called).to.be.false;
        });

        it('allows registering two projects in different directories', () => {
            const uri1 = makeUri('/workspace/project-a/bsconfig.json');
            const uri2 = makeUri('/workspace/project-b/bsconfig.json');
            const result1 = makeBuildResult('/workspace/project-a', uri1);
            const result2 = makeBuildResult('/workspace/project-b', uri2);

            (mockProvider.ownsConfig as sinon.SinonStub).returns(true);
            (mockProvider.createProject as sinon.SinonStub)
                .onFirstCall().returns(result1)
                .onSecondCall().returns(result2);

            (manager as any).registerProject(uri1);
            (manager as any).registerProject(uri2);

            expect((manager as any).discoveredProjects.size).to.equal(2);
            expect(taskRegistry.registerTask.callCount).to.equal(2);
        });
    });

    // -------------------------------------------------------------------------
    // unregisterProject
    // -------------------------------------------------------------------------

    describe('unregisterProject', () => {
        it('unregisters the task and removes the project', () => {
            const uri = makeUri('/workspace/project/bsconfig.json');
            const result = makeBuildResult('/workspace/project', uri);

            (mockProvider.ownsConfig as sinon.SinonStub).returns(true);
            (mockProvider.createProject as sinon.SinonStub).returns(result);

            (manager as any).registerProject(uri);
            expect((manager as any).discoveredProjects.size).to.equal(1);

            (manager as any).unregisterProject(uri);

            expect(taskRegistry.unregisterTask.calledOnceWith(result.taskName)).to.be.true;
            expect((manager as any).discoveredProjects.size).to.equal(0);
            expect(viewProvider.setProjects.callCount).to.equal(2); // once for register, once for unregister
        });

        it('calls afterConfigUnregistered on the owning provider', () => {
            const uri = makeUri('/workspace/project/bsconfig.json');
            const result = makeBuildResult('/workspace/project', uri);

            (mockProvider.ownsConfig as sinon.SinonStub).returns(true);
            (mockProvider.createProject as sinon.SinonStub).returns(result);

            (manager as any).registerProject(uri);
            (manager as any).unregisterProject(uri);

            expect((mockProvider.afterConfigUnregistered as sinon.SinonStub).calledOnceWith(uri)).to.be.true;
        });

        it('does nothing when no provider owns the URI', () => {
            const uri = makeUri('/workspace/project/unknown.json');
            (mockProvider.ownsConfig as sinon.SinonStub).returns(false);

            (manager as any).unregisterProject(uri);

            expect(taskRegistry.unregisterTask.called).to.be.false;
        });

        it('removes the provider-index entry so the dir can be reclaimed later', () => {
            const uri = makeUri('/workspace/project/bsconfig.json');
            const result = makeBuildResult('/workspace/project', uri);

            (mockProvider.ownsConfig as sinon.SinonStub).returns(true);
            (mockProvider.createProject as sinon.SinonStub).returns(result);

            (manager as any).registerProject(uri);
            (manager as any).unregisterProject(uri);

            expect((manager as any).providerIndexByProjectDir.has('/workspace/project')).to.be.false;
        });
    });

    // -------------------------------------------------------------------------
    // syncProjects
    // -------------------------------------------------------------------------

    describe('syncProjects', () => {
        it('calls findProjectConfigs on every provider and registers each URI', async () => {
            const uri1 = makeUri('/workspace/a/bsconfig.json');
            const uri2 = makeUri('/workspace/b/bsconfig.json');
            (mockProvider.findProjectConfigs as sinon.SinonStub).resolves([uri1, uri2]);

            const registerStub = sinon.stub(manager as any, 'registerProject');
            await (manager as any).syncProjects();

            expect(registerStub.calledTwice).to.be.true;
            expect(registerStub.firstCall.args[0]).to.equal(uri1);
            expect(registerStub.secondCall.args[0]).to.equal(uri2);
        });

        it('does not call registerProject when a provider returns no configs', async () => {
            (mockProvider.findProjectConfigs as sinon.SinonStub).resolves([]);

            const registerStub = sinon.stub(manager as any, 'registerProject');
            await (manager as any).syncProjects();

            expect(registerStub.called).to.be.false;
        });

        it('processes configs from multiple providers', async () => {
            const provider2 = makeMockProvider();
            (manager as any).providers = [mockProvider, provider2];

            const uri1 = makeUri('/workspace/a/bsconfig.json');
            const uri2 = makeUri('/workspace/b/brsconfig.json');
            (mockProvider.findProjectConfigs as sinon.SinonStub).resolves([uri1]);
            (provider2.findProjectConfigs as sinon.SinonStub).resolves([uri2]);

            const registerStub = sinon.stub(manager as any, 'registerProject');
            await (manager as any).syncProjects();

            expect(registerStub.callCount).to.equal(2);
        });
    });

    // -------------------------------------------------------------------------
    // updateStatusBar
    // -------------------------------------------------------------------------

    describe('syncStatusBar', () => {
        it('shows the item when at least one project is registered', () => {
            const item = { show: sinon.stub(), hide: sinon.stub() };
            (manager as any).statusBarItem = item;

            const uri = makeUri('/workspace/project/bsconfig.json');
            const result = makeBuildResult('/workspace/project', uri);
            (mockProvider.ownsConfig as sinon.SinonStub).returns(true);
            (mockProvider.createProject as sinon.SinonStub).returns(result);
            (manager as any).registerProject(uri);

            expect(item.show.calledOnce).to.be.true;
            expect(item.hide.called).to.be.false;
        });

        it('hides the item when no projects are registered', () => {
            const item = { show: sinon.stub(), hide: sinon.stub() };
            (manager as any).statusBarItem = item;
            (manager as any).syncStatusBar();

            expect(item.hide.calledOnce).to.be.true;
            expect(item.show.called).to.be.false;
        });

        it('does not throw when no item has been initialized yet', () => {
            expect(() => (manager as any).syncStatusBar()).to.not.throw();
        });

        it('sets brightscript.hasRokuProjects context to true when projects exist', () => {
            const uri = makeUri('/workspace/project/bsconfig.json');
            const result = makeBuildResult('/workspace/project', uri);

            (mockProvider.ownsConfig as sinon.SinonStub).returns(true);
            (mockProvider.createProject as sinon.SinonStub).returns(result);
            (manager as any).registerProject(uri);

            const executeCommand = vscode.commands.executeCommand as sinon.SinonStub;
            const hasProjectsCall = executeCommand.getCalls().find(c => c.args[1] === 'brightscript.hasRokuProjects');
            expect(hasProjectsCall).to.not.be.undefined;
            expect(hasProjectsCall.args[2]).to.be.true;
        });

        it('sets brightscript.hasRokuProjects context to false when no projects', () => {
            (manager as any).syncStatusBar();

            const executeCommand = vscode.commands.executeCommand as sinon.SinonStub;
            const hasProjectsCall = executeCommand.getCalls().find(c => c.args[1] === 'brightscript.hasRokuProjects');
            expect(hasProjectsCall).to.not.be.undefined;
            expect(hasProjectsCall.args[2]).to.be.false;
        });
    });

    // -------------------------------------------------------------------------
    // provideCodeLenses
    // -------------------------------------------------------------------------

    describe('provideCodeLenses', () => {
        it('returns one CodeLens at the top of the document', () => {
            const uri = makeUri('/workspace/project/bsconfig.json');
            const document = { uri: uri } as any;

            const lenses = manager.provideCodeLenses(document);

            expect(lenses).to.have.length(1);
        });

        it('passes the document URI as the command argument', () => {
            const uri = makeUri('/workspace/project/bsconfig.json');
            const document = { uri: uri } as any;

            const lenses = manager.provideCodeLenses(document);

            expect((lenses[0] as any).command?.arguments?.[0]).to.equal(uri);
        });
    });

    // -------------------------------------------------------------------------
    // provideDebugConfigurations
    // -------------------------------------------------------------------------

    describe('provideDebugConfigurations', () => {
        it('returns a debug config for each registered project', () => {
            const uri = makeUri('/workspace/project/bsconfig.json');
            const result = makeBuildResult('/workspace/project', uri);

            (mockProvider.ownsConfig as sinon.SinonStub).returns(true);
            (mockProvider.createProject as sinon.SinonStub).returns(result);
            (manager as any).registerProject(uri);

            const configs = manager.provideDebugConfigurations();

            expect(configs).to.have.length(1);
            expect(configs[0]).to.deep.equal(result.debugConfig);
        });

        it('returns an empty array when no projects are registered', () => {
            const configs = manager.provideDebugConfigurations();
            expect(configs).to.have.length(0);
        });

        it('filters by workspace folder when one is provided', () => {
            const uri = makeUri('/workspace/project/bsconfig.json');
            const result = makeBuildResult('/workspace/project', uri);

            (mockProvider.ownsConfig as sinon.SinonStub).returns(true);
            (mockProvider.createProject as sinon.SinonStub).returns(result);
            (manager as any).registerProject(uri);

            const otherFolder = { uri: { fsPath: '/other' } } as any;
            expect(manager.provideDebugConfigurations(otherFolder)).to.have.length(0);

            const matchingFolder = { uri: { fsPath: '/workspace' } } as any;
            expect(manager.provideDebugConfigurations(matchingFolder)).to.have.length(1);
        });
    });

    // -------------------------------------------------------------------------
    // resolveDebugConfigFromActiveFile
    // -------------------------------------------------------------------------

    describe('resolveDebugConfigFromActiveFile', () => {
        afterEach(() => {
            // Restore activeTextEditor to the mock default
            (vscode.window as any).activeTextEditor = { document: undefined };
        });

        it('returns undefined when there is no active text editor', async () => {
            (vscode.window as any).activeTextEditor = undefined;

            const result = await manager.resolveDebugConfigFromActiveFile();

            expect(result).to.be.undefined;
        });

        it('returns undefined when no provider claims the active file', async () => {
            (vscode.window as any).activeTextEditor = {
                document: { uri: makeUri('/workspace/project/main.brs') }
            };
            (mockProvider.findProjectConfigFromFile as sinon.SinonStub).resolves([]);

            const result = await manager.resolveDebugConfigFromActiveFile();

            expect(result).to.be.undefined;
        });

        it('returns the debug config directly when exactly one config claims the file', async () => {
            const configUri = makeUri('/workspace/project/bsconfig.json');
            const result = makeBuildResult('/workspace/project', configUri);

            (vscode.window as any).activeTextEditor = {
                document: { uri: makeUri('/workspace/project/main.brs') }
            };
            (mockProvider.findProjectConfigFromFile as sinon.SinonStub).resolves([configUri]);
            (mockProvider.ownsConfig as sinon.SinonStub).returns(true);
            (mockProvider.createProject as sinon.SinonStub).returns(result);

            const config = await manager.resolveDebugConfigFromActiveFile();

            expect(config).to.deep.equal(result.debugConfig);
            expect(taskRegistry.registerTask.calledOnceWith(result.taskName, result.taskConfig)).to.be.true;
        });

        it('shows a quick pick when multiple configs claim the file', async () => {
            const configUri1 = makeUri('/workspace/project/bsconfig.json');
            const configUri2 = makeUri('/workspace/project/bsconfig.prod.json');
            const result1 = makeBuildResult('/workspace/project', configUri1);
            const result2 = makeBuildResult('/workspace/project', configUri2);

            (vscode.window as any).activeTextEditor = {
                document: { uri: makeUri('/workspace/project/main.brs') }
            };
            (mockProvider.findProjectConfigFromFile as sinon.SinonStub).resolves([configUri1, configUri2]);
            (mockProvider.ownsConfig as sinon.SinonStub).returns(true);
            (mockProvider.createProject as sinon.SinonStub)
                .withArgs(configUri1).returns(result1)
                .withArgs(configUri2).returns(result2);

            const selectedItem = { uri: configUri1 };
            sinon.stub(vscode.window, 'showQuickPick').resolves(selectedItem as any);

            const config = await manager.resolveDebugConfigFromActiveFile();

            expect((vscode.window.showQuickPick as sinon.SinonStub).calledOnce).to.be.true;
            expect(config).to.deep.equal(result1.debugConfig);
        });

        it('returns undefined when the quick pick is dismissed', async () => {
            const configUri1 = makeUri('/workspace/project/bsconfig.json');
            const configUri2 = makeUri('/workspace/project/bsconfig.prod.json');
            const result1 = makeBuildResult('/workspace/project', configUri1);
            const result2 = makeBuildResult('/workspace/project', configUri2);

            (vscode.window as any).activeTextEditor = {
                document: { uri: makeUri('/workspace/project/main.brs') }
            };
            (mockProvider.findProjectConfigFromFile as sinon.SinonStub).resolves([configUri1, configUri2]);
            (mockProvider.ownsConfig as sinon.SinonStub).returns(true);
            (mockProvider.createProject as sinon.SinonStub)
                .withArgs(configUri1).returns(result1)
                .withArgs(configUri2).returns(result2);

            sinon.stub(vscode.window, 'showQuickPick').resolves(undefined);

            const config = await manager.resolveDebugConfigFromActiveFile();

            expect(config).to.be.undefined;
        });
    });
});
