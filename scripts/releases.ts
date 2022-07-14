import * as yargs from 'yargs';
import * as fsExtra from 'fs-extra';
import { standardizePath as s } from 'brighterscript';
import { execSync, exec } from 'child_process';
import * as chalk from 'chalk';
import * as semver from 'semver';

interface Project {
    name: string;
    repositoryUrl?: string;
    /**
     * The directory where this project is cloned. Set during the clone process if not specified
     */
    dir?: string;
    dependencies?: string[];
    devDependencies?: string[];
    groups?: string[];
}

class Runner {
    private tempDir = s`${__dirname}/../.tmp/.releases`;
    public run(options: { groups: string[] }) {
        console.log('Creating tempDir', this.tempDir);
        fsExtra.ensureDirSync(this.tempDir);

        options.groups ??= [];

        const projects = this.projects.filter(x => options.groups.length === 0 || x?.groups?.find(g => options.groups.includes(g)));
        //clone all projects
        console.log('Cloning projects');
        for (const project of projects) {
            this.cloneProject(project);
        }

        for (const project of projects) {
            console.log('');
            this.processProject(project);
        }
    }

    private processProject(project: Project) {
        const lastTag = this.getLastTag(project.dir!);
        this.log(project, `Last release was ${lastTag}`);
        const logs = this.getCommitLogs(project.name, lastTag);
    }

    /**
     * Get the project with the specified name
     */
    private getProject(projectName: string) {
        return this.projects.find(x => x.name === projectName);
    }

    private getCommitLogs(projectName: string, sinceVersion: string) {
        const project = this.getProject(projectName);
        const commitMessages = execSync(`git log ${sinceVersion}...HEAD --oneline`, {
            cwd: project?.dir
        }).toString()
            .split(/\r?\n/g)
            .map(x => x);
        console.log(commitMessages);
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
        ).reverse();
        //return the first non-prerelease version
        return allTags.find(x => !semver.prerelease(x))!;
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
        // console.log(`Cloning ${url}`);
        // fsExtra.removeSync(project.dir);
        // execSync(`git clone "${url}" "${project.dir}"`);
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
        dependencies: [],
        devDependencies: [
            'brighterscript'
        ]
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
    }];
}

let options = yargs
    .usage('$0', 'BrighterScript, a superset of Roku\'s BrightScript language')
    .help('help', 'View help information about this tool.')
    .option('groups', { type: 'array', description: 'What project groups should be run. Defaults to every registered project', default: [] })
    .argv;

let builder = new Runner();
builder.run(<any>options);
// .catch((error) => {
//     console.error(error);
//     process.exit(1);
// });

