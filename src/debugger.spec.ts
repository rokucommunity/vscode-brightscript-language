import * as  assert from 'assert';
import * as sinon from 'sinon';
import * as path from 'path';
import { BrightScriptDebugSession } from './debugger';
describe('Debugger', () => {
	let session: BrightScriptDebugSession;
	let rokuAdapter = {
		on: () => { return () => { }; },
		activate: () => { return Promise.resolve(); }
	};
	beforeEach(() => {
		session = new BrightScriptDebugSession();
		//mock the rokuDeploy module with promises so we can have predictable tests
		session.rokuDeploy = {
			prepublishToStaging: () => { return Promise.resolve() },
			zipPackage: () => { return Promise.resolve() },
			pressHomeButton: () => { return Promise.resolve() },
			publish: () => { return Promise.resolve() },
		};
		//mock the roku adapter
		(session as any).connectRokuAdapter = () => { return Promise.resolve(rokuAdapter); };
	});

	describe('initializeRequest', () => {
		it('does not throw', () => {
			assert.doesNotThrow(() => {
				session.initializeRequest(<any>{}, <any>{});
			});
		});
	});
	it('baseProjectPath works', async () => {
		sinon.stub(session, 'sendEvent').callsFake((...args) => {
			//do nothing
		});

		await session.launchRequest(<any>{}, <any>{
			rootDir: '1/2/3'
		});
		assert.equal(path.normalize(session.baseProjectPath), path.normalize('1/2/3'));
	});
});