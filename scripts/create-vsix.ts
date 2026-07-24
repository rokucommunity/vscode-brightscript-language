import * as fsExtra from 'fs-extra';
import * as path from 'path';
import * as childProcess from 'child_process';
import * as chalk from 'chalk';

const silent = process.argv.includes('--silent');
const tempDir = s`${__dirname}/../.vsix-building`;
const baseUrl = 'https://github.com/rokucommunity';
const projects = [{
    name: 'logger',
    packageName: '@rokucommunity/logger',
    dependencies: []
}, {
    name: 'roku-test-automation',
    dependencies: []
}, {
    name: 'roku-deploy',
    dependencies: []
}, {
    name: 'brighterscript',
    dependencies: ['roku-deploy', 'logger']
}, {
    name: 'roku-debug',
    dependencies: ['roku-deploy', 'brighterscript', 'logger']
}, {
    name: 'brighterscript-formatter',
    dependencies: ['brighterscript']
}, {
    name: 'vscode-brightscript-language',
    dependencies: ['brighterscript', 'roku-debug', 'brighterscript-formatter', 'roku-deploy', 'logger', 'roku-test-automation']
}] as Project[];

function main() {
    //create a temp directory for this process
    log(`Creating and cleaning ${tempDir}`);
    fsExtra.emptyDirSync(tempDir);
    process.chdir(tempDir);

    const branch = process.argv[2].replace(/^refs\/heads\//, '');

    //build and link all the projects
    for (const project of projects) {
        processProject(project, branch);
    }

    log('Building and packaging the extension');
    execSync('npm run package', { cwd: 'vscode-brightscript-language' });
}

function processProject(project: Project, branch: string) {
    //if this project has already been processed, skip
    if (project.processed) {
        log(`${project.name}: already processed`);
        return;
    }
    log(`${project.name}: processing`);
    const projectBranch = hasBranch(project, branch) ? branch : 'master';
    const buildVersion = `9001.0.0-${projectBranch.replace(/[^a-zA-Z0-9]/g, '-')}.${Date.now()}`;

    clone(project, projectBranch);
    changeVersion(project, buildVersion);
    execSync(`npm i`, {
        cwd: project.name
    });
    for (const dependencyName of project.dependencies) {
        log(`${project.name}: Processing dependency '${dependencyName}'`);
        const dependency = projects.find(x => x.name === dependencyName)!;
        processProject(dependency, branch);
        //install the dependency into this project
        execSync(`npm i ${dependency.packagePath}`, { cwd: project.name });
    }
    execSync(`npm i && npm run build && npm pack`, {
        cwd: project.name
    });

    //`npm pack` names the tarball after the package.json `name` field (scopes become dashes, e.g. `@rokucommunity/logger` -> `rokucommunity-logger-<version>.tgz`)
    const tarballName = (project.packageName ?? project.name).replace(/^@/, '').replace('/', '-');
    project.packagePath = `file:/${tempDir}/${project.name}/${tarballName}-${buildVersion}.tgz`;
    project.processed = true;
    log(`${project.name}: done`);
}

interface Project {
    /**
     * The name of the GitHub repo, e.g. `logger` for https://github.com/rokucommunity/logger
     */
    name: string;
    /**
     * The published npm package name, if different from the repo name, e.g. `@rokucommunity/logger`
     */
    packageName?: string;
    dependencies: string[];
    packagePath?: string;
    processed: boolean;
}

/**
 * Determine if a repo has a branch with the given name
 */
function hasBranch(project: Project, branch: string) {
    const output = childProcess.execSync(`git ls-remote --heads ${baseUrl}/${project.name}`).toString();
    const regexp = new RegExp(`refs/heads/${escapeRegExp(branch)}\\b`);
    return !!regexp.exec(output);
}

function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function clone(project: Project, branch: string) {
    const url = `${baseUrl}/${project.name}`;
    log(`Cloning ${url}`);
    execSync(`git clone ${url} ${project.name}`);
    execSync(`git checkout ${branch}`, {
        cwd: project.name
    });
}

function changeVersion(project: Project, version: string) {
    const packageJson = fsExtra.readJsonSync(`${project.name}/package.json`);
    packageJson.version = version;
    fsExtra.writeJsonSync(`${project.name}/package.json`, packageJson, { spaces: 4 });

    const packageLockJson = fsExtra.readJsonSync(`${project.name}/package-lock.json`);
    packageLockJson.version = version;
    fsExtra.writeJsonSync(`${project.name}/package-lock.json`, packageLockJson, { spaces: 4 });
}

function execSync(command: string, options?: childProcess.ExecSyncOptions) {
    options = { stdio: 'inherit', ...options };
    if (silent) {
        delete options.stdio;
    }
    log(command + ' ' + JSON.stringify(options));
    return childProcess.execSync(command, options);
}

function log(message: string) {
    console.log(`\n${chalk.blueBright(message)}\n`);
}

export function s(stringParts, ...expressions: any[]) {
    let result: string[] = [];
    for (let i = 0; i < stringParts.length; i++) {
        result.push(stringParts[i], expressions[i]);
    }

    return path.resolve(
        path.normalize(
            result.join('')
        )
    ).replace(/[\/\\]+/g, '/');
}

main();
