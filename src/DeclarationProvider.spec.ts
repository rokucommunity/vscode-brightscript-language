import { expect } from 'chai';
import * as fsExtra from 'fs-extra';
import * as sinon from 'sinon';
import { standardizePath as s } from 'brighterscript';
let Module = require('module');

import { vscode } from './mockVscode.spec';

//override the "require" call to mock certain items
const { require: oldRequire } = Module.prototype;

Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

import { SymbolKind } from 'vscode';
import { DeclarationProvider, WorkspaceEncoding } from './DeclarationProvider';

const tempDir = s`${__dirname}/../.tmp`;

describe('DeclarationProvider', () => {
    let provider: DeclarationProvider;
    let uri: any;
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        uri = vscode.Uri.file('/some/project/source/main.bs');
        //readDeclarations reads the workspace folder to filter out the `out` dir
        sandbox.stub(vscode.workspace, 'getWorkspaceFolder').returns({
            uri: vscode.Uri.file('/some/project')
        } as any);
        provider = new DeclarationProvider();
    });

    afterEach(() => {
        sandbox.restore();
        fsExtra.removeSync(tempDir);
    });

    describe('flush', () => {
        beforeEach(() => {
            fsExtra.emptyDirSync(tempDir);
            //the constructor queued a full workspace scan; disable it so tests control the dirty list directly
            provider['fullscan'] = false;
        });

        it('emits a delete event instead of crashing when a dirty file was deleted before flush ran', async () => {
            const filePath = s`${tempDir}/deleted.brs`;
            const fileUri = vscode.Uri.file(filePath);
            provider['dirty'].set(filePath, fileUri);

            const deletedUris = [];
            provider.onDidDelete((event) => deletedUris.push(event.uri));

            await provider['flush']();

            expect(deletedUris).to.eql([fileUri]);
            expect(provider['dirty'].size).to.equal(0);
        });

        it('reads declarations from a file that is outside every workspace folder', async () => {
            //this file has no workspace folder
            (vscode.workspace.getWorkspaceFolder as any).returns(undefined);

            const filePath = s`${tempDir}/main.brs`;
            fsExtra.outputFileSync(filePath, 'sub main()\nend sub');
            const fileUri = vscode.Uri.file(filePath);
            provider['dirty'].set(filePath, fileUri);

            const changeEvents = [];
            provider.onDidChange((event) => changeEvents.push(event));

            await provider['flush']();

            expect(changeEvents).to.have.lengthOf(1);
            expect(changeEvents[0].decls.map(declaration => declaration.name)).to.include('main');
            expect(provider['dirty'].size).to.equal(0);
        });
    });

    describe('readDeclarations', () => {
        it('shows only the final segment for dotted/nested namespaces', () => {
            const symbols = provider.readDeclarations(uri, [
                `namespace get`,
                `end namespace`,
                `namespace get.deep`,
                `end namespace`
            ].join('\n'));

            const namespaceNames = symbols
                .filter(symbol => symbol.kind === SymbolKind.Namespace)
                .map(symbol => symbol.name);
            expect(namespaceNames).to.eql(['get', 'deep']);
        });

        it('leaves single-segment namespaces unchanged', () => {
            const symbols = provider.readDeclarations(uri, [
                `namespace alpha`,
                `end namespace`
            ].join('\n'));

            const namespaceNames = symbols
                .filter(symbol => symbol.kind === SymbolKind.Namespace)
                .map(symbol => symbol.name);
            expect(namespaceNames).to.eql(['alpha']);
        });

        it('nests a namespace under its parent instead of the preceding function', () => {
            // lines: 0 namespace get, 1 function outer, 2 end function, 3 namespace deep,
            // 4 function inner, 5 end function, 6 end namespace (deep), 7 end namespace (get)
            const symbols = provider.readDeclarations(uri, [
                `namespace get`,
                `    function outer()`,
                `    end function`,
                `    namespace deep`,
                `        function inner()`,
                `        end function`,
                `    end namespace`,
                `end namespace`
            ].join('\n'));

            const byName = (name: string) => symbols.find(symbol => symbol.name === name);
            //the nested namespace's parent is `get`, NOT the `outer` function that precedes it
            expect(byName('deep').containerName).to.equal('get');
            //the function that precedes the nested namespace must not swallow it
            expect(byName('outer').bodyRange.end.line).to.be.lessThan(byName('deep').bodyRange.start.line);
            //functions inside the nested namespace nest under it
            expect(byName('inner').containerName).to.equal('deep');
            //the namespace spans its whole block so its members are range-contained
            expect(byName('deep').bodyRange.start.line).to.equal(3);
            expect(byName('deep').bodyRange.end.line).to.equal(6);
        });
    });
});

describe('WorkspaceEncoding', () => {
    it('falls back to utf8 for a path outside every workspace folder', () => {
        const encoding = new WorkspaceEncoding();
        expect(encoding.find(s`${tempDir}/main.brs`)).to.equal('utf8');
    });
});
