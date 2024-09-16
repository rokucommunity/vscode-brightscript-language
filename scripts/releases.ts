/**
 * This script automates the releases of all the RokuCommunity projects.
 * You must have push and tag access to the repositories to use this script.
 */
import * as yargs from 'yargs';
import * as fsExtra from 'fs-extra';
import { standardizePath as s } from 'brighterscript';
import { execSync, exec } from 'child_process';
import * as chalk from 'chalk';
import * as semver from 'semver';
import * as prompt from 'prompt';
import * as terminalOverwrite from 'terminal-overwrite';
import * as notifier from 'node-notifier';

class Runner {
    private tempDir = s`${__dirname}/../.tmp/.releases`;

    private options: {
        groups: string[];
        projects: string[];
        test: boolean;
        force: boolean;
    };

    public async run(options: Runner['options']) {
        this.options = options;
        console.log('Creating tempDir', this.tempDir);
        fsExtra.emptyDirSync(this.tempDir);

        options.groups ??= [];

        //clone all projects
        console.log('Cloning projects');
        for (const project of this.projects) {
            this.cloneProject(project);
        }

        const projects = this.projects
            //filter by group
            .filter(x => options.groups.length === 0 || x?.groups?.find(g => options.groups.includes(g)))
            //filter by project name
            .filter(x => options.projects.length === 0 || options.projects.includes(x.name));

        console.log('Selected projects:', projects.map(x => x.name));

        for (const project of projects) {
            console.log('');
            await this.processProject(project);
        }
    }

    private async processProject(project: Project) {
        const lastTag = this.getLastTag(project.dir);
        const latestReleaseVersion = lastTag.replace(/^v/, '');
        this.log(project, `Last release was ${lastTag}`);

        this.log(project, 'installing npm packages');
        execSync(`npm install`, { cwd: project.dir });

        this.installDependencies(project, latestReleaseVersion);

        this.computeChanges(project, lastTag);

        if (!this.options.force && project.changes.length === 0) {
            this.log(project, 'Nothing has changed since last release');
            return;
        }
        await this.doRelease(project, lastTag);
    }

    /**
     * Prompt the user for a response, and only accept certain values
     */
    private async prompt(message: string, actions: string[]) {
        const input = await prompt.get({
            properties: {
                action: {
                    description: message,
                    pattern: new RegExp(`^((${actions.join(')|(')}))$`, 'i'),
                    required: true
                }
            }
        });
        const action = input?.action?.toString()?.toLowerCase();
        return action;
    }

    /**
     * Find the year-month-day of the specified release from git logs
     */
    private getVersionDate(cwd: string, version: string) {
        const logOutput = execSync('git log --tags --simplify-by-decoration --pretty="format:%ci %d"', { cwd: cwd }).toString();
        const [, date] = new RegExp(String.raw`(\d+-\d+-\d+).*?tag:[ \t]*v${version.replace('.', '\\.')}`, 'gmi').exec(logOutput) ?? [];
        return date;
    }

    private async doRelease(project: Project, lastTag: string) {
        const [month, day, year] = new Date().toLocaleDateString().split('/');

        function getReflink(project: Project, commit: Commit, includeProjectName = false) {
            let preHashName = includeProjectName ? project.name : undefined;
            if (commit.prNumber) {
                return `[${preHashName ?? ''}#${commit.prNumber}](${project.repositoryUrl}/pull/${commit.prNumber})`;
            } else {
                preHashName = preHashName ? '#' + preHashName : '';
                return `[${preHashName}${commit.hash}](${project.repositoryUrl}/commit/${commit.hash})`;
            }
        }

        const lines = [
            '', '', '', '',
            `## [UNRELEASED](${project.repositoryUrl}/compare/${lastTag}...UNRELEASED) - ${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
            `### Changed`
        ];
        //add lines for each commit since last release
        for (const commit of this.getCommitLogs(project.name, lastTag, 'HEAD')) {
            lines.push(` - ${commit.message} (${getReflink(project, commit)})`);
        }

        //build changelog entries for each new dependency
        for (const dependency of [...project.dependencies, ...project.devDependencies]) {
            if (dependency.previousReleaseVersion !== dependency.newVersion) {
                const dependencyProject = this.getProject(dependency.name);
                lines.push([
                    ` - upgrade to [${dependency.name}@${dependency.newVersion}]`,
                    `(${dependencyProject.repositoryUrl}/blob/master/CHANGELOG.md#`,
                    `${dependency.newVersion.replace(/\./g, '')}---${this.getVersionDate(dependencyProject.dir, dependency.newVersion)}). `,
                    `Notable changes since ${dependency.previousReleaseVersion}:`
                ].join(''));
                for (const commit of this.getCommitLogs(dependencyProject.name, dependency.previousReleaseVersion, dependency.newVersion)) {
                    lines.push(`     - ${commit.message} (${getReflink(dependencyProject, commit, true)})`);
                }
            }
        }

        const changelogPath = s`${project.dir}/CHANGELOG.md`;

        let changelog = fsExtra.readFileSync(changelogPath).toString();
        const [eolChar] = /\r?\n/.exec(changelog) ?? ['\r\n'];
        const marker = 'this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).';

        changelog = changelog.replace(
            marker,
            marker + lines.join(eolChar)
        );
        fsExtra.outputFileSync(changelogPath, changelog);
        try {
            notifier.notify({
                title: `${project.name}: ready to release`,
                message: `Please review the changelog for ${project.name}`
            });
        } catch { }
        let targetVersion = '';
        while (true) {
            console.log('\nChangelog for ', chalk.green(project.name), ': ', chalk.yellow(changelogPath));
            const action = await this.prompt(
                'Review and edit the changelog (link shown above). Type "continue" to continue, or "skip" to skip this release.',
                ['skip', 'continue']
            );
            if (action === 'skip') {
                this.log(project, 'Skipping release');
                return;
            } else if (action === 'continue') {
                //get the latest version from the changelog. that's what we'll use for the `npm version` call
                [, targetVersion] = /##\s*\[(.*?)\]/.exec(
                    fsExtra.readFileSync(changelogPath).toString()
                ) ?? [];
                if (!semver.valid(targetVersion)) {
                    console.error(`Invalid version "${targetVersion}"`);
                } else {
                    break;
                }
            } else {
                console.error('Invalid input. Please enter a valid action');
            }
        }

        this.log(project, 'Committing changelog');
        execSync(`git add -A && git commit -m "Update changelog for v${targetVersion}"`, { cwd: project.dir, stdio: 'inherit' });

        //keep trying to run `npm version` until it succeeds, or until the user cancels
        while (true) {
            try {
                this.log(project, `Executing "npm version ${targetVersion}"`);
                execSync(`npm version ${targetVersion}`, { cwd: project.dir, stdio: 'inherit' });
                //no exceptions occurred. escape this loop
                break;
            } catch {
                const action = await this.prompt(
                    `Encountered an exception while versioning "${chalk.green(project.name)}". Fix the issues in "${chalk.green(project.dir)}", then type "retry". Type "skip" to skip this release, or "cancel" to cancel the entire process"`,
                    ['retry', 'cancel', 'skip']
                );
                if (action === 'retry') {
                    //commit any changes in the directory (so the dev doesn't have to do that manually themselves)
                    execSync(`git commit --all -m "Fixing issues before release ${targetVersion}"`, { cwd: project.dir, stdio: 'inherit' });
                    continue;
                } else if (action === 'cancel') {
                    throw new Error('Cancelling release');
                } else if (action === 'skip') {
                    this.log(project, 'Release skipped');
                    return;
                }
            }
        }

        this.log(project, 'pushing release to github');
        if (this.options.test) {
            this.log(project, 'TEST MODE: skipping command "git push origin master --tags"');
        } else {
            execSync('git push origin master --tags', { cwd: project.dir, stdio: 'inherit' });
        }

        //wait for the npm package to show up in the registry, then move on to the next project
        await this.waitForLatestVersion(project, targetVersion);
    }

    private async waitForLatestVersion(project: Project, targetVersion: string) {
        let isFinished;
        const interval = 15_000;
        const initialDelay = 60_000 - interval;

        //if in test mode, do a small timeout to simulate waiting for latest version, then mark finished
        if (this.options.test) {
            setTimeout(() => {
                isFinished = true;
            }, 5000);
        } else {
            setTimeout(() => {
                const handle = setInterval(() => {
                    const latestVersion = this.getLatestVersion(project.npmName);
                    if (latestVersion === targetVersion) {
                        isFinished = true;
                        clearInterval(handle);
                    }
                }, interval);
                //publishing takes several minutes, so don't start monitoring for a little while...
            }, initialDelay);
        }
        const startTime = Date.now();
        while (true) {
            await this.sleep(1000);
            if (isFinished) {
                break;
            }
            const totalSeconds = Math.round((Date.now() - startTime) / 1000) + 's';
            terminalOverwrite(`${chalk.green(project.name)}: Waiting for npm to publish package (${totalSeconds})`);
        }
        terminalOverwrite(`${chalk.green(project.name)}: package successfully published to npm`);
    }

    /**
     *
     * @param packageName Find the latest-published version of an npm package
     */
    private getLatestVersion(packageName: string) {
        const versions = JSON.parse(
            execSync(`npm view ${packageName} versions --json`).toString()
        ) as string[];
        return semver.maxSatisfying(versions, '*');
    }


    private sleep(timeout: number) {
        return new Promise<void>((resolve) => {
            setTimeout(() => {
                resolve();
            }, timeout);
        });
    }

    /**
     * read the dependency version from the specified release commit
     */
    private getDependencyVersionFromRelease(project: Project, releaseVersion: string, packageName: string, dependencyType: 'dependencies' | 'devDependencies') {
        const output = execSync(`git show v${releaseVersion}:package.json`, { cwd: project.dir }).toString();
        const packageJson = JSON.parse(output);
        const version = packageJson?.[dependencyType][packageName];
        return /\d+\.\d+\.\d+/.exec(version)?.[0] as string;
    }

    private installDependencies(project: Project, latestReleaseVersion: string) {
        this.log(project, 'installing', project.dependencies.length, 'dependencies and', project.devDependencies.length, 'devDependencies');

        const install = (project: Project, dependencyType: 'dependencies' | 'devDependencies', flags?: string) => {
            for (const dependency of project[dependencyType]) {
                dependency.previousReleaseVersion = this.getDependencyVersionFromRelease(project, latestReleaseVersion, dependency.name, dependencyType);
                const currentVersion = fsExtra.readJsonSync(s`${project.dir}/node_modules/${dependency.name}/package.json`).version;

                execSync(`npm install ${dependency.name}@latest`, { cwd: project.dir, stdio: 'inherit' });

                dependency.newVersion = fsExtra.readJsonSync(s`${project.dir}/node_modules/${dependency.name}/package.json`).version;

                if (dependency.newVersion !== currentVersion) {
                    this.log(project, `Updated ${chalk.green(dependency.name)} from ${chalk.yellow(currentVersion)} to ${chalk.yellow(dependency.newVersion)}`);
                }
            }
        };

        install(project, 'dependencies');
        install(project, 'devDependencies', '--save-dev');
    }

    private computeChanges(project: Project, lastTag: string) {
        project.changes.push(
            ...this.getCommitLogs(project.name, lastTag, 'HEAD')
        );
        //get commits from any changed dependencies
        for (const dependency of [...project.dependencies, ...project.devDependencies]) {
            //the dependency has changed
            if (dependency.previousReleaseVersion !== dependency.newVersion) {
                project.changes.push(
                    ...this.getCommitLogs(dependency.name, dependency.previousReleaseVersion, dependency.newVersion)
                );
            }
        }
    }

    /**
     * Get the project with the specified name
     */
    private getProject(projectName: string) {
        return this.projects.find(x => x.name === projectName)!;
    }

    private getCommitLogs(projectName: string, startVersion: string, endVersion: string) {
        startVersion = startVersion.startsWith('v') ? startVersion : 'v' + startVersion;
        endVersion = endVersion.startsWith('v') || endVersion === 'HEAD' ? endVersion : 'v' + endVersion;
        const project = this.getProject(projectName);
        const commitMessages = execSync(`git log ${startVersion}...${endVersion} --oneline`, {
            cwd: project?.dir
        }).toString()
            .split(/\r?\n/g)
            //exclude empty lines
            .filter(x => x.trim())
            .map(x => {
                const [, hash, branchInfo, message, prNumber] = /\s*([a-z0-9]+)\s*(?:\((.*?)\))?\s*(.*?)\s*(?:\(#(\d+)\))?$/gm.exec(x) ?? [];
                return {
                    hash: hash,
                    branchInfo: branchInfo,
                    message: message ?? x,
                    prNumber: prNumber
                };
            })
            //exclude version-only commit messages
            .filter(x => !semver.valid(x.message))
            //exclude those "update changelog for..." message
            .filter(x => !x.message.toLowerCase().startsWith('update changelog for '));


        return commitMessages;
    }

    /**
     * Find the highest non-prerelease tag for this repository
     */
    private getLastTag(cwd: string) {
        const allTags = semver.sort(
            execSync(`git tag --sort version:refname`, { cwd: cwd })
                .toString()
                .split(/\r?\n/)
                .map(x => x.trim())
                //only keep valid version tags
                .filter(x => semver.valid(x))
                //exclude prerelease versions
                .filter(x => !semver.prerelease(x))
        ).reverse();

        return allTags[0];
    }

    private log(project: Project, ...messages: any[]) {
        console.log(`${chalk.green(project.name)}:`, ...messages);
    }

    private cloneProject(project: Project) {
        const repoName = project.name.split('/').pop();

        let url = project.repositoryUrl;
        if (!url) {
            url = `https://github.com/rokucommunity/${repoName}`;
        }

        //clone the project
        project.dir = s`${this.tempDir}/${repoName}`;
        console.log(`Cloning ${url}`);
        execSync(`git clone "${url}" "${project.dir}"`);
    }

    private projects: Project[] = [{
        name: 'roku-deploy',
        dependencies: [],
        groups: ['vscode']
    }, {
        name: '@rokucommunity/logger',
        dependencies: [],
        groups: ['vscode']
    }, {
        name: '@rokucommunity/bslib',
        dependencies: [],
        groups: ['vscode']
    }, {
        name: 'brighterscript',
        dependencies: [
            '@rokucommunity/bslib',
            'roku-deploy'
        ],
        groups: ['vscode']
    }, {
        name: 'roku-debug',
        dependencies: [
            'brighterscript',
            '@rokucommunity/logger',
            'roku-deploy'
        ],
        groups: ['vscode']
    }, {
        name: 'brighterscript-formatter',
        dependencies: [
            'brighterscript'
        ],
        groups: ['vscode']
    }, {
        name: 'bslint',
        npmName: '@rokucommunity/bslint',
        dependencies: [],
        devDependencies: [
            'brighterscript'
        ]
    }, {
        name: 'brs',
        npmName: '@rokucommunity/brs',
        dependencies: []
    }, {
        name: 'ropm',
        dependencies: [
            'brighterscript',
            'roku-deploy'
        ]
    }, {
        name: 'roku-report-analyzer',
        dependencies: [
            '@rokucommunity/logger',
            'brighterscript'
        ]
    }, {
        name: 'vscode-brightscript-language',
        dependencies: [
            'roku-deploy',
            'roku-debug',
            'brighterscript',
            'brighterscript-formatter'
        ],
        groups: ['vscode']
    }, {
        name: 'roku-promise',
        dependencies: []
    }, {
        name: 'promises',
        npmName: '@rokucommunity/promises',
        dependencies: []
    }].map(project => {
        const repoName = project.name.split('/').pop();
        return {
            ...project,
            dir: s`${this.tempDir}/${repoName}`,
            dependencies: project.dependencies?.map(d => ({
                name: d,
                previousReleaseVersion: undefined as any,
                newVersion: undefined as any
            })) ?? [],
            devDependencies: project.devDependencies?.map(d => ({
                name: d,
                previousReleaseVersion: undefined as any,
                newVersion: undefined as any
            })) ?? [],
            npmName: project.npmName ?? project.name,
            repositoryUrl: (project as any).repositoryUrl ?? `https://github.com/rokucommunity/${repoName}`,
            changes: []
        };
    });
}


interface Project {
    name: string;
    /**
     * The name of the package on npm. Defaults to `project.name`
     */
    npmName: string;
    repositoryUrl: string;
    /**
     * The directory where this project is cloned.
     */
    dir: string;
    dependencies: Array<{
        name: string;
        previousReleaseVersion: string;
        newVersion: string;
    }>;
    devDependencies: Array<{
        name: string;
        previousReleaseVersion: string;
        newVersion: string;
    }>;
    groups?: string[];
    /**
     * A list of changes to be included in the changelog. If non-empty, this indicates the package needs a new release
     */
    changes: Commit[];
}

interface Commit {
    hash: string;
    branchInfo: string;
    message: string;
    prNumber: string;
}

let options = yargs
    .usage('$0', 'BrighterScript, a superset of Roku\'s BrightScript language')
    .help('help', 'View help information about this tool.')
    .option('groups', { type: 'array', description: 'What project groups should be run. Defaults to every registered project', default: [] })
    .option('projects', { alias: 'project', type: 'array', description: 'What projects should be run. Defaults to every registered project', default: [] })
    .option('force', { type: 'boolean', description: 'Should releases be forced, even if there were no changes?', default: false })
    .option('test', { type: 'boolean', description: 'Tests a release but does not actually publish the release.', default: false })
    .argv;

let builder = new Runner();
builder.run(<any>options).catch((error) => {
    console.error(error);
    process.exit(1);
});
