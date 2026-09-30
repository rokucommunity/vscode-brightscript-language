const path = require('path');
const nodeVersion = +process.versions.node.split('.')[0];

//options whose value is a file pattern rather than a spec to run
const optionsTakingFilePattern = ['--exclude', '--ignore', '--file'];
const specFilePassedOnCommandLine = process.argv.some((arg, index) => {
    const previousArg = process.argv[index - 1];
    return arg.endsWith('.spec.ts') &&
        !optionsTakingFilePattern.includes(previousArg) &&
        !optionsTakingFilePattern.some(option => arg.startsWith(`${option}=`));
});

const config = {
    //mocha appends CLI spec files to these globs, so only use them when no spec file was requested
    spec: specFilePassedOnCommandLine ? [] : [
        'src/**/*.spec.ts',
        'webviews/src/**/*.spec.ts'
    ],
    require: [
        'source-map-support/register',
        'ts-node/register',
        path.join(__dirname, 'src', 'mockVscode.spec.ts')
    ],
    bail: false,
    fullTrace: true,
    watchExtensions: ['ts']
};
if (nodeVersion >= 22) {
    config['node-option'] = ['no-experimental-strip-types'];
}
module.exports = config;
