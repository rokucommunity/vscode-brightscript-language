import { expect } from 'chai';
import * as fs from 'fs';
import { builtinModules } from 'module';
import * as path from 'path';

const CORE_DIRECTORY = __dirname;
const ALLOWED_PACKAGES = ['vscode', '@modelcontextprotocol/sdk'];
const ALLOWED_TEST_PACKAGES = ['chai', 'sinon', 'mocha'];
const IMPORT_PATTERNS = [
    /\bimport\s+(?:type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?[^'"]*?\sfrom\s+['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g
];

describe('debugMcp core import boundary', () => {
    it('imports only node built-ins, vscode, the MCP SDK and other core files', () => {
        const violations: string[] = [];
        //this file holds import statements as sample text
        for (const file of listSourceFiles(CORE_DIRECTORY).filter((candidate) => path.basename(candidate) !== path.basename(__filename))) {
            const isSpec = file.endsWith('.spec.ts');
            for (const specifier of findImportSpecifiers(fs.readFileSync(file, 'utf8'))) {
                const reason = findViolation(file, specifier, isSpec);
                if (reason) {
                    violations.push(`${path.relative(CORE_DIRECTORY, file)} imports '${specifier}': ${reason}`);
                }
            }
        }
        expect(violations).to.eql([]);
    });

    it('names no debug type, product or file type of a specific integration, outside the identity defaults', () => {
        const forbidden = /brightscript|roku|hermes|\.brs\b/i;
        const offenders = listSourceFiles(CORE_DIRECTORY)
            .filter((file) => !file.endsWith('.spec.ts') && path.basename(file) !== 'identity.ts')
            .filter((file) => forbidden.test(fs.readFileSync(file, 'utf8')))
            .map((file) => path.relative(CORE_DIRECTORY, file));
        expect(offenders).to.eql([]);
    });

    it('keeps the bridge to node built-ins so it can run on its own', () => {
        const specifiers = findImportSpecifiers(fs.readFileSync(path.join(CORE_DIRECTORY, 'bridge.ts'), 'utf8'));
        expect(specifiers.filter((specifier) => !isNodeBuiltIn(specifier))).to.eql([]);
    });

    it('finds the ways a module can be imported', () => {
        const specifiers = findImportSpecifiers(`
            import * as a from 'one';
            import type { B } from "two";
            import 'three';
            export { c } from 'four';
            const d = require('five');
            const e = await import('six');
        `);
        expect(specifiers).to.have.members(['one', 'two', 'three', 'four', 'five', 'six']);
    });

    it('flags imports of the Roku module, the extension and Roku packages', () => {
        const coreFile = path.join(CORE_DIRECTORY, 'x.ts');
        expect(findViolation(coreFile, '../roku/sendKeys', false)).to.contain('outside the core');
        expect(findViolation(coreFile, '../managers/DebugSessionManager', false)).to.contain('outside the core');
        expect(findViolation(coreFile, 'roku-deploy', false)).to.contain('not allowed');
        expect(findViolation(coreFile, 'roku-debug', false)).to.contain('not allowed');
        expect(findViolation(coreFile, 'sinon', false)).to.contain('not allowed');
        expect(findViolation(coreFile, 'sinon', true)).to.be.undefined;
        expect(findViolation(coreFile, './tools', false)).to.be.undefined;
        expect(findViolation(coreFile, 'fs', false)).to.be.undefined;
        expect(findViolation(coreFile, 'node:path', false)).to.be.undefined;
        expect(findViolation(coreFile, '@modelcontextprotocol/sdk/types.js', false)).to.be.undefined;
        expect(findViolation(coreFile, 'vscode', false)).to.be.undefined;
    });
});

function listSourceFiles(directory: string): string[] {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            return listSourceFiles(fullPath);
        }
        return entry.name.endsWith('.ts') ? [fullPath] : [];
    });
}

function findImportSpecifiers(source: string): string[] {
    const specifiers = new Set<string>();
    for (const pattern of IMPORT_PATTERNS) {
        for (const match of source.matchAll(pattern)) {
            specifiers.add(match[1]);
        }
    }
    return [...specifiers];
}

function isNodeBuiltIn(specifier: string): boolean {
    return specifier.startsWith('node:') || builtinModules.includes(specifier.split('/')[0]) || builtinModules.includes(specifier);
}

/** Why a core file may not import `specifier`, or undefined when it may. */
function findViolation(file: string, specifier: string, isSpec: boolean): string | undefined {
    if (specifier.startsWith('.')) {
        const resolved = path.resolve(path.dirname(file), specifier);
        const relativeToCore = path.relative(CORE_DIRECTORY, resolved);
        return relativeToCore.startsWith('..') || path.isAbsolute(relativeToCore) ? 'outside the core directory' : undefined;
    }
    if (isNodeBuiltIn(specifier)) {
        return undefined;
    }
    const allowed = isSpec ? [...ALLOWED_PACKAGES, ...ALLOWED_TEST_PACKAGES] : ALLOWED_PACKAGES;
    return allowed.some((allowedPackage) => specifier === allowedPackage || specifier.startsWith(`${allowedPackage}/`)) ? undefined : 'package not allowed in the core';
}
