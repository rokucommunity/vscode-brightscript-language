import { expect } from 'chai';
import { createSandbox } from 'sinon';
import * as fs from 'fs';
import * as os from 'os';
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

import { ManifestProjectProvider } from './ManifestProjectProvider';
import { BrightScriptDebugConfigurationProvider } from '../../DebugConfigurationProvider';

const sinon = createSandbox();

function makeUri(fsPath: string) {
    return vscode.Uri.file(fsPath);
}

describe('ManifestProjectProvider', () => {
    let provider: ManifestProjectProvider;
    let tempDir: string;

    beforeEach(() => {
        sinon.restore();
        provider = new ManifestProjectProvider();
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-spec-'));
    });

    afterEach(() => {
        sinon.restore();
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
            // best-effort cleanup
        }
    });

    /** Lay out a Roku-shaped project at projectDir, returning the manifest URI. */
    function makeRokuProject(projectDir: string, opts: { source?: boolean; components?: boolean } = { source: true }): ReturnType<typeof makeUri> {
        fs.mkdirSync(projectDir, { recursive: true });
        if (opts.source) {
            fs.mkdirSync(path.join(projectDir, 'source'), { recursive: true });
        }
        if (opts.components) {
            fs.mkdirSync(path.join(projectDir, 'components'), { recursive: true });
        }
        const manifestPath = path.join(projectDir, 'manifest');
        fs.writeFileSync(manifestPath, '');
        return makeUri(manifestPath);
    }

    describe('ownsConfig', () => {
        it('returns true for a manifest with an adjacent source/ dir', () => {
            const uri = makeRokuProject(tempDir, { source: true });
            expect(provider.ownsConfig(uri)).to.be.true;
        });

        it('returns true for a manifest with an adjacent components/ dir', () => {
            const uri = makeRokuProject(tempDir, { components: true });
            expect(provider.ownsConfig(uri)).to.be.true;
        });

        it('returns true for a manifest with both source/ and components/', () => {
            const uri = makeRokuProject(tempDir, { source: true, components: true });
            expect(provider.ownsConfig(uri)).to.be.true;
        });

        it('returns false for a manifest with neither source/ nor components/', () => {
            fs.writeFileSync(path.join(tempDir, 'manifest'), '');
            expect(provider.ownsConfig(makeUri(path.join(tempDir, 'manifest')))).to.be.false;
        });

        it('returns false for a non-manifest filename even with source/ adjacent', () => {
            fs.mkdirSync(path.join(tempDir, 'source'), { recursive: true });
            fs.writeFileSync(path.join(tempDir, 'package.json'), '');
            expect(provider.ownsConfig(makeUri(path.join(tempDir, 'package.json')))).to.be.false;
        });
    });


    describe('findProjectConfigs', () => {
        it('returns Roku-shaped manifests and filters out non-Roku ones', async () => {
            const rokuDir = path.join(tempDir, 'rokuApp');
            const nonRokuDir = path.join(tempDir, 'nonRoku');
            const rokuUri = makeRokuProject(rokuDir, { source: true });
            fs.mkdirSync(nonRokuDir, { recursive: true });
            fs.writeFileSync(path.join(nonRokuDir, 'manifest'), '');
            const nonRokuUri = makeUri(path.join(nonRokuDir, 'manifest'));

            sinon.stub(vscode.workspace, 'findFiles').resolves([rokuUri, nonRokuUri]);

            const results = await provider.findProjectConfigs();

            expect(results).to.have.length(1);
            expect(results[0].fsPath).to.equal(rokuUri.fsPath);
        });

        it('returns an empty array when no manifests are found', async () => {
            sinon.stub(vscode.workspace, 'findFiles').resolves([]);

            const results = await provider.findProjectConfigs();
            expect(results).to.have.length(0);
        });
    });


    describe('findProjectConfigFromFile', () => {
        it('returns an empty array when no projects are registered', async () => {
            const result = await provider.findProjectConfigFromFile(makeUri(path.join(tempDir, 'foo.brs')));
            expect(result).to.have.length(0);
        });

        it('returns the matching config when a file lives under a registered project', async () => {
            const configUri = makeRokuProject(tempDir, { source: true });
            provider.afterConfigRegistered(configUri);

            const result = await provider.findProjectConfigFromFile(makeUri(path.join(tempDir, 'source', 'main.brs')));
            expect(result).to.have.length(1);
            expect(result[0].fsPath).to.equal(configUri.fsPath);
        });

        it('returns the matching config when the file IS the manifest', async () => {
            const configUri = makeRokuProject(tempDir, { source: true });
            provider.afterConfigRegistered(configUri);

            const result = await provider.findProjectConfigFromFile(configUri);
            expect(result).to.have.length(1);
            expect(result[0].fsPath).to.equal(configUri.fsPath);
        });

        it('returns an empty array when the file is outside all registered projects', async () => {
            const projectDir = path.join(tempDir, 'app');
            const configUri = makeRokuProject(projectDir, { source: true });
            provider.afterConfigRegistered(configUri);

            const otherFile = path.join(tempDir, 'other', 'main.brs');
            const result = await provider.findProjectConfigFromFile(makeUri(otherFile));
            expect(result).to.have.length(0);
        });

        it('returns an empty array for a file inside the project dir that does not match any default pattern', async () => {
            const configUri = makeRokuProject(tempDir, { source: true });
            provider.afterConfigRegistered(configUri);

            // .git/HEAD lives under the project but isn't covered by any of the default file globs
            const result = await provider.findProjectConfigFromFile(makeUri(path.join(tempDir, '.git', 'HEAD')));
            expect(result).to.have.length(0);
        });

        it('returns the matching config for a locale file (matched by locale/**/*)', async () => {
            const configUri = makeRokuProject(tempDir, { source: true });
            provider.afterConfigRegistered(configUri);

            const result = await provider.findProjectConfigFromFile(makeUri(path.join(tempDir, 'locale', 'en_US', 'translations.xml')));
            expect(result).to.have.length(1);
            expect(result[0].fsPath).to.equal(configUri.fsPath);
        });
    });


    describe('afterConfigRegistered', () => {
        it('adds the project dir to the index', () => {
            const configUri = makeRokuProject(tempDir, { source: true });
            provider.afterConfigRegistered(configUri);

            const index = (provider as any).configByProjectDir as Map<string, ReturnType<typeof makeUri>>;
            expect(index.has(tempDir)).to.be.true;
            expect(index.get(tempDir)?.fsPath).to.equal(configUri.fsPath);
        });
    });


    describe('afterConfigUnregistered', () => {
        it('removes the project dir from the index', () => {
            const configUri = makeRokuProject(tempDir, { source: true });
            provider.afterConfigRegistered(configUri);
            expect((provider as any).configByProjectDir.has(tempDir)).to.be.true;

            provider.afterConfigUnregistered(configUri);
            expect((provider as any).configByProjectDir.has(tempDir)).to.be.false;
        });

        it('does not throw when called for an unregistered URI', () => {
            const configUri = makeUri(path.join(tempDir, 'manifest'));
            expect(() => provider.afterConfigUnregistered(configUri)).to.not.throw();
        });
    });


    describe('createProject', () => {
        it('produces project metadata with the correct projectDir and projectName', () => {
            const projectDir = path.join(tempDir, 'myApp');
            const configUri = makeRokuProject(projectDir, { source: true });

            const result = provider.createProject(configUri);

            expect(result.project.projectDir).to.equal(projectDir);
            expect(result.project.projectName).to.equal('myApp');
            expect(result.project.configUri.fsPath).to.equal(configUri.fsPath);
        });

        it('produces a debug config with type brightscript and request launch', () => {
            const configUri = makeRokuProject(tempDir, { source: true });
            const result = provider.createProject(configUri);

            expect(result.debugConfig.type).to.equal('brightscript');
            expect(result.debugConfig.request).to.equal('launch');
        });

        it('uses "Debug <projectName>" as the debug config name', () => {
            const projectDir = path.join(tempDir, 'myCoolApp');
            const configUri = makeRokuProject(projectDir, { source: true });
            const result = provider.createProject(configUri);

            expect(result.debugConfig.name).to.equal('Debug myCoolApp');
        });

        it('sets rootDir to the manifest directory', () => {
            const configUri = makeRokuProject(tempDir, { source: true });
            const result = provider.createProject(configUri);

            expect(result.debugConfig.rootDir).to.equal(tempDir);
        });

        it('uses promptForHost and promptForPassword placeholders', () => {
            const configUri = makeRokuProject(tempDir, { source: true });
            const result = provider.createProject(configUri);

            expect(result.debugConfig.host).to.equal('${promptForHost}');
            expect(result.debugConfig.password).to.equal('${promptForPassword}');
        });

        it('does not include a taskName or taskConfig', () => {
            const configUri = makeRokuProject(tempDir, { source: true });
            const result = provider.createProject(configUri);

            expect(result.taskName).to.be.undefined;
            expect(result.taskConfig).to.be.undefined;
        });

        it('uses BrightScriptDebugConfigurationProvider.defaultFiles for every project', () => {
            const configUri = makeRokuProject(tempDir, { source: true });
            const result = provider.createProject(configUri);

            expect(result.debugConfig.files).to.deep.equal([...BrightScriptDebugConfigurationProvider.defaultFiles]);
        });

        it('returns a fresh files array each call so callers can mutate it without affecting later calls', () => {
            const configUri = makeRokuProject(tempDir, { source: true });
            const first = provider.createProject(configUri);
            first.debugConfig.files.push('extra/**/*');

            const second = provider.createProject(configUri);
            expect(second.debugConfig.files).to.not.include('extra/**/*');
        });
    });
});
