/**
 * This script will pack up roku-deploy and brighterscript
 * so we can create a local version of the vsix without needing to publish to npm.
 * 
 * You need to install vscode-brightscript-language, roku-deploy, and brighterscript 
 * all in the same folder for this to work.
 */
var fs = require('fs-extra');
var path = require('path');
var childProcess = require('child_process');
var chalk = require('chalk');

var extensionPackageJsonBackup = fs.readFileSync('package.json').toString();
var extensionPackageJson = JSON.parse(extensionPackageJsonBackup);

//these are in priority order
var projectNames = [
    'roku-deploy',
    'brighterscript',
    'brighterscript-formatter',
    'roku-debug'
];
var projects = {};

try {

    projectNames.forEach((projectName) => {
        printHeader(projectName);
        //create the project and add it to the map
        var project = projects[projectName] = {};
        project.folderPath = path.resolve('..', projectName);
        project.packageJsonPath = path.resolve(project.folderPath, 'package.json');
        project.packageJsonBackup = fs.existsSync(project.packageJsonPath) ? fs.readFileSync(project.packageJsonPath).toString() : undefined;

        if (extensionPackageJson.dependencies['roku-debug'].startsWith('file:') === false) {
            console.log(`Skipping ${projectName} because it's not referenced locally in the extension`);
        }

        var project = projects[projectName];
        console.log(`Reading and parsing ${projectName}/package.json`);
        var package = JSON.parse(
            fs.readFileSync(project.packageJsonPath).toString()
        );

        //install any local dependencies into this project (this depends on the projects being iterated in order above)
        projectNames.forEach((innerProjectName) => {
            if (package.dependencies[innerProjectName] && package.dependencies[innerProjectName].startsWith('file:')) {
                console.log(`Installing local ${innerProjectName} into ${projectName}`);
                package.dependencies[innerProjectName] = `file:../${project.tarballPath}`;
            }
        });
        console.log(`Updating ${projectName}/package.json`);
        fs.writeFileSync(project.packageJsonPath, JSON.stringify(package, null, 4));

        console.log(`installing ${projectName} dependencies`);
        childProcess.execSync('npm install && npm run build && npm pack', {
            cwd: project.folderPath,
            stdio: 'inherit'
        });
        project.tarballPath = path.join(project.folderPath, `${projectName}-${package.version}.tgz`);
        console.log('tarball path', project.tarballPath);
    });

    printHeader('vscode-brightscript-language');

    console.log('Remove extraneous packages');
    childProcess.execSync('npm prune', {
        stdio: 'inherit'
    });

    //install the packages into the extension
    projectNames.forEach(projectName => {
        var project = projects[projectName];
        if (extensionPackageJson.dependencies[projectName].startsWith('file:')) {
            extensionPackageJson.dependencies[projectName] = `file:${project.tarballPath}`
        }
    });
    console.log('Saving vscode-brightscript-language/package.json');
    fs.writeFileSync('package.json', JSON.stringify(extensionPackageJson, null, 4));

    console.log('packing the extension');
    childProcess.execSync(`npm install && npm run build && npm run package`, {
        stdio: 'inherit'
    });

} finally {
    console.log('cleaning up');
    //restore package.json for all affected projects
    Object.keys(projects).forEach((projectName) => {
        var project = projects[projectName];
        console.log(`Restoring ${projectName}/package.json`);
        fs.writeFileSync(project.packageJsonPath, project.packageJsonBackup);
        //delete the tarballs
        try { fs.removeSync(project.tarballPath); } catch (e) { }

        //run install on the packages because `npm prune` will have removed some of them
        console.log(`reinstalling devDependencies for ${projectName}`);
        childProcess.execSync(`npm install`, {
            cwd: project.folderPath,
            stdio: 'inherit'
        });
    });

    console.log('Restoring vscode-brightscript-language/package.json');
    fs.writeFileSync('package.json', extensionPackageJsonBackup);
    console.log(`reinstalling devDependencies for vscode-brightscript-language`);
    childProcess.execSync(`npm install`, {
        stdio: 'inherit'
    });
}

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