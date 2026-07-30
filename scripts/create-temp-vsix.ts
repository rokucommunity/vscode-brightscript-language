/**
 * Re-packages the already-built extension in .vsix-building as a "temporary" variant
 * with a different extension ID, so it can be installed side-by-side with the
 * production extension without replacing it.
 *
 * Must be run AFTER scripts/create-vsix.ts (it reuses that script's build output).
 */
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import * as childProcess from 'child_process';

const projectDir = path.resolve(`${__dirname}/../.vsix-building/vscode-brightscript-language`);
const packageJsonPath = `${projectDir}/package.json`;

const packageJson = fsExtra.readJsonSync(packageJsonPath);
packageJson.name = 'brightscript-temp';
packageJson.displayName = 'BrightScript Language (Temporary)';
packageJson.description = `[TEMPORARY BUILD] ${packageJson.description}`;
fsExtra.writeJsonSync(packageJsonPath, packageJson, { spaces: 4 });

//the extension code was already compiled by create-vsix.ts, so just package it
childProcess.execSync('npm run create-package', { cwd: projectDir, stdio: 'inherit' });
