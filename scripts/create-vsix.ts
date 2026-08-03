import * as fsExtra from 'fs-extra';
import * as path from 'path';
import * as childProcess from 'child_process';
import * as chalk from 'chalk';

const silent = process.argv.includes('--silent');
const tempDir = s`${__dirname}/../.vsix-building`;
const orgName = 'rokucommunity';
const baseUrl = `https://github.com/${orgName}`;
const projects = [{
    name: 'roku-deploy',
    dependencies: []
}, {
    name: 'brighterscript',
    dependencies: ['roku-deploy']
}, {
    name: 'roku-debug',
    dependencies: ['roku-deploy', 'brighterscript']
}, {
    name: 'brighterscript-formatter',
    dependencies: ['brighterscript']
}, {
    name: 'vscode-brightscript-language',
    dependencies: ['brighterscript', 'roku-debug', 'brighterscript-formatter', 'roku-deploy']
}] as Project[];

async function main() {
    //create a temp directory for this process
    log(`Creating and cleaning ${tempDir}`);
    fsExtra.emptyDirSync(tempDir);
    process.chdir(tempDir);

    const args = process.argv.slice(2);
    //when set, the originating PR came from this owner's fork, so also consider that owner's
    //same-named branches (when attached to open PRs) on the other projects
    let forkOwner = '';
    const forkOwnerIndex = args.indexOf('--fork-owner');
    if (forkOwnerIndex > -1) {
        forkOwner = (args[forkOwnerIndex + 1] ?? '').trim();
        args.splice(forkOwnerIndex, 2);
    }
    if (forkOwner === orgName) {
        forkOwner = '';
    }
    const branch = (args.find(x => !x.startsWith('--')) ?? '').replace(/^refs\/heads\//, '');
    if (!branch) {
        throw new Error('You must provide a branch name');
    }

    //build and link all the projects
    for (const project of projects) {
        await processProject(project, branch, forkOwner);
    }

    //write a summary of what was built (the workflow includes this in the PR comment)
    const buildInfo = projects.map(x => ({ name: x.name, source: x.source }));
    fsExtra.writeJsonSync(`${tempDir}/build-info.json`, buildInfo, { spaces: 4 });
    log('Build summary:\n' + buildInfo.map(x => `  ${x.name}: ${x.source}`).join('\n'));

    log('Building and packaging the extension');
    execSync('npm run package', { cwd: 'vscode-brightscript-language' });
}

async function processProject(project: Project, branch: string, forkOwner: string) {
    //if this project has already been processed, skip
    if (project.processed) {
        log(`${project.name}: already processed`);
        return;
    }
    log(`${project.name}: processing`);
    const ref = await resolveRef(project, branch, forkOwner);
    log(`${project.name}: building from ${ref.source}`);
    const buildVersion = `9001.0.0-${ref.ref.replace(/[^a-zA-Z0-9]/g, '-')}.${Date.now()}`;

    clone(project, ref);
    changeVersion(project, buildVersion);
    execSync(`npm i`, {
        cwd: project.name
    });
    for (const dependencyName of project.dependencies) {
        log(`${project.name}: Processing dependency '${dependencyName}'`);
        const dependency = projects.find(x => x.name === dependencyName)!;
        await processProject(dependency, branch, forkOwner);
        //install the dependency into this project
        execSync(`npm i ${dependency.packagePath}`, { cwd: project.name });
    }
    execSync(`npm i && npm run build && npm pack`, {
        cwd: project.name
    });

    project.packagePath = `file:/${tempDir}/${project.name}/${project.name}-${buildVersion}.tgz`;
    project.source = ref.source;
    project.processed = true;
    log(`${project.name}: done`);
}

/**
 * Figure out where to build this project from. Priority:
 *   1. the org's branch, when attached to an open PR
 *   2. the fork owner's same-named branch, when attached to an open PR
 *   3. the org's branch, even without a PR
 *   4. master
 */
async function resolveRef(project: Project, branch: string, forkOwner: string): Promise<Ref> {
    const orgCloneUrl = `${baseUrl}/${project.name}`;
    if (branch && branch !== 'master') {
        //1. the org has this branch and it's attached to an open PR
        let pr = await findOpenPr(project.name, orgName, branch);
        if (pr) {
            return { cloneUrl: orgCloneUrl, ref: branch, source: `${orgName} branch '${branch}' (open PR ${pr.html_url})` };
        }
        //2. the fork owner has this branch attached to an open PR on this project
        if (forkOwner) {
            pr = await findOpenPr(project.name, forkOwner, branch);
            if (pr) {
                return { cloneUrl: pr.head.repo.clone_url, ref: branch, source: `${forkOwner} fork branch '${branch}' (open PR ${pr.html_url})` };
            }
        }
        //3. the org has this branch (no PR)
        if (hasBranch(project, branch)) {
            return { cloneUrl: orgCloneUrl, ref: branch, source: `${orgName} branch '${branch}'` };
        }
    }
    //4. fall back to master
    return { cloneUrl: orgCloneUrl, ref: 'master', source: `${orgName} branch 'master'` };
}

/**
 * Find an open PR on the org's repo whose head is `<owner>:<branch>` (returns undefined when there isn't one)
 */
async function findOpenPr(repoName: string, owner: string, branch: string) {
    const url = `https://api.github.com/repos/${orgName}/${repoName}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`;
    const headers: Record<string, string> = {
        'accept': 'application/vnd.github+json',
        'user-agent': `${orgName}-create-vsix`
    };
    //use the token when available (CI) to avoid the low unauthenticated rate limit
    if (process.env.GITHUB_TOKEN) {
        headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    //minutes of npm installs/builds pass between calls, and GitHub closes idle keep-alive sockets
    //long before then. `connection: close` avoids undici reusing a socket the server already dropped
    //(which surfaces as `TypeError: fetch failed` / UND_ERR_SOCKET "other side closed")
    const response = await fetch(url, { headers: { ...headers, connection: 'close' } });
    if (!response.ok) {
        log(`Warning: could not look up open PRs for ${owner}:${branch} on ${repoName} (HTTP ${response.status})`);
        return undefined;
    }
    const prs = await response.json() as any[];
    return prs[0];
}

interface Project {
    name: string;
    dependencies: string[];
    packagePath?: string;
    source?: string;
    processed: boolean;
}

interface Ref {
    cloneUrl: string;
    ref: string;
    source: string;
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

function clone(project: Project, ref: Ref) {
    log(`Cloning ${ref.cloneUrl}`);
    execSync(`git clone ${ref.cloneUrl} ${project.name}`);
    execSync(`git checkout ${ref.ref}`, {
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

main().catch(e => {
    console.error(e);
    process.exit(1);
});
