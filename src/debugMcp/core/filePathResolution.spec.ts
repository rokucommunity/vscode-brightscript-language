import { expect } from 'chai';
import * as path from 'path';
import { resolveWorkspaceFile } from './filePathResolution';

function makeOptions(existingFiles: string[], folders: Array<{ name: string; path: string }>, suffixMatches: string[] = []) {
    return {
        workspaceFolders: folders,
        fileExists: (filePath: string) => existingFiles.includes(filePath),
        findBySuffix: () => Promise.resolve(suffixMatches)
    };
}

describe('resolveWorkspaceFile', () => {
    const app = { name: 'app', path: path.resolve('/work/app') };
    const lib = { name: 'lib', path: path.resolve('/work/lib') };

    it('accepts an existing absolute path and rejects a missing one', async () => {
        const absolute = path.resolve('/work/app/source/main.brs');
        expect(await resolveWorkspaceFile(absolute, makeOptions([absolute], [app]))).to.equal(absolute);
        let message: string;
        await resolveWorkspaceFile(absolute, makeOptions([], [app])).catch((error) => {
            message = error.message;
        });
        expect(message).to.contain('File not found');
    });

    it('resolves a relative path against the workspace folders', async () => {
        const expected = path.join(app.path, 'source', 'main.brs');
        expect(await resolveWorkspaceFile('source/main.brs', makeOptions([expected], [app, lib]))).to.equal(expected);
        expect(await resolveWorkspaceFile('./source/main.brs', makeOptions([expected], [app, lib]))).to.equal(expected);
    });

    it('accepts a leading workspace folder name in a multi-root workspace', async () => {
        const expected = path.join(lib.path, 'source', 'main.brs');
        expect(await resolveWorkspaceFile('lib/source/main.brs', makeOptions([expected], [app, lib]))).to.equal(expected);
    });

    it('rejects a relative path found in several folders', async () => {
        const files = [path.join(app.path, 'a.brs'), path.join(lib.path, 'a.brs')];
        let message: string;
        await resolveWorkspaceFile('a.brs', makeOptions(files, [app, lib])).catch((error) => {
            message = error.message;
        });
        expect(message).to.contain('matches several files');
    });

    it('falls back to a suffix search for bare names', async () => {
        const found = path.join(app.path, 'components', 'MainScene.brs');
        expect(await resolveWorkspaceFile('MainScene.brs', makeOptions([], [app], [found]))).to.equal(found);
        let ambiguousMessage: string;
        await resolveWorkspaceFile('MainScene.brs', makeOptions([], [app], [found, path.join(lib.path, 'MainScene.brs')])).catch((error) => {
            ambiguousMessage = error.message;
        });
        expect(ambiguousMessage).to.contain('matches several files');
        let missingMessage: string;
        await resolveWorkspaceFile('Nope.brs', makeOptions([], [app], [])).catch((error) => {
            missingMessage = error.message;
        });
        expect(missingMessage).to.contain('File not found in the workspace');
    });

    it('requires a workspace folder for relative paths', async () => {
        let message: string;
        await resolveWorkspaceFile('main.brs', makeOptions([], [])).catch((error) => {
            message = error.message;
        });
        expect(message).to.contain('no workspace folder');
    });
});
