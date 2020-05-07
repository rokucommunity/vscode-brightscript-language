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

var rokuDebugFolderPath = path.resolve('../', 'roku-debug');
var rokuDebugPackageJsonPath = path.join(rokuDebugFolderPath, 'package.json');

var rokuDeployFolderPath = path.resolve('../', 'roku-deploy');
var rokuDeployPackageJsonPath = path.join(rokuDeployFolderPath, 'package.json');

var brighterscriptPackagePath, rokuDebugPackagePath, rokuDeployPackagePath;


var backups = {
    vscodeBrightscriptLanguagePackageJson: fs.existsSync('package.json') ? fs.readFileSync('package.json').toString() : undefined,
    brighterscriptPackageJson: fs.exists(brighterscriptPackageJsonPath) ? fs.readFileSync(brighterscriptPackageJsonPath).toString() : undefined,
    rokuDebugPackageJson: fs.exists(rokuDebugPackageJsonPath) ? fs.readFileSync(rokuDebugPackageJsonPath).toString() : undefined,
    rokuDeployPackageJson: fs.exists(rokuDeployPackageJsonPath) ? fs.readFileSync(rokuDeployPackageJsonPath).toString() : undefined
}
try {
      //uses local roku-debug
      if (extensionPackageJson.dependencies['roku-debug'].indexOf('file:') === 0) {
        var rokuDebugPackageJson = JSON.parse(
            fs.readFileSync(rokuDebugPackageJsonPath).toString()
        );
        var rokuDebugPackagePath = path.join(rokuDebugFolderPath, `roku-debug-${rokuDebugPackageJson.version}.tgz`);

        console.log('building and packing roku-debug');
        console.log(
            childProcess.execSync('npm install && npm run build && npm pack', {
                cwd: rokuDebugFolderPath
            }).toString()
        );

        console.log('installing roku-debug into the extension');
        //install the roku-debug package in the extension
        console.log(
            childProcess.execSync(`npm install "${rokuDebugPackagePath}"`).toString()
        );
    }


    //uses local BrightScript
    if (extensionPackageJson.dependencies['brighterscript'].indexOf('file:') === 0) {
        var brighterscriptPackageJson = JSON.parse(
            fs.readFileSync(brighterscriptPackageJsonPath).toString()
        );

        //if local brighterscript uses local roku-deploy
        if (brighterscriptPackageJson.dependencies['roku-deploy'].indexOf('file:') === 0) {
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

    if (backups.rokuDebugPackageJson) {
        fs.writeFileSync(rokuDebugPackageJsonPath, backups.rokuDebugPackageJson);
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