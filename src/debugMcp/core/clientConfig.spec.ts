import { expect } from 'chai';
import * as path from 'path';
import { buildClaudeCodeAddArgs, buildCommandInvocation, buildServerEntry, getClaudeDesktopConfigPath, getClientLaunchCommand, hasCmdSpecialCharacters, mergeServerEntry } from './clientConfig';

const launchCommand = getClientLaunchCommand('/home/user/.brightscript/debug-mcp', { platform: 'darwin' });

describe('debugMcp clientConfig', () => {
    describe('getClientLaunchCommand', () => {
        it('runs the launcher by absolute path on POSIX', () => {
            expect(launchCommand).to.eql({ command: '/home/user/.brightscript/debug-mcp/bridge', args: [] });
        });

        it('runs the batch launcher through cmd on Windows', () => {
            expect(getClientLaunchCommand('C:\\Users\\me\\.brightscript\\debug-mcp', { platform: 'win32' })).to.eql({
                command: 'cmd',
                args: ['/c', 'C:\\Users\\me\\.brightscript\\debug-mcp\\bridge.cmd']
            });
        });

        it('uses ${HOME} for portable POSIX entries', () => {
            expect(getClientLaunchCommand('/home/user/.brightscript/debug-mcp', { platform: 'linux', portable: true })).to.eql({
                command: '${HOME}/.brightscript/debug-mcp/bridge',
                args: []
            });
        });

        it('uses ${USERPROFILE} for portable Windows entries', () => {
            expect(getClientLaunchCommand('C:\\Users\\me\\.brightscript\\debug-mcp', { platform: 'win32', portable: true })).to.eql({
                command: 'cmd',
                args: ['/c', '${USERPROFILE}\\.brightscript\\debug-mcp\\bridge.cmd']
            });
        });

        it('falls back to the absolute path when the home is overridden', () => {
            expect(getClientLaunchCommand('/custom/home', { platform: 'darwin', portable: true, isHomeOverridden: true })).to.eql({
                command: '/custom/home/bridge',
                args: []
            });
            expect(getClientLaunchCommand('D:\\custom', { platform: 'win32', portable: true, isHomeOverridden: true }).args).to.eql(['/c', 'D:\\custom\\bridge.cmd']);
        });
    });

    describe('buildServerEntry', () => {
        it('includes the type only when asked', () => {
            expect(buildServerEntry(launchCommand, { includeType: true }).type).to.equal('stdio');
            expect(buildServerEntry(launchCommand, { includeType: false })).to.not.have.property('type');
        });

        it('carries no environment', () => {
            expect(buildServerEntry(launchCommand, { includeType: true })).to.not.have.property('env');
        });
    });

    describe('mergeServerEntry', () => {
        const entry = buildServerEntry(launchCommand, { includeType: true });

        it('creates a config when none exists', () => {
            const merged = JSON.parse(mergeServerEntry(undefined, entry));
            expect(merged).to.eql({ mcpServers: { 'brightscript-debugger': entry } });
        });

        it('treats an empty file as no config', () => {
            expect(JSON.parse(mergeServerEntry('  \n', entry)).mcpServers['brightscript-debugger']).to.eql(entry);
        });

        it('preserves other servers and top-level keys', () => {
            const existing = JSON.stringify({ theme: 'dark', mcpServers: { other: { command: 'x' } } });
            const merged = JSON.parse(mergeServerEntry(existing, entry));
            expect(merged.theme).to.equal('dark');
            expect(merged.mcpServers.other).to.eql({ command: 'x' });
            expect(merged.mcpServers['brightscript-debugger']).to.eql(entry);
        });

        it('replaces a previous registration of the same server', () => {
            const existing = JSON.stringify({ mcpServers: { 'brightscript-debugger': { command: 'old' } } });
            expect(JSON.parse(mergeServerEntry(existing, entry)).mcpServers['brightscript-debugger']).to.eql(entry);
        });

        it('refuses to overwrite invalid JSON', () => {
            expect(() => mergeServerEntry('{oops', entry)).to.throw('not valid JSON');
        });

        it('refuses non-object configs and a malformed mcpServers value', () => {
            expect(() => mergeServerEntry('[]', entry)).to.throw('not a JSON object');
            expect(() => mergeServerEntry('{"mcpServers": []}', entry)).to.throw('invalid "mcpServers"');
        });
    });

    describe('getClaudeDesktopConfigPath', () => {
        it('resolves per platform', () => {
            expect(getClaudeDesktopConfigPath('/Users/me', 'darwin')).to.equal(path.join('/Users/me', 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'));
            expect(getClaudeDesktopConfigPath('/home/me', 'linux')).to.equal(path.join('/home/me', '.config', 'Claude', 'claude_desktop_config.json'));
            expect(getClaudeDesktopConfigPath('C:\\Users\\me', 'win32', 'C:\\AppData')).to.equal(path.join('C:\\AppData', 'Claude', 'claude_desktop_config.json'));
        });
    });

    describe('buildClaudeCodeAddArgs', () => {
        it('registers the command tokens at user scope', () => {
            const entry = buildServerEntry(launchCommand, { includeType: true });
            expect(buildClaudeCodeAddArgs(entry)).to.eql(['mcp', 'add', '--scope', 'user', 'brightscript-debugger', '--', '/home/user/.brightscript/debug-mcp/bridge']);
        });

        it('passes the Windows cmd arguments through', () => {
            const entry = buildServerEntry({ command: 'cmd', args: ['/c', 'C:\\x\\bridge.cmd'] }, { includeType: true });
            expect(buildClaudeCodeAddArgs(entry).slice(-4)).to.eql(['--', 'cmd', '/c', 'C:\\x\\bridge.cmd']);
        });
    });

    describe('hasCmdSpecialCharacters', () => {
        it('flags characters cmd treats specially', () => {
            for (const character of ['&', '<', '>', '(', ')', '@', '^', '|']) {
                expect(hasCmdSpecialCharacters(`C:\\a${character}b\\bridge.cmd`), character).to.be.true;
            }
        });

        it('accepts ordinary paths including spaces', () => {
            expect(hasCmdSpecialCharacters('C:\\Users\\Jane Doe\\.brightscript\\debug-mcp\\bridge.cmd')).to.be.false;
        });
    });

    describe('buildCommandInvocation', () => {
        it('executes directly on POSIX', () => {
            expect(buildCommandInvocation('claude', ['mcp', 'list'], 'darwin')).to.eql({ file: 'claude', args: ['mcp', 'list'], windowsVerbatimArguments: false });
        });

        it('runs through cmd with every token quoted on Windows', () => {
            expect(buildCommandInvocation('claude', ['mcp', 'add', 'C:\\Program Files & Co\\bridge.cmd'], 'win32')).to.eql({
                file: 'cmd.exe',
                args: ['/d', '/s', '/c', '"\"claude\" \"mcp\" \"add\" \"C:\\Program Files & Co\\bridge.cmd\""'],
                windowsVerbatimArguments: true
            });
        });

        it('refuses tokens cmd would expand or mis-parse', () => {
            expect(() => buildCommandInvocation('claude', ['C:\\%TEMP%\\x'], 'win32')).to.throw('Windows command interpreter');
            expect(() => buildCommandInvocation('claude', ['a"b'], 'win32')).to.throw('Windows command interpreter');
        });
    });
});
