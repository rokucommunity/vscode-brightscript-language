import { expect } from 'chai';
import * as sinon from 'sinon';
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
import { DeclarationProvider } from './DeclarationProvider';

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
