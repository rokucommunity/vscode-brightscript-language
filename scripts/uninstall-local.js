var fs = require('fs');
var childProcess = require('child_process');

let packages = [
    'roku-debug',
    'roku-deploy',
    'brighterscript',
    'brighterscript-formatter'
];

console.log('Loading original package.json from git');
var currentPackageJson = JSON.parse(
    fs.readFileSync('package.json').toString()
);
var originalPackageJson = JSON.parse(
    childProcess.execSync('git --no-pager show HEAD:package.json')
);

for (let packageName of packages) {
    console.log(`\n--------${packageName}--------`);
    console.log(`Deleting 'node_modules/${packageName}'`);

    console.log('Restoring package.json dependency version');
    currentPackageJson.dependencies[packageName] = originalPackageJson.dependencies[packageName];
}

console.log(`\n--------vscode-brightscript-langauge--------`);
console.log('Saving package.json');
fs.writeFileSync('package.json', JSON.stringify(currentPackageJson, null, 4));
console.log('npm install');
childProcess.execSync('npm install', {
    stdio: 'inherit'
});