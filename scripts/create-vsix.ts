import * as fsExtra from 'fs-extra';
import * as path from 'path';
import * as childProcess from 'child_process';
import * as chalk from 'chalk';

const silent = process.argv.includes('--silent');
const tempDir = s`${__dirname}/../.vsix-building`;
let githubToken: string | undefined;
if (process.env.GH_TOKEN) {
    githubToken = process.env.GH_TOKEN;
    console.log('Using GH_TOKEN from environment variable: ' + githubToken.replace(/./g, '*'));
} else if (process.env.GITHUB_TOKEN) {
    githubToken = process.env.GITHUB_TOKEN;
    console.log('Using GITHUB_TOKEN from environment variable: ' + githubToken.replace(/./g, '*'));
} else {
    console.log('No GitHub token found in environment variables');
}
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
    repositoryUrl: 'https://github.com/rokucommunity/roku-debug-rsg',
    defaultBranch: 'rsg',
    dependencies: ['roku-deploy', 'brighterscript']
}, {
    name: 'brighterscript-formatter',
    dependencies: ['brighterscript']
}, {
    name: 'vscode-brightscript-language',
    repositoryUrl: 'https://github.com/rokucommunity/vscode-brightscript-language-rsg',
    defaultBranch: 'rsg',
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

    //for projects that weren't built locally, report the exact npm version the extension ended up with
    for (const project of projects) {
        if (!project.packagePath) {
            try {
                const version = fsExtra.readJsonSync(`${tempDir}/vscode-brightscript-language/node_modules/${project.name}/package.json`).version;
                const releaseUrl = project.repositoryUrl ?? `${baseUrl}/${project.name}`;
                project.source = `[v${version}](${releaseUrl}/releases/tag/v${version})`;
            } catch (e) {
                log(`Warning: could not determine the installed npm version of ${project.name}`);
            }
        }
    }

    //write a summary of what was built (the workflow includes this in the PR comment)
    const buildInfo = projects.map(x => ({ name: x.name, source: x.source, sha: x.sha }));
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
    project.processed = true;
    log(`${project.name}: processing`);
    //the extension itself is always built (falling back to its default branch); dependency projects are
    //only built when they have a matching branch, otherwise the normal npm dependency flows through
    const isRoot = project.name === 'vscode-brightscript-language';
    let ref = await resolveRef(project, branch, forkOwner);
    if (!ref && isRoot) {
        const cloneUrl = project.repositoryUrl ?? `${baseUrl}/${project.name}`;
        const defaultBranch = project.defaultBranch ?? 'master';
        const defaultSha = getBranchSha(cloneUrl, defaultBranch);
        ref = {
            cloneUrl: cloneUrl,
            ref: defaultBranch,
            source: branchLink(project, defaultBranch),
            sha: defaultSha,
            commitUrl: `${cloneUrl}/commit/${defaultSha}`
        };
    }
    if (!ref) {
        project.source = `npm registry (no '${branch}' branch)`;
        log(`${project.name}: no matching branch, using the version from the npm registry`);
        return;
    }
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
        //install the dependency's local build (when it wasn't built locally, keep the npm version)
        if (dependency.packagePath) {
            execSync(`npm i ${dependency.packagePath}`, { cwd: project.name });
        }
    }
    execSync(`npm i && npm run build && npm pack`, {
        cwd: project.name
    });

    project.packagePath = `file:/${tempDir}/${project.name}/${project.name}-${buildVersion}.tgz`;
    project.source = ref.source;
    if (ref.sha) {
        project.sha = `[${ref.sha.slice(0, 7)}](${ref.commitUrl})`;
    }
    log(`${project.name}: done`);
}

/**
 * Figure out where to build this project from. Priority:
 *   1. the org's branch, when attached to an open PR
 *   2. the fork owner's same-named branch, when attached to an open PR
 *   3. the org's branch, even without a PR
 * Returns undefined when the project has no matching branch (i.e. it shouldn't be built locally)
 */
async function resolveRef(project: Project, branch: string, forkOwner: string): Promise<Ref | undefined> {
    const orgCloneUrl = project.repositoryUrl ?? `${baseUrl}/${project.name}`;
    const repoName = getRepoName(project);
    if (branch && branch !== (project.defaultBranch ?? 'master')) {
        //1. the org has this branch and it's attached to an open PR
        let pr = await findOpenPr(repoName, orgName, branch);
        if (pr) {
            return {
                cloneUrl: orgCloneUrl,
                ref: branch,
                source: prLink(pr),
                sha: pr.head.sha,
                commitUrl: `${pr.head.repo.html_url}/commit/${pr.head.sha}`
            };
        }
        //2. the fork owner has this branch attached to an open PR on this project
        if (forkOwner) {
            pr = await findOpenPr(repoName, forkOwner, branch);
            if (pr) {
                return {
                    cloneUrl: pr.head.repo.clone_url,
                    ref: branch,
                    source: prLink(pr),
                    sha: pr.head.sha,
                    commitUrl: `${pr.head.repo.html_url}/commit/${pr.head.sha}`
                };
            }
        }
        //3. the org has this branch (no PR)
        const sha = getBranchSha(orgCloneUrl, branch);
        if (sha) {
            return {
                cloneUrl: orgCloneUrl,
                ref: branch,
                source: branchLink(project, branch),
                sha: sha,
                commitUrl: `${orgCloneUrl}/commit/${sha}`
            };
        }
    }
    //no matching branch anywhere
    return undefined;
}

/**
 * Render a PR as a markdown link, e.g. `pr: [rokucommunity/roku-deploy#123](https://github.com/rokucommunity/roku-deploy/pull/123)`
 */
function prLink(pr: { html_url: string; number: number; base: { repo: { full_name: string } } }) {
    return `pr: [${pr.base.repo.full_name}#${pr.number}](${pr.html_url})`;
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
    if (githubToken) {
        headers.authorization = `Bearer ${githubToken}`;
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

/**
 * Get the repo name to use for GitHub API lookups (the overridden repo name when this project has a
 * repositoryUrl override, otherwise the project's own name)
 */
function getRepoName(project: Project) {
    if (project.repositoryUrl) {
        return project.repositoryUrl.split('/').pop()!;
    }
    return project.name;
}

interface Project {
    name: string;
    repositoryUrl?: string;
    defaultBranch?: string;
    dependencies: string[];
    packagePath?: string;
    source?: string;
    /**
     * Markdown link to the exact commit that was built (only set for locally-built projects)
     */
    sha?: string;
    processed: boolean;
}

interface Ref {
    cloneUrl: string;
    ref: string;
    source: string;
    sha?: string;
    commitUrl?: string;
}

/**
 * Insert the GitHub token into a `https://github.com/...` URL that doesn't already have credentials
 * (needed so git operations against the token-gated roku-debug-rsg repo can authenticate)
 */
function injectToken(url: string) {
    if (!githubToken) {
        return url;
    }
    return url.replace(/^https:\/\/(?!.*@)/, `https://${githubToken}@`);
}

/**
 * Get the tip commit sha of a branch on a remote repo (returns undefined when the branch doesn't exist)
 */
function getBranchSha(cloneUrl: string, branch: string) {
    const url = injectToken(cloneUrl);
    const output = childProcess.execSync(`git ls-remote --heads ${url} "refs/heads/${branch}"`).toString();
    return output.split(/\s+/)[0] || undefined;
}

/**
 * Render a branch build as a markdown link to the branch,
 * e.g. `branch: [alpha](https://github.com/rokucommunity/roku-deploy/tree/alpha)`
 */
function branchLink(project: Project, branch: string) {
    const cloneUrl = project.repositoryUrl ?? `${baseUrl}/${project.name}`;
    return `branch: [${branch}](${cloneUrl}/tree/${branch})`;
}

function clone(project: Project, ref: Ref) {
    const url = injectToken(ref.cloneUrl);
    log(`Cloning ${url.replace(githubToken ?? '', '***')} (branch '${ref.ref}', shallow)`);
    //shallow single-branch clone: we only ever build the tip of one branch, so skip the full history
    execSync(`git clone --depth 1 --single-branch --branch "${ref.ref}" ${url} ${project.name}`);
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
