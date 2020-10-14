
var fs = require('fs');
var changelogParser = require('changelog-parser');

/**
 * Perform various checks that should block a release until resolved
 */
class PreversionValidator {
    async run() {
        this.errors = [];
        this.checkLocalPackages();
        await this.checkChangelog();

        if (this.errors.length > 0) {
            this.errors.map(x => console.log(x));
            process.exit(-1);
        }
    }

    checkLocalPackages() {
        var packageJson = JSON.parse(fs.readFileSync('package.json').toString());
        for (let name in packageJson.dependencies) {
            let version = packageJson.dependencies[name];
            if (version.startsWith('file:')) {
                this.errors.push(`package.json dependency '${name}' references local package '${version}'`);
            }
        }
        for (let name in packageJson.devDependencies) {
            let version = packageJson.devDependencies[name];
            if (version.startsWith('file:')) {
                this.errors.push(`package.json devDependency '${name}' references local package '${version}'`);
            }
        }
    }

    async checkChangelog() {
        var links = {};
        var changelog = fs.readFileSync('CHANGELOG.md').toString();
        var lines = changelog.split(/\r?\n/g);
        //walk backwards in the file until we find the first non-link line
        for (var i = lines.length - 1; i >= 0; i--) {
            //skip empty lines
            if (!lines[i].trim()) {
                continue;
            }
            var match = /^\[(.*)\]\:\s*(.*)$/.exec(lines[i]);
            if (match) {
                links[match[1]] = match[2];
            } else {
                break;
            }
        }

        var parsedChangelog = await changelogParser('CHANGELOG.md');
        for (var version of parsedChangelog.versions) {
            if (version.title.startsWith('[') === false) {
                this.errors.push(`Changelog version in header is not a link: '${version.title}'`);
                continue;
            }
            //ensure the title has a version number link
            var match = /^\[(\d+\.\d+\.\d+.*)\]/.exec(version.title)
            if (!match) {
                this.errors.push(`Changlog contains invalid version number in header '${version.title}'`);
            }
            var versionNumber = match ? match[1] : undefined;
            if (!links[versionNumber]) {
                this.errors.push(`Changelog is missing link for version '${versionNumber}'`);
            }

            //header must end with date
            if (/\d\d\d\d\-\d\d\-\d\d$/gi.test(version.title) === false) {
                this.errors.push(`Changelog is missing date in header '${version.title}'`);
            }

        }
    }
}

new PreversionValidator().run();
