/**
 * Installs a local version of all the rokucommunity dependent packages into this project
 */

var fsExtra = require('fs-extra');
var path = require('path');
var childProcess = require('child_process');
var chalk = require('chalk');

var argv = require('yargs').argv;

let packages = [
    'roku-debug',
    'roku-deploy',
    'brighterscript',
    'brighterscript-formatter'
];

//set the cwd to the root of this project
let thisProjectRootPath = path.join(__dirname, '..');
process.chdir(thisProjectRootPath);
let packageJson = JSON.parse(fsExtra.readFileSync('package.json').toString());

for (let packageName of packages) {
    printHeader(packageName);
    let packageSrcPath = path.resolve(path.join('..', packageName));

    //if the project doesn't exist, clone it from github
    if (!fsExtra.pathExistsSync(packageSrcPath)) {
        console.log(`Cloning '${packageName}' from github`);
        //clone the project
        childProcess.execSync(`git clone https://github.com/rokucommunity/${packageName}`, {
            cwd: path.resolve('..'),
            stdio: 'inherit'
        });
        //if --pull was provided, fetch and pull latest for each repo
    } else if (argv.pull === true) {
        console.log(`'${packageName}' exists. Getting latest`);

        childProcess.execSync(`git fetch && git pull`, {
            cwd: packageSrcPath,
            stdio: 'inherit'
        });
    }

    //install all npm dependencies 
    console.log(`Installing npm packages for '${packageName}'`);
    try {
        childProcess.execSync(`npm install`, {
            cwd: path.resolve('..', packageName),
            stdio: 'inherit'
        });
    } catch (e) {
        console.error(e);
    }

    console.log(`bulding '${packageName}'`);
    //build the project
    try {
        childProcess.execSync(`npm run build`, {
            cwd: path.resolve('..', packageName),
            stdio: 'inherit'
        });
    } catch (e) {
        console.error(e);
    }

    console.log(`deleting '${packageName}' from node_modules to prevent contention`);
    try {
        fsExtra.ensureDirSync(`node_modules/${packageName}`);
        fsExtra.removeSync(`node_modules/${packageName}`);
    } catch (e) {
        console.error(e);
    }

    console.log(`adding '../${packageName}' to package.json`);
    packageJson.dependencies[packageName] = `file:../${packageName}`;
}

printHeader('vscode-brightscript-language');
console.log('saving package.json changes');
fsExtra.writeFileSync('package.json', JSON.stringify(packageJson, null, 4));
console.log('npm install');
childProcess.execSync('npm install', {
    stdio: 'inherit'
});



function printHeader(name) {
    var length = 80;
    let text = '\n';

    text += ''.padStart(length, '-') + '\n';

    let leftLen = Math.round((length / 2) - (name.length / 2));
    let rightLen = 80 - (name.length + leftLen);
    text += ''.padStart(leftLen, '-') + chalk.white(name) + ''.padStart(rightLen, '-') + '\n';

    text += ''.padStart(length, '-') + '\n';

    console.log(chalk.blue(text));
}