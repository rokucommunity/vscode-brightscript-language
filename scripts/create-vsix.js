const fsExtra = require('fs-extra');
const path = require('path');
const childProcess = require('child_process');
const chalk = require('chalk');

const tmpPath = `${__dirname}/../.vsix-building`;
const baseUrl = 'https://github.com/rokucommunity';
function main() {
    //create a temp directory for this process
    log(`Creating and cleaning ${tmpPath}`);
    fsExtra.emptyDirSync(tmpPath);
    process.chdir(tmpPath);

    //TODO get this from the github actions event
    const branch = process.argv[2];

    //clone the extension repo
    clone(
        'vscode-brightscript-language',
        hasBranch('vscode-brightscript-language', branch) ? branch : 'master'
    );
    const buildVersion = `9001.0.0-${branch.replace(/[^a-zA-Z_0-9]/g, '-')}.${Date.now()}`;

    //bump the version for this build
    changeVersion('vscode-brightscript-language', buildVersion);

    console.log('Installing node_modules for vscode-brightscript-language');
    execSync('npm install', { cwd: 'vscode-brightscript-language' });

    //clone and build all the repositories
    for (const project of ['roku-deploy', 'roku-debug', 'brighterscript', 'brighterscript-formatter']) {
        //only clone projects that have the same brach name as our target
        if (hasBranch(project, branch)) {
            log(`Installing local version of ${project}`);
            
            clone(project, branch);
            changeVersion(project, buildVersion);
            execSync(`npm i && npm run build && npm pack`, {
                cwd: project
            });
            //install this package into the extension
            execSync(`npm i file:/../${project}/${project}-${buildVersion}.tgz`, { cwd: 'vscode-brightscript-language' });
        } else {
            log(`Using ${project} from npm`);
        }
    }

    log('Building and packaging the extension');
    execSync("npm i && npm run build && npm run package", { cwd: 'vscode-brightscript-language' });
}

/**
 * Determine if a repo has a branch with the given name
 */
function hasBranch(project, branch) {
    const output = childProcess.execSync(`git ls-remote --heads ${baseUrl}/${project}`).toString();
    const regexp = new RegExp(`refs/heads/${escapeRegExp(branch)}\\b`);
    return !!regexp.exec(output);
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function clone(project, branch) {
    const url = `${baseUrl}/${project}`;
    log(`Cloning ${url}`);
    execSync(`git clone ${url} ${project}`);
    execSync(`git checkout ${branch}`, {
        cwd: `./${project}`
    });
}

function changeVersion(project, version) {
    const packageJson = fsExtra.readJsonSync(`${project}/package.json`);
    packageJson.version = version;
    fsExtra.writeJsonSync(`${project}/package.json`, packageJson);

    const packageLockJson = fsExtra.readJsonSync(`${project}/package-lock.json`);
    packageLockJson.version = version;
    fsExtra.writeJsonSync(`${project}/package-lock.json`, packageLockJson);
}

function execSync(command, options) {
    options = Object.assign({ stdio: 'inherit' }, options);
    log(command + ' ' + JSON.stringify(options));
    return childProcess.execSync(command, options);
}

function log(message) {
    console.log(`\n${chalk.blueBright(message)}\n`);
}

main();
