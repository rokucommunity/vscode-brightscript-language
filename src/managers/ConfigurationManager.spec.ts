import { expect } from 'chai';
import * as sinonActual from 'sinon';
import { ConfigurationManager } from './ConfigurationManager';
import { vscode } from '../mockVscode.spec';

let sinon = sinonActual.createSandbox();

describe('ConfigurationManager', () => {
    let configurationManager: ConfigurationManager;

    beforeEach(() => {
        sinon.restore();
        configurationManager = new ConfigurationManager();
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('getConfigurationValueIfDefined', () => {
        it('returns undefined when not specified in the config', () => {
            expect(
                configurationManager.getConfigurationValueIfDefined('brightscript.notThere')
            ).to.be.undefined;
        });

        it('returns default value when not specified in the config', () => {
            expect(
                configurationManager.getConfigurationValueIfDefined('brightscript.notThere', true)
            ).to.eql(true);
        });

        it('returns undefined even if there is a default value globally', () => {
            sinon.stub(vscode.workspace, 'getConfiguration').returns({
                inspect: () => {
                    return {
                        defaultLanguageValue: undefined,
                        defaultValue: true,
                        globalLanguageValue: undefined,
                        globalValue: undefined,
                        workspaceFolderLanguageValue: undefined,
                        workspaceFolderValue: undefined,
                        workspaceLanguageValue: undefined,
                        workspaceValue: undefined
                    };
                }
            } as any);
            expect(
                configurationManager.getConfigurationValueIfDefined('brightscript.notThere')
            ).to.be.undefined;
        });
    });

    describe('buildExcludeGlob', () => {
        beforeEach(() => {
            vscode.workspace._configuration = {
                'files.exclude': {},
                'search.exclude': {}
            };
        });

        it('returns undefined when there are no VS Code excludes and no additional patterns', () => {
            expect(configurationManager.buildExcludeGlob([])).to.be.undefined;
        });

        it('returns a plain string when there is exactly one pattern total', () => {
            expect(configurationManager.buildExcludeGlob(['**/node_modules/**'])).to.equal('**/node_modules/**');
        });

        it('wraps multiple patterns in brace expansion', () => {
            expect(configurationManager.buildExcludeGlob(['**/node_modules/**', '**/dist/**'])).to.equal('{**/node_modules/**,**/dist/**}');
        });

        it('includes enabled files.exclude entries', () => {
            vscode.workspace._configuration['files.exclude'] = { '**/.git': true, '**/.DS_Store': false };
            expect(configurationManager.buildExcludeGlob([])).to.equal('**/.git');
        });

        it('includes enabled search.exclude entries', () => {
            vscode.workspace._configuration['search.exclude'] = { '**/build/**': true, '**/tmp/**': false };
            expect(configurationManager.buildExcludeGlob([])).to.equal('**/build/**');
        });

        it('combines files.exclude, search.exclude, and additional patterns', () => {
            vscode.workspace._configuration['files.exclude'] = { '**/.git': true };
            vscode.workspace._configuration['search.exclude'] = { '**/build/**': true };
            const result = configurationManager.buildExcludeGlob(['**/node_modules/**']);
            expect(result).to.equal('{**/.git,**/build/**,**/node_modules/**}');
        });

        it('deduplicates patterns that appear in multiple sources', () => {
            vscode.workspace._configuration['files.exclude'] = { '**/node_modules/**': true };
            vscode.workspace._configuration['search.exclude'] = { '**/node_modules/**': true };
            expect(configurationManager.buildExcludeGlob(['**/node_modules/**'])).to.equal('**/node_modules/**');
        });

        it('skips disabled files.exclude and search.exclude entries', () => {
            vscode.workspace._configuration['files.exclude'] = { '**/.git': false };
            vscode.workspace._configuration['search.exclude'] = { '**/build/**': false };
            expect(configurationManager.buildExcludeGlob([])).to.be.undefined;
        });
    });

    describe('isUriExcluded', () => {
        beforeEach(() => {
            vscode.workspace._configuration = {
                'files.exclude': {},
                'search.exclude': {}
            };
        });

        function makeUri(relativePath: string) {
            return { fsPath: relativePath } as any;
        }

        it('returns false when there are no patterns', () => {
            expect(configurationManager.isUriExcluded(makeUri('src/foo.ts'), [])).to.be.false;
        });

        it('returns true when the URI matches an additional pattern', () => {
            expect(configurationManager.isUriExcluded(makeUri('node_modules/some-lib/index.js'), ['**/node_modules/**'])).to.be.true;
        });

        it('returns false when the URI does not match any pattern', () => {
            expect(configurationManager.isUriExcluded(makeUri('src/foo.ts'), ['**/node_modules/**'])).to.be.false;
        });

        it('returns true when the URI matches an enabled files.exclude entry', () => {
            vscode.workspace._configuration['files.exclude'] = { '**/.git': true };
            expect(configurationManager.isUriExcluded(makeUri('.git'), [])).to.be.true;
        });

        it('returns true for a file nested inside an excluded directory', () => {
            vscode.workspace._configuration['files.exclude'] = { '**/.git': true };
            expect(configurationManager.isUriExcluded(makeUri('.git/config'), [])).to.be.true;
        });

        it('returns false when the URI only matches a disabled files.exclude entry', () => {
            vscode.workspace._configuration['files.exclude'] = { '**/node_modules/**': false };
            expect(configurationManager.isUriExcluded(makeUri('node_modules/some-lib/index.js'), [])).to.be.false;
        });
    });
});
