import * as fsExtra from 'fs-extra';
import * as path from 'path';
import { spawn } from 'child_process';
import * as debounce from 'debounce';
import * as chalk from 'chalk';
import * as dayjs from 'dayjs';
import * as deferred from 'deferred';

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

logger.writeLine(`${timestamp()} Starting compilation in watch mode...`);

//run watch tasks for every related project, in a single output window so we don't have 7 console tabs open
const projects = [{
    name: 'brighterscript'
}, {
    name: 'roku-deploy'
}, {
    name: 'roku-debug'
}, {
    name: 'brighterscript-formatter'
}, {
    name: path.basename(path.resolve(__dirname, '..')),
    dependencies: [
        'brighterscript',
        'roku-deploy',
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
    return fsExtra.pathExistsSync(x.path);
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
    const diagnostics = [];
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
                        diagnostic.raw?.replace(diagnostic.path!, path.normalize(path.join('../', diagnostic.path!)))
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
        shell: true
    });

    watcher.stdout.on('data', (data) => {
        processData(project, 'stdout', data.toString());
    });

    watcher.stderr.on('data', (data) => {
        processData(project, 'stderr', data.toString());
    });
});
