import { expect } from 'chai';
import { deriveWindowId } from './windowId';

describe('deriveWindowId', () => {
    it('uses the workspace file when there is one', () => {
        expect(deriveWindowId({ workspaceFile: '/projects/app.code-workspace', workspaceFolders: ['/projects/b', '/projects/a'], pid: 7 }))
            .to.eql({ windowId: '/projects/app.code-workspace', stable: true });
    });

    it('joins the sorted folder paths otherwise, independent of folder order', () => {
        const first = deriveWindowId({ workspaceFolders: ['/projects/b', '/projects/a'], pid: 7 });
        const second = deriveWindowId({ workspaceFolders: ['/projects/a', '/projects/b'], pid: 8 });
        expect(first).to.eql({ windowId: '/projects/a|/projects/b', stable: true });
        expect(second).to.eql(first);
    });

    it('uses a single folder path as is', () => {
        expect(deriveWindowId({ workspaceFolders: ['/projects/app'], pid: 7 }).windowId).to.equal('/projects/app');
    });

    it('prefixes the editor URI scheme so the same folder in two editors differs', () => {
        const stable = deriveWindowId({ uriScheme: 'vscode', workspaceFolders: ['/projects/app'], pid: 7 });
        const insiders = deriveWindowId({ uriScheme: 'vscode-insiders', workspaceFolders: ['/projects/app'], pid: 8 });
        expect(stable.windowId).to.equal('vscode:/projects/app');
        expect(insiders.windowId).to.equal('vscode-insiders:/projects/app');
        expect(deriveWindowId({ uriScheme: 'cursor', workspaceFile: '/a.code-workspace', workspaceFolders: [], pid: 1 }).windowId).to.equal('cursor:/a.code-workspace');
    });

    it('falls back to the pid and reports it as unstable when there are no folders', () => {
        expect(deriveWindowId({ workspaceFolders: [], pid: 42 })).to.eql({ windowId: 'pid:42', stable: false });
    });
});
