/**
 * Installs a local version of all the rokucommunity dependent packages into this project
 */

import * as path from 'path';
import * as childProcess from 'child_process';
import * as fsExtra from 'fs-extra';
import * as chalk from 'chalk';
//path to the parent folder where all of the rokucommunity projects reside (i.e. 1 level above vscode-brightscript-language
const cwd = path.normalize(`${__dirname}/../../`);

const pull = process.argv.includes('--pull');
const enableVerboseLogging = process.argv.includes('--verbose');

class InstallLocalRunner {

    public run() {
        for (const project of this.projects) {
            this.installProject(project.name);
        }
        console.log('Done!');
    }

    private projects: Project[] = [
        {
            name: 'roku-deploy',
            dependencies: []
        },
        {
            name: 'brighterscript',
            dependencies: [
                'roku-deploy'
            ]
        },
        {
            name: 'brighterscript-formatter',
            dependencies: [
                'brighterscript'
            ]
        },
        {
            name: 'roku-debug',
            dependencies: [
                'roku-deploy',
                'brighterscript'
            ]
        },
        {
            name: 'vscode-brightscript-language',
            dependencies: [
                'roku-deploy',
                'brighterscript',
                'roku-debug',
                'brighterscript-formatter'
            ]
        }
    ];

    private getProject(name: string) {
        return this.projects.find(x => x.name === name)!;
    }

    private installProject(projectName: string) {
        const project = this.getProject(projectName);

        function log(...args: any[]) {
            let projectName = `${chalk.blue(project.name)}:`;
            if (args[0] === '\n') {
                projectName = args.shift() + projectName;
            }
            console.log(projectName, ...args);
        }

        if (project.processed) {
            log('already processed...skipping');
            return;
        }

        this.printHeader(project.name);
        let projectDir = `${cwd}/${project.name}`;

        //if the project doesn't exist, clone it from github
        if (!fsExtra.pathExistsSync(projectDir)) {
            this.execSync(`git clone https://github.com/rokucommunity/${project.name}`);

            //if --pull was provided, fetch and pull latest for each repo
        } else if (pull === true) {
            log(`project directory exists so fetching latest from github`);

            this.execSync(`git fetch && git pull`, { cwd: projectDir });
        }

        //install all npm dependencies
        log(`installing npm packages`);
        try {
            this.execSync(`npm install`, { cwd: projectDir });
        } catch (e) {
            console.error(e);
        }

        //ensure all dependencies are installed
        for (const dependency of project.dependencies) {
            log('\n', `installing dependency ${chalk.blue(dependency)}`);
            this.installProject(dependency);

            log(`deleting ${chalk.green(`./node_modules/${dependency}`)} to prevent contention`);
            try {
                fsExtra.removeSync(`node_modules/${project.name}`);
            } catch (e) {
                console.error(e);
            }
            log(`linking ${chalk.green(`../${dependency}`)} to ${chalk.green(`./node_modules/${dependency}`)}`);
            //install local version of the dependency into this project
            this.execSync(`npm install file:../${dependency}`, { cwd: projectDir });
        }

        log('\n', `building`);
        //build the project
        try {
            this.execSync(`npm run build`, { cwd: projectDir });
        } catch (e) {
            console.error(e);
        }

        project.processed = true;
    }

    private printHeader(name) {
        const length = 80;
        let text = '\n';

        text += ''.padStart(length, '-') + '\n';

        let leftLen = Math.round((length / 2) - (name.length / 2));
        let rightLen = 80 - (name.length + leftLen);
        text += ''.padStart(leftLen, '-') + chalk.white(name) + ''.padStart(rightLen, '-') + '\n';

        text += ''.padStart(length, '-') + '\n';

        console.log(chalk.blue(text));
    }

    private execSync(command: string, options?: childProcess.ExecSyncOptions) {
        options = {
            cwd: cwd,
            stdio: enableVerboseLogging ? 'inherit' : 'ignore',
            ...options ?? {}
        };
        if (enableVerboseLogging) {
            console.log(command, options);
        }
        try {
            return childProcess.execSync(command, options);
        } catch (e) {
            console.error(e);
        }
    }
}

interface Project {
    name: string;
    dependencies: string[];
    processed?: boolean;
}

new InstallLocalRunner().run();
