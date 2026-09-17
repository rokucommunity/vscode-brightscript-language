import { expect } from 'chai';
import { createSandbox } from 'sinon';
import * as fsExtra from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
let Module = require('module');

import { vscode } from '../../mockVscode.spec';

// Override the "require" call to mock vscode — must run before the SUT is imported, since
// JsDebugTargetResolver value-imports vscode at module load.
const { require: oldRequire } = Module.prototype;
Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

import { util } from '../../util';
import { JsDebugTargetResolver, getDefaultSourceMapPathOverrides } from './JsDebugTargetResolver';
import type { BrightScriptLaunchConfiguration } from '../../DebugConfigurationProvider';

const sinon = createSandbox();

describe('JsDebugTargetResolver', () => {
    let logMessages: string[];
    let resolver: JsDebugTargetResolver;
    let tempDir: string;

    beforeEach(() => {
        logMessages = [];
        resolver = new JsDebugTargetResolver((message) => logMessages.push(message));
        tempDir = path.join(os.tmpdir(), `jsDebugTargetResolver-spec-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        fsExtra.emptyDirSync(tempDir);
        (vscode.workspace as any).workspaceFolders = [];
    });

    afterEach(() => {
        sinon.restore();
        fsExtra.removeSync(tempDir);
    });

    describe('resolveJsDebugTarget', () => {
        it('prefers an explicit config.tsPath over the manifest ts_path', async () => {
            sinon.stub(util, 'getTsPath').returns('pkg:/source/compiled/manifest.js');
            const configuration = {
                tsPath: 'pkg:/source/compiled/config.js',
                rootDir: `${tempDir}/root`,
                stagingDir: `${tempDir}/staging`
            } as unknown as BrightScriptLaunchConfiguration;

            const target = await resolver.resolveJsDebugTarget(configuration);

            expect(target).to.deep.equal({
                tsPath: 'pkg:/source/compiled/config.js',
                rootDir: `${tempDir}/root`,
                stagingDir: `${tempDir}/staging`
            });
            expect((util.getTsPath as sinon.SinonStub).called).to.be.false;
        });

        it('falls back to the manifest ts_path when config.tsPath is unset', async () => {
            const getTsPathStub = sinon.stub(util, 'getTsPath').returns('pkg:/source/compiled/manifest.js');
            const configuration = {
                rootDir: `${tempDir}/root`,
                stagingDir: `${tempDir}/staging`
            } as unknown as BrightScriptLaunchConfiguration;

            const target = await resolver.resolveJsDebugTarget(configuration);

            expect(getTsPathStub.calledWith(`${tempDir}/root`)).to.be.true;
            expect(target).to.deep.equal({
                tsPath: 'pkg:/source/compiled/manifest.js',
                rootDir: `${tempDir}/root`,
                stagingDir: `${tempDir}/staging`
            });
        });

        it('defaults stagingDir to <workspaceFolder>/out/.roku-deploy-staging when unset', async () => {
            sinon.stub(util, 'getTsPath').returns('pkg:/source/compiled/manifest.js');
            (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
            const configuration = {
                rootDir: `${tempDir}/root`
            } as unknown as BrightScriptLaunchConfiguration;

            const target = await resolver.resolveJsDebugTarget(configuration);

            expect(target.stagingDir).to.equal('/workspace/out/.roku-deploy-staging');
        });

        it('falls back to the first component library with a tsPath, deriving its staging dir', async () => {
            sinon.stub(util, 'getTsPath').returns(undefined);
            const libraryRootDir = `${tempDir}/lib`;
            fsExtra.outputFileSync(path.join(libraryRootDir, 'manifest'), 'title=MyLib\nmajor_version=1\n');
            const configuration = {
                rootDir: `${tempDir}/root`,
                outDir: `${tempDir}/out`,
                componentLibraries: [
                    { rootDir: libraryRootDir, outFile: 'lib.zip' },
                    { rootDir: libraryRootDir, outFile: 'other.zip', tsPath: 'pkg:/source/compiled/lib.js' }
                ]
            } as unknown as BrightScriptLaunchConfiguration;

            const target = await resolver.resolveJsDebugTarget(configuration);

            expect(target).to.deep.equal({
                tsPath: 'pkg:/source/compiled/lib.js',
                rootDir: libraryRootDir,
                stagingDir: path.normalize(`${tempDir}/out/component-libraries/other`)
            });
        });

        it('substitutes manifest placeholders in a component library outFile', async () => {
            sinon.stub(util, 'getTsPath').returns(undefined);
            const libraryRootDir = `${tempDir}/lib`;
            fsExtra.outputFileSync(path.join(libraryRootDir, 'manifest'), 'title=MyLib\nmajor_version=2\n');
            const configuration = {
                rootDir: `${tempDir}/root`,
                outDir: `${tempDir}/out`,
                componentLibraries: [
                    { rootDir: libraryRootDir, outFile: 'lib_v${major_version}.zip', tsPath: 'pkg:/source/compiled/lib.js' }
                ]
            } as unknown as BrightScriptLaunchConfiguration;

            const target = await resolver.resolveJsDebugTarget(configuration);

            expect(target.stagingDir).to.equal(path.normalize(`${tempDir}/out/component-libraries/lib_v2`));
        });

        it('returns undefined when there is no app tsPath and no component library tsPath', async () => {
            sinon.stub(util, 'getTsPath').returns(undefined);
            const configuration = {
                rootDir: `${tempDir}/root`,
                componentLibraries: [{ rootDir: `${tempDir}/lib`, outFile: 'lib.zip' }]
            } as unknown as BrightScriptLaunchConfiguration;

            const target = await resolver.resolveJsDebugTarget(configuration);

            expect(target).to.be.undefined;
        });
    });

    describe('resolveTargetPaths', () => {
        it('derives a posix remoteRoot from a backslashed tsPath', () => {
            const target = {
                tsPath: 'pkg:/source\\compiled\\index.js',
                rootDir: `${tempDir}/root`,
                stagingDir: `${tempDir}/staging`
            };

            const paths = resolver.resolveTargetPaths(target);

            expect(paths.tsPath).to.equal('/source\\compiled\\index.js');
            expect(paths.remoteRoot).to.equal('/source/compiled');
        });

        it('prefers the staging candidate when the bundle exists there', () => {
            const rootDir = `${tempDir}/root`;
            const stagingDir = `${tempDir}/staging`;
            fsExtra.outputFileSync(path.join(stagingDir, 'source', 'compiled', 'main.js'), '//staged bundle');
            fsExtra.outputFileSync(path.join(rootDir, 'source', 'compiled', 'main.js'), '//built bundle');
            const target = { tsPath: 'pkg:/source/compiled/main.js', rootDir: rootDir, stagingDir: stagingDir };

            const paths = resolver.resolveTargetPaths(target);

            expect(paths.localRoot).to.equal(path.resolve(stagingDir, './source/compiled'));
            expect(paths.localRootCandidates).to.deep.equal([
                path.resolve(stagingDir, './source/compiled'),
                path.resolve(rootDir, './source/compiled')
            ]);
        });

        it('falls back to the rootDir candidate when the bundle is not staged', () => {
            const rootDir = `${tempDir}/root`;
            const stagingDir = `${tempDir}/staging`;
            fsExtra.outputFileSync(path.join(rootDir, 'source', 'compiled', 'main.js'), '//built bundle');
            const target = { tsPath: 'pkg:/source/compiled/main.js', rootDir: rootDir, stagingDir: stagingDir };

            const paths = resolver.resolveTargetPaths(target);

            expect(paths.localRoot).to.equal(path.resolve(rootDir, './source/compiled'));
        });

        it('falls back to the staging candidate guess when the bundle is nowhere on disk', () => {
            const rootDir = `${tempDir}/root`;
            const stagingDir = `${tempDir}/staging`;
            const target = { tsPath: 'pkg:/source/compiled/main.js', rootDir: rootDir, stagingDir: stagingDir };

            const paths = resolver.resolveTargetPaths(target);

            expect(paths.localRoot).to.equal(path.resolve(stagingDir, './source/compiled'));
        });

        it('produces posix outFiles globs', () => {
            const rootDir = `${tempDir}/root`;
            const stagingDir = `${tempDir}/staging`;
            const target = { tsPath: 'pkg:/source/compiled/main.js', rootDir: rootDir, stagingDir: stagingDir };

            const paths = resolver.resolveTargetPaths(target);

            expect(paths.outFiles).to.deep.equal([`${paths.localRoot.replace(/\\/g, '/')}/*.js`]);
            expect(paths.outFiles[0]).to.not.include('\\');
        });

        it('maps every top-level workspace dir and omits the scheme-based js-debug defaults', () => {
            const rootDir = `${tempDir}/root`;
            const stagingDir = `${tempDir}/staging`;
            const workspaceDir = `${tempDir}/workspace`;
            fsExtra.ensureDirSync(path.join(workspaceDir, 'src'));
            fsExtra.ensureDirSync(path.join(workspaceDir, 'app'));
            fsExtra.ensureDirSync(path.join(workspaceDir, '.git'));
            (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: workspaceDir } }];
            const target = { tsPath: 'pkg:/source/compiled/main.js', rootDir: rootDir, stagingDir: stagingDir };

            const paths = resolver.resolveTargetPaths(target);

            //rsg-sdk maps carry plain relative paths, so the scheme-based defaults are omitted
            for (const key of Object.keys(getDefaultSourceMapPathOverrides(rootDir))) {
                expect(paths.sourceMapPathOverrides[key]).to.be.undefined;
            }
            expect(paths.sourceMapPathOverrides['/src/*']).to.equal(`${workspaceDir.replace(/\\/g, '/')}/src/*`);
            expect(paths.sourceMapPathOverrides['file:///src/*']).to.equal(`${workspaceDir.replace(/\\/g, '/')}/src/*`);
            expect(paths.sourceMapPathOverrides['/app/*']).to.equal(`${workspaceDir.replace(/\\/g, '/')}/app/*`);
            //dot-directories are never remapped
            expect(paths.sourceMapPathOverrides['/.git/*']).to.be.undefined;
        });

        it('falls back to rootDir for the workspace-dir scan when there is no open workspace folder', () => {
            const rootDir = `${tempDir}/root`;
            const stagingDir = `${tempDir}/staging`;
            fsExtra.ensureDirSync(path.join(rootDir, 'src'));
            const target = { tsPath: 'pkg:/source/compiled/main.js', rootDir: rootDir, stagingDir: stagingDir };

            const paths = resolver.resolveTargetPaths(target);

            expect(paths.sourceMapPathOverrides['/src/*']).to.equal(`${rootDir.replace(/\\/g, '/')}/src/*`);
        });

        it('logs and continues when the workspace-dir scan fails', () => {
            const rootDir = `${tempDir}/does-not-exist`;
            const stagingDir = `${tempDir}/staging`;
            const target = { tsPath: 'pkg:/source/compiled/main.js', rootDir: rootDir, stagingDir: stagingDir };

            const paths = resolver.resolveTargetPaths(target);

            expect(logMessages.some(message => message.includes('Failed to enumerate top-level dirs'))).to.be.true;
            //a failed scan yields an empty (but present) overrides object
            expect(paths.sourceMapPathOverrides).to.deep.equal({});
        });
    });

    describe('getDefaultSourceMapPathOverrides', () => {
        it('matches the shipped js-debug defaults, keyed by cwd', () => {
            const overrides = getDefaultSourceMapPathOverrides('/some/cwd');

            expect(overrides).to.deep.equal({
                'webpack:///./~/*': '/some/cwd/node_modules/*',
                'webpack:////*': '/*',
                'webpack://@?:*/?:*/*': '/some/cwd/*',
                'webpack://?:*/*': '/some/cwd/*',
                'webpack:///([a-z]):/(.+)': '$1:/$2',
                'meteor://💻app/*': '/some/cwd/*',
                'turbopack://[project]/*': '${workspaceFolder}/*',
                'turbopack:///[project]/*': '${workspaceFolder}/*'
            });
        });
    });
});
