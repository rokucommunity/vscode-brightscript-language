import { expect } from 'chai';
import { buildLaunchSources, listLaunchConfigs, resolveStartTarget } from './launchConfigs';
import type { LaunchSource } from './launchConfigs';

const ALLOWED_OVERRIDES = { host: 'string', stopOnEntry: 'boolean' };

function makeSources(): LaunchSource[] {
    return [
        {
            folderName: 'app',
            folderPath: '/work/app',
            configurations: [
                { name: 'BrightScript Debug: Launch', type: 'brightscript', request: 'launch', host: '192.168.1.5', rootDir: '${workspaceFolder}', stopOnEntry: false, password: 'secret' },
                { name: 'Other', type: 'node', request: 'launch' }
            ],
            compounds: [{ name: 'Both', configurations: ['BrightScript Debug: Launch', 'Other'] }]
        },
        { folderName: 'lib', folderPath: '/work/lib', configurations: [{ name: 'Other', type: 'brightscript', request: 'launch' }], compounds: [] }
    ];
}

describe('launchConfigs', () => {
    it('lists configurations and compounds without leaking other fields', () => {
        const summaries = listLaunchConfigs(makeSources(), ['host', 'rootDir', 'stopOnEntry']);
        expect(summaries[0]).to.eql({
            name: 'BrightScript Debug: Launch', kind: 'configuration', type: 'brightscript', request: 'launch', folder: 'app',
            host: '192.168.1.5', rootDir: '${workspaceFolder}', stopOnEntry: false
        });
        expect(summaries.find((summary) => summary.name === 'Both')).to.eql({ name: 'Both', kind: 'compound', folder: 'app', configurations: ['BrightScript Debug: Launch', 'Other'] });
        expect(JSON.stringify(summaries)).not.to.contain('secret');
    });

    it('reports workspace-level entries with a null folder', () => {
        const summaries = listLaunchConfigs([{ configurations: [{ name: 'W', type: 'brightscript', request: 'launch' }], compounds: [] }]);
        expect(summaries[0].folder).to.be.null;
    });

    it('reports no extra fields and allows no overrides unless told which', () => {
        expect(listLaunchConfigs(makeSources())[0]).to.eql({ name: 'BrightScript Debug: Launch', kind: 'configuration', type: 'brightscript', request: 'launch', folder: 'app' });
        expect(() => resolveStartTarget(makeSources(), { name: 'BrightScript Debug: Launch', overrides: { host: '10.0.0.9' } })).to.throw('Allowed overrides: (none)');
    });

    it('starts by name without a configuration object when there are no overrides', () => {
        const target = resolveStartTarget(makeSources(), { name: 'BrightScript Debug: Launch' });
        expect(target).to.include({ name: 'BrightScript Debug: Launch', kind: 'configuration', folderPath: '/work/app' });
        expect(target.configuration).to.be.undefined;
        expect(resolveStartTarget(makeSources(), { name: 'Both', overrides: {} }, ALLOWED_OVERRIDES).kind).to.equal('compound');
    });

    it('shallow-merges allowlisted overrides into the named configuration', () => {
        const target = resolveStartTarget(makeSources(), { name: 'BrightScript Debug: Launch', overrides: { host: '10.0.0.9', stopOnEntry: true } }, ALLOWED_OVERRIDES);
        expect(target.configuration).to.include({ host: '10.0.0.9', stopOnEntry: true, type: 'brightscript', rootDir: '${workspaceFolder}' });
    });

    it('rejects overrides outside the allowlist, with the wrong type, or on compounds', () => {
        expect(() => resolveStartTarget(makeSources(), { name: 'BrightScript Debug: Launch', overrides: { password: 'x' } }, ALLOWED_OVERRIDES)).to.throw('Override \'password\' is not allowed');
        expect(() => resolveStartTarget(makeSources(), { name: 'BrightScript Debug: Launch', overrides: { stopOnEntry: 'yes' } }, ALLOWED_OVERRIDES)).to.throw('must be a boolean');
        expect(() => resolveStartTarget(makeSources(), { name: 'Both', overrides: { host: '1.2.3.4' } }, ALLOWED_OVERRIDES)).to.throw('compound');
    });

    it('requires a folder when a name is ambiguous and reports unknown names', () => {
        expect(() => resolveStartTarget(makeSources(), { name: 'Other' })).to.throw('Pass folder');
        expect(resolveStartTarget(makeSources(), { name: 'Other', folder: 'lib' }).folderPath).to.equal('/work/lib');
        expect(() => resolveStartTarget(makeSources(), { name: 'Nope' })).to.throw('No launch configuration named \'Nope\'. Available: BrightScript Debug: Launch');
    });
});

describe('buildLaunchSources', () => {
    const launch = { name: 'Launch', type: 'brightscript', request: 'launch' };

    it('lists a single-folder workspace once even when the inspected workspace value mirrors the folder', () => {
        const sources = buildLaunchSources({
            folders: [{ name: 'app', path: '/work/app', configurations: { workspaceFolderValue: [launch], workspaceValue: [launch] } }],
            workspace: { configurations: { workspaceValue: [launch] } },
            hasWorkspaceFile: false
        });
        expect(listLaunchConfigs(sources)).to.have.length(1);
        expect(resolveStartTarget(sources, { name: 'Launch' }).folderPath).to.equal('/work/app');
    });

    it('adds workspace-level entries only for a multi-root workspace file', () => {
        const input = {
            folders: [
                { name: 'app', path: '/work/app', configurations: { workspaceFolderValue: [launch] } },
                { name: 'lib', path: '/work/lib', configurations: { workspaceValue: [{ name: 'Shared', type: 'brightscript', request: 'launch' }] } }
            ],
            workspace: { configurations: { workspaceValue: [{ name: 'Shared', type: 'brightscript', request: 'launch' }] }, compounds: { workspaceValue: [{ name: 'All', configurations: ['Launch'] }] } }
        };
        const withFile = listLaunchConfigs(buildLaunchSources({ ...input, hasWorkspaceFile: true }));
        expect(withFile.map((summary) => [summary.name, summary.folder])).to.eql([['Launch', 'app'], ['Shared', null], ['All', null]]);
        expect(listLaunchConfigs(buildLaunchSources({ ...input, hasWorkspaceFile: false })).map((summary) => summary.name)).to.eql(['Launch']);
    });

    it('does not let a folder without launch.json inherit workspace or user configurations', () => {
        const sources = buildLaunchSources({
            folders: [{ name: 'empty', path: '/work/empty', configurations: { workspaceValue: [launch] } }],
            hasWorkspaceFile: false
        });
        expect(listLaunchConfigs(sources)).to.be.empty;
        expect(buildLaunchSources({ folders: [{ name: 'bare', path: '/work/bare' }], hasWorkspaceFile: false })[0].configurations).to.eql([]);
    });
});
