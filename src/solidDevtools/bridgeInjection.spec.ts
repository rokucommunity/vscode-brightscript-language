import { expect } from 'chai';
import * as fsExtra from 'fs-extra';
import { standardizePath as s } from 'brighterscript';

import { buildConnectStatement, injectDevtoolsBridge } from './bridgeInjection';

const tempDir = s`${__dirname}/../../.tmp/solidDevtools`;
const stagingDir = s`${tempDir}/stagingDir`;

describe('bridgeInjection', () => {
    beforeEach(() => {
        fsExtra.emptyDirSync(tempDir);
    });
    after(() => {
        fsExtra.removeSync(tempDir);
    });

    const bridgePath = s`${tempDir}/bridge.js`;
    const bundlePath = s`${stagingDir}/source/compiled/index.js`;
    const mapPath = `${bundlePath}.map`;

    //a 3-line bridge (incl. trailing newline) carrying the __sdtBridge sentinel
    const bridgeCode = '(() => {\n    globalThis.__SDT = { __sdtBridge: true, __connect: () => "ok" };\n})();\n';

    //mimics the real bundle: DevHooks2 (store, must NOT match) appears alongside DevHooks
    const devHooksLine = 'var DevHooks={afterUpdate:null,afterCreateOwner:null,afterCreateSignal:null,afterRegisterGraph:null};var DevHooks2={onStoreNodeUpdate:null};';
    const bundleCode = `(function(){\nvar Updates=null;${devHooksLine}var after=1;\nfunction getOwner(){}\n})();\n//# sourceMappingURL=index.js.map`;

    function writeStagedApp(options?: { manifest?: string; bundle?: string; map?: any }) {
        fsExtra.outputFileSync(s`${stagingDir}/manifest`, options?.manifest ?? 'title=Test\nts_path=pkg:/source/compiled/index.js\n');
        fsExtra.outputFileSync(bundlePath, options?.bundle ?? bundleCode);
        fsExtra.outputJsonSync(mapPath, options?.map ?? { version: 3, sources: ['../src/index.ts'], mappings: ';AAAA,GAAM' });
        fsExtra.outputFileSync(bridgePath, bridgeCode);
    }

    function inject(overrides?: Partial<Parameters<typeof injectDevtoolsBridge>[0]>) {
        return injectDevtoolsBridge({
            stagingDir: stagingDir,
            devtoolsBridgePath: bridgePath,
            log: () => { },
            ...overrides ?? {}
        });
    }

    it('skips when the bridge file is missing', async () => {
        writeStagedApp();
        const result = await inject({ devtoolsBridgePath: s`${tempDir}/nope.js` });
        expect(result.injected).to.be.false;
        expect(result.reason).to.include('devtoolsBridgePath not found');
    });

    it('skips when the manifest has no ts_path', async () => {
        writeStagedApp({ manifest: 'title=Test\n' });
        const result = await inject();
        expect(result.injected).to.be.false;
        expect(result.reason).to.include('no ts_path');
        expect(fsExtra.readFileSync(bundlePath, 'utf8')).to.equal(bundleCode);
    });

    it('skips a precompiled (bytecode) bundle instead of corrupting it', async () => {
        writeStagedApp();
        //Hermes bytecode-ish: binary header with NUL bytes
        fsExtra.writeFileSync(bundlePath, Buffer.from([0xc6, 0x1f, 0xbc, 0x03, 0x00, 0x00, 0x19, 0x1f, 0x00, 0x41]));
        const result = await inject();
        expect(result.injected).to.be.false;
        expect(result.reason).to.include('not JS text');
        //file untouched
        expect(fsExtra.readFileSync(bundlePath).length).to.equal(10);
    });

    it('skips when the staged bundle is missing', async () => {
        writeStagedApp();
        fsExtra.removeSync(bundlePath);
        const result = await inject();
        expect(result.injected).to.be.false;
        expect(result.reason).to.include('bundle not found');
    });

    it('prepends the bridge and inserts the connect call after the DevHooks literal', async () => {
        writeStagedApp();
        const result = await inject();
        expect(result).to.include({ injected: true, connected: true });

        const bundle = fsExtra.readFileSync(bundlePath, 'utf8');
        //bridge is prepended verbatim
        expect(bundle.startsWith(bridgeCode)).to.be.true;
        //connect call sits immediately after the solid DevHooks declaration (NOT DevHooks2's)
        const devHooksDecl = 'var DevHooks={afterUpdate:null,afterCreateOwner:null,afterCreateSignal:null,afterRegisterGraph:null};';
        expect(bundle).to.include(devHooksDecl + buildConnectStatement('DevHooks'));
        //the rest of the line (incl. DevHooks2) is preserved after the insert
        expect(bundle).to.include('var DevHooks2={onStoreNodeUpdate:null};var after=1;');
    });

    it('connects when block-scoping lowering hoists the keyword to a bare assignment', async () => {
        //The SDK's block-scoping transform (for Hermes) hoists `var`/`let`/`const` to the
        //top of the scope and leaves a bare `DevHooks={...}` assignment at the init site —
        //e.g. `...;ExecCount=0;DevHooks={...};`. No declaration keyword, so the old
        //`var\s+DevHooks` anchor missed it and the bridge never connected.
        const loweredLine = 'var DevHooks,DevHooks2;ExecCount=0;DevHooks={afterUpdate:null,afterCreateOwner:null,afterCreateSignal:null,afterRegisterGraph:null};DevHooks2={onStoreNodeUpdate:null};';
        const loweredBundle = `(function(){\nvar Updates=null;${loweredLine}var after=1;\nfunction getOwner(){}\n})();\n//# sourceMappingURL=index.js.map`;
        writeStagedApp({ bundle: loweredBundle });
        const result = await inject();
        expect(result).to.include({ injected: true, connected: true });

        const bundle = fsExtra.readFileSync(bundlePath, 'utf8');
        //connect call sits immediately after the bare DevHooks assignment (NOT the hoisted
        //`var DevHooks,DevHooks2;` decl, and NOT DevHooks2's store-hooks assignment)
        const bareDecl = 'DevHooks={afterUpdate:null,afterCreateOwner:null,afterCreateSignal:null,afterRegisterGraph:null};';
        expect(bundle).to.include(bareDecl + buildConnectStatement('DevHooks'));
        expect(bundle).to.include('DevHooks2={onStoreNodeUpdate:null};var after=1;');
    });

    it('pads the source map mappings with one semicolon per prepended line', async () => {
        writeStagedApp();
        await inject();
        const map = fsExtra.readJsonSync(mapPath);
        //bridgeCode has 3 lines (3 newlines incl. trailing) -> 3 prepended `;` before the original mappings
        expect(map.mappings).to.equal(';;;;AAAA,GAAM');
        expect(map.sources).to.eql(['../src/index.ts']);
    });

    it('keeps line-relative positions intact (connect insert adds no lines)', async () => {
        writeStagedApp();
        await inject();
        const bundle = fsExtra.readFileSync(bundlePath, 'utf8');
        expect(bundle.split('\n').length).to.equal(bridgeCode.split('\n').length - 1 + bundleCode.split('\n').length);
    });

    it('still prepends the bridge (without connect) when the DevHooks marker is missing', async () => {
        const noMarkerBundle = '(function(){var x=1;})();';
        writeStagedApp({ bundle: noMarkerBundle });
        const result = await inject();
        expect(result.injected).to.be.true;
        expect(result.connected).to.be.false;
        expect(result.reason).to.include('DevHooks marker not found');
        const bundle = fsExtra.readFileSync(bundlePath, 'utf8');
        expect(bundle).to.equal(bridgeCode + noMarkerBundle);
    });

    it('does not double-inject', async () => {
        writeStagedApp();
        await inject();
        const once = fsExtra.readFileSync(bundlePath, 'utf8');
        const result = await inject();
        expect(result.injected).to.be.false;
        expect(result.reason).to.include('already contains the bridge');
        expect(fsExtra.readFileSync(bundlePath, 'utf8')).to.equal(once);
    });

    it('survives a missing source map', async () => {
        writeStagedApp();
        fsExtra.removeSync(mapPath);
        const result = await inject();
        expect(result).to.include({ injected: true, connected: true });
    });

    it('builds a fully guarded connect statement', () => {
        const statement = buildConnectStatement('DevHooks3');
        expect(statement).to.include('hooks:DevHooks3');
        expect(statement.startsWith('try{')).to.be.true;
        for (const name of ['getOwner', 'untrack', 'createRoot', 'getListener']) {
            expect(statement).to.include(`${name}:typeof ${name}==='function'?${name}:void 0`);
        }
        expect(statement).to.include('$PROXY:typeof $PROXY==="undefined"?void 0:$PROXY');
        expect(statement).to.include('getExecCount:function(){return typeof ExecCount==="number"?ExecCount:-1}');
        //the statement must be single-line so the same-line insert never shifts the source map
        expect(statement).to.not.include('\n');
    });
});
