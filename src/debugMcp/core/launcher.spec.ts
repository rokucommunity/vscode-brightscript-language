import { expect } from 'chai';
import { buildLauncherScript, getLauncherPath, quoteForShell } from './launcher';

describe('debugMcp launcher', () => {
    describe('buildLauncherScript', () => {
        it('builds a POSIX script that runs the bridge as plain node', () => {
            expect(buildLauncherScript({ platform: 'darwin', executablePath: '/usr/bin/node', bridgePath: '/home/me/.brightscript/debug-mcp/bridge.js' })).to.equal(
                [
                    '#!/bin/sh',
                    'ELECTRON_RUN_AS_NODE=1',
                    'export ELECTRON_RUN_AS_NODE',
                    `exec '/usr/bin/node' '/home/me/.brightscript/debug-mcp/bridge.js' "$@"`,
                    ''
                ].join('\n')
            );
        });

        it('quotes paths with spaces and single quotes for sh', () => {
            const script = buildLauncherScript({
                platform: 'linux',
                executablePath: '/Applications/Visual Studio Code.app/Contents/MacOS/Code Helper (Plugin)',
                bridgePath: `/home/o'brien/bridge.js`
            });
            expect(script).to.contain(`exec '/Applications/Visual Studio Code.app/Contents/MacOS/Code Helper (Plugin)' '/home/o'\\''brien/bridge.js' "$@"`);
        });

        it('exports the given environment on POSIX', () => {
            const script = buildLauncherScript({ platform: 'darwin', executablePath: '/n', bridgePath: '/b.js', environment: { SOME_HOME: '/tmp/my home' } });
            expect(script).to.contain(`SOME_HOME='/tmp/my home'\nexport SOME_HOME`);
        });

        it('exports nothing without an environment', () => {
            expect(buildLauncherScript({ platform: 'darwin', executablePath: '/n', bridgePath: '/b.js' })).not.to.match(/export (?!ELECTRON)/);
        });

        it('builds a batch file with quoted paths and escaped percent signs', () => {
            expect(buildLauncherScript({
                platform: 'win32',
                executablePath: 'C:\\Program Files\\Microsoft VS Code\\Code.exe',
                bridgePath: 'C:\\Users\\100%\\bridge.js'
            })).to.equal(
                [
                    '@echo off',
                    'set ELECTRON_RUN_AS_NODE=1',
                    '"C:\\Program Files\\Microsoft VS Code\\Code.exe" "C:\\Users\\100%%\\bridge.js" %* & exit /b',
                    ''
                ].join('\r\n')
            );
        });

        it('sets the given environment in the batch file', () => {
            const script = buildLauncherScript({ platform: 'win32', executablePath: 'C:\\c.exe', bridgePath: 'C:\\b.js', environment: { SOME_HOME: 'D:\\my home' } });
            expect(script).to.contain('set "SOME_HOME=D:\\my home"\r\n');
        });
    });

    describe('getLauncherPath', () => {
        it('uses the platform file name and separators', () => {
            expect(getLauncherPath('/home/me/home', 'linux')).to.equal('/home/me/home/bridge');
            expect(getLauncherPath('C:\\Users\\me\\home', 'win32')).to.equal('C:\\Users\\me\\home\\bridge.cmd');
        });
    });

    describe('quoteForShell', () => {
        it('keeps shell metacharacters literal', () => {
            expect(quoteForShell('a $b `c` "d"')).to.equal(`'a $b \`c\` "d"'`);
        });
    });
});
