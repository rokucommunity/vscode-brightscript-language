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
var replaceInFile = require('replace-in-file');

var extensionPackageJson = JSON.parse(
    fs.readFileSync('package.json').toString()
);

var brighterscriptFolderPath = path.resolve('../', 'brighterscript');
var brighterscriptPackageJsonPath = path.join(brighterscriptFolderPath, 'package.json');
var rokuDeployFolderPath = path.resolve('../', 'roku-deploy');
var rokuDeployPackageJsonPath = path.join(rokuDeployFolderPath, 'package.json');

var rokuDeployPackagePath, brighterscriptPackagePath;


var backups = {
    vscodeBrightscriptLanguagePackageJson: fs.existsSync('package.json') ? fs.readFileSync('package.json').toString() : undefined,
    brighterscriptPackageJson: fs.exists(brighterscriptPackageJsonPath) ? fs.readFileSync(brighterscriptPackageJsonPath).toString() : undefined,
    rokuDeployPackageJson: fs.exists(rokuDeployPackageJsonPath) ? fs.readFileSync(rokuDeployPackageJsonPath).toString() : undefined
}
try {

    var usesLocalBrighterscript = extensionPackageJson.dependencies['brighterscript'].indexOf('file:') === 0;

    //if the extension relies on a local version of brighterscript
    if (usesLocalBrighterscript) {
        var brighterscriptPackageJson = JSON.parse(
            fs.readFileSync(brighterscriptPackageJsonPath).toString()
        );
        var usesLocalRokuDeploy = brighterscriptPackageJson.dependencies['roku-deploy'].indexOf('file:') === 0;

        //if brighterscript depends on a local version of roku-deploy
        if (usesLocalRokuDeploy) {
            var rokuDeployPackageJson = JSON.parse(
                fs.readFileSync(rokuDeployPackageJsonPath).toString()
            );

            var rokuDeployPackagePath = path.join(rokuDeployFolderPath, `roku-deploy-${rokuDeployPackageJson.version}.tgz`);
            rokuDeployPackagePath = rokuDeployPackagePath.replace(/[\/\\]+/gi, '/');
            console.log('building and packing roku-deploy');
            //build the roku-deploy tgz
            console.log(
                childProcess.execSync('npm install && npm run build && npm pack', {
                    cwd: rokuDeployFolderPath
                }).toString()
            );

            console.log('installing roku-deploy into brighterscript');
            replaceInFile.sync({
                files: brighterscriptPackageJsonPath,
                from: /"roku-deploy"\s*:\s*".*?"/g,
                to: `"roku-deploy": "file:${rokuDeployPackagePath}"`
            });
        }

        var brighterscriptPackagePath = path.join(brighterscriptFolderPath, `brighterscript-${brighterscriptPackageJson.version}.tgz`);

        console.log('building and packing brighterscript');
        console.log(
            childProcess.execSync('npm install && npm run build && npm pack', {
                cwd: brighterscriptFolderPath
            }).toString()
        );

        console.log('installing brighterscript into extension');
        //install the brighterscript package in the extension
        console.log(
            childProcess.execSync(`npm install "${brighterscriptPackagePath}"`).toString()
        );
    }

    console.log('packing the extension');
    console.log(
        childProcess.execSync(`npm install && npm run build && npm run package`).toString()
    );

} finally {
    console.log('cleaning up');
    if (backups.vscodeBrightscriptLanguagePackageJson) {
        fs.writeFileSync(brighterscriptPackageJsonPath, backups.vscodeBrightscriptLanguagePackageJson);
    }

    if (backups.brighterscriptPackageJson) {
        fs.writeFileSync(brighterscriptPackageJsonPath, backups.brighterscriptPackageJson);
    }

    if (backups.rokuDeployPackageJson) {
        fs.writeFileSync(rokuDeployPackageJsonPath, backups.rokuDeployPackageJson);
    }

    //clean up
    if (brighterscriptPackagePath && fs.existsSync(brighterscriptPackagePath)) {
        fs.removeSync(brighterscriptPackagePath);
    }
    if (rokuDeployPackagePath && fs.existsSync(rokuDeployPackagePath)) {
        fs.removeSync(rokuDeployPackagePath);
    }
}