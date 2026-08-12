import * as fsExtra from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { spawn, spawnSync } from 'child_process';
import type { ChildProcess } from 'child_process';
import * as debounce from 'debounce';
import * as chalk from 'chalk';
import * as dayjs from 'dayjs';
import * as deferred from 'deferred';

const vscodePackageJson = fsExtra.readJsonSync(path.resolve(__dirname, '..', 'package.json'));
const allDeps = {
    ...vscodePackageJson.dependencies,
    ...vscodePackageJson.devDependencies
};
const localFileDeps = new Set(
    Object.entries(allDeps)
        .filter(([, version]) => /^(file|link):/.test(version as string))
        .map(([name]) => name)
);

class Logger {
    private canReplaceLine = false;
    public writeLine(message = '', isReplaceable = false) {
        if (this.canReplaceLine && isReplaceable) {
            process.stdout.write('\r');
        } else {
            process.stdout.write('\r\n');
        }
        process.stdout.write(message);
        this.canReplaceLine = isReplaceable;
    }
}

const logger = new Logger();

const repoRoot = path.resolve(__dirname, '..');
//scope the pid file to this checkout so parallel clones don't kill each other's watchers
const pidFile = path.join(
    os.tmpdir(),
    `vscode-brightscript-watch-all-${crypto.createHash('md5').update(repoRoot).digest('hex').slice(0, 8)}.json`
);
const watchers: ChildProcess[] = [];

function killGroup(pid: number) {
    try {
        if (process.platform === 'win32') {
            spawnSync('taskkill', ['/pid', `${pid}`, '/t', '/f'], { stdio: 'ignore' });
        } else {
            //negative pid targets the whole process group (npm + tsc/vite),
            //which a plain kill(pid) would leave running
            process.kill(-pid, 'SIGKILL');
        }
    } catch {
        //group is already gone - nothing to do
    }
}

//kill any watchers left behind by a previous run that didn't shut down cleanly
//(VS Code killing the task, a crash, etc). This is what stops watcher processes
//from piling up across launches until the machine has to be restarted.
function cleanupPreviousRun() {
    let previousPids: number[] = [];
    try {
        previousPids = fsExtra.readJsonSync(pidFile);
    } catch {
        return;
    }
    for (const pid of previousPids) {
        killGroup(pid);
    }
    fsExtra.removeSync(pidFile);
}

function writePidFile() {
    fsExtra.writeJsonSync(pidFile, watchers.map(watcher => watcher.pid).filter(pid => pid !== undefined));
}

function shutdown() {
    for (const watcher of watchers) {
        if (watcher.pid !== undefined) {
            killGroup(watcher.pid);
        }
    }
    fsExtra.removeSync(pidFile);
}

process.on('exit', shutdown);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => {
        shutdown();
        process.exit();
    });
}

cleanupPreviousRun();

logger.writeLine(`[${timestamp()}] Starting compilation in watch mode...`);

//run watch tasks for every related project, in a single output window so we don't have 7 console tabs open
const projects = [{
    name: 'roku-deploy',
    dependencies: []
}, {
    name: 'brighterscript',
    dependencies: [
        'roku-deploy'
    ]
}, {
    name: 'brighterscript-formatter',
    dependencies: [
        'brighterscript'
    ]
}, {
    name: 'roku-debug',
    dependencies: [
        'roku-deploy',
        'brighterscript'
    ]
}, {
    name: path.basename(path.resolve(__dirname, '..')),
    dependencies: [
        'roku-deploy',
        'brighterscript',
        'roku-debug',
        'brighterscript-formatter'
    ]
}].map(x => {
    return {
        ...x,
        dependencies: x.dependencies ?? [],
        path: path.resolve(__dirname, '..', '..', x.name),
        state: 'pending' as 'pending' | 'error' | 'success',
        diagnostics: [] as undefined | ReturnType<typeof getDiagnostics>,
        firstCompletion: deferred() as { resolve: () => void; reject: () => void; resolved: boolean; promise: Promise<any> }
    };
}).filter(x => {
    const isVscodeProject = x.name === path.basename(path.resolve(__dirname, '..'));
    return fsExtra.pathExistsSync(x.path) && (isVscodeProject || localFileDeps.has(x.name));
});
type Project = typeof projects[0];

function timestamp() {
    return dayjs(Date.now()).format('h:mm:ss A');
}

function processData(project: Project, source: 'stdout' | 'stderr', data: string) {
    for (const line of data?.split(/\r?\n/g) ?? []) {
        const [, errorCount] = /Found\s+(\d+)\s+error[s]?\.\s+Watching\s+for\s+file\s+changes/i.exec(line) ?? [];
        if (errorCount === '0') {
            project.state = 'success';
            if (!project.firstCompletion.resolved) {
                project.firstCompletion.resolve();
            }
        } else if (errorCount !== undefined) {
            project.state = 'error';
            if (!project.firstCompletion.resolved) {
                project.firstCompletion.resolve();
            }
        }

        //if file changes were detected, clear the diagnostics
        if (/File change detected. Starting incremental compilation/.exec(line)) {
            //don't log "changes detected" if we're already pending
            if (project.state !== 'pending') {
                logger.writeLine(chalk.yellow(project.name));
                logger.writeLine(`[${timestamp()}] File change detected. Starting incremental compilation...`);
            }
            project.state = 'pending';
            project.diagnostics = [];
        }

        //collect any new diagnostics that were emitted
        (project.diagnostics ??= []).push(
            ...getDiagnostics(line)
        );

        if (source === 'stderr') {
            process[source].write(chalk.red('---' + chalk.green(project.name) + '---\n' + line));
        }
    }
    printStatus();
}

const printStatus = debounce(() => {
    let errorCount = 0;
    let pendingCount = 0;
    let status = projects.map(project => {
        if (project.state === 'success') {
            return chalk.green(`✔ ${project.name}`);
        } else if (project.state === 'error') {
            return chalk.red(`✖ ${project.name}`);
        } else {
            pendingCount++;
            return chalk.grey(`◌ ${project.name}`);
        }
    });

    // .replace(/\x1b/g, '');
    logger.writeLine(status.join(', '), true);
    if (pendingCount === 0) {
        for (const project of projects) {
            if ((project.diagnostics?.length ?? 0) > 0) {
                logger.writeLine(`${chalk.red(project.name)} diagnostics:\n`);
                for (const diagnostic of project.diagnostics ?? []) {
                    logger.writeLine(
                        diagnostic.raw?.replace(diagnostic.path!, path.normalize(path.join(project.path, diagnostic.path!)))
                    );
                }
            }
        }
        logger.writeLine(`\n[${timestamp()}] Found ${errorCount} errors. Watching for file changes.\n`);
    }
}, 100, false);

function getDiagnostics(data: string) {
    return [...data.matchAll(/^([^\s].*)[\(:](\d+)[,:](\d+)(?:\):\s+|\s+-\s+)(error|warning|info)\s+TS(\d+)\s*:\s*(.*)$/gm)].map((match) => {
        return {
            raw: match.shift(),
            path: match.shift(),
            line: match.shift(),
            character: match.shift(),
            severity: match.shift(),
            code: match.shift(),
            message: match.shift()
        };
    });
}


// eslint-disable-next-line
projects.forEach(async (project) => {
    //wait for all dependencies to finish their first run
    await Promise.all(
        projects.filter(x => project.dependencies.includes(x.name)).map(x => x.firstCompletion.promise)
    );
    const watcher = spawn('npm', ['run', 'watch'], {
        cwd: project.path,
        env: { ...process.env },
        shell: true,
        //run each watcher in its own process group so shutdown can kill the entire
        //npm -> tsc/vite subtree instead of orphaning it
        detached: true
    });
    watchers.push(watcher);
    writePidFile();

    watcher.stdout.on('data', (data) => {
        processData(project, 'stdout', data.toString());
    });

    watcher.stderr.on('data', (data) => {
        processData(project, 'stderr', data.toString());
    });
});
