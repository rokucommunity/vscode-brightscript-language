import * as  assert from 'assert';
import * as sinon from 'sinon';
import * as path from 'path';
import { BrightScriptDebugSession, defer } from './debugger';
import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';
import { EvaluateContainer, HighLevelType, PrimativeType } from './RokuAdapter';
describe('Debugger', () => {
	let session: BrightScriptDebugSession;
	let rokuAdapter: any = {
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
		(session as any).rokuAdapter = rokuAdapter;
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

	describe('evaluating variable', () => {
		let getVariableValue;
		let responseDeferreds = [];
		let responses = [];

		function getResponse(index: number) {
			let deferred = defer();
			(deferred as any).index = index;
			if (responses[index]) {
				deferred.resolve(responses[index]);
			} else {
				//do nothing, it will get resolved later
			}
			responseDeferreds.push(deferred);
			return deferred.promise;
		}
		function getBooleanEvaluateContainer(expression: string, name: string = null) {
			return <EvaluateContainer>{
				name: name || expression,
				evaluateName: expression,
				type: PrimativeType.boolean,
				value: 'true',
				highLevelType: HighLevelType.primative,
				children: null
			};
		}
		beforeEach(() => {
			sinon.stub(session, 'sendResponse').callsFake((response) => {
				responses.push(response);

				let filteredList = [];

				//notify waiting deferreds
				for (let deferred of responseDeferreds) {
					let index = (deferred as any).index;
					if (responses.length - 1 >= index) {
						deferred.resolve(responses[index]);
					} else {
						filteredList.push(deferred);
					}
				}
			});
			rokuAdapter.getVariable = function () {
				return Promise.resolve(getVariableValue);
			}
		});

		it('returns the correct boolean variable', async () => {
			let expression = 'someBool';
			getVariableValue = getBooleanEvaluateContainer(expression);
			session.evaluateRequest(<any>{}, { context: 'hover', expression });
			let response = <DebugProtocol.EvaluateResponse>await getResponse(0);
			assert.deepEqual(response.body, {
				result: 'true',
				variablesReference: 1,
				namedVariables: 0,
				indexedVariables: 0
			});
		});

		it('returns the correct indexed variables count', async () => {
			let expression = 'someArray';
			getVariableValue = <EvaluateContainer>{
				name: expression,
				evaluateName: expression,
				type: 'roArray',
				value: 'roArray',
				highLevelType: HighLevelType.array,
				//shouldn't actually process the children
				children: [getBooleanEvaluateContainer('someArray[0]', '0'), getBooleanEvaluateContainer('someArray[1]', '1')]
			};
			session.evaluateRequest(<any>{}, { context: 'hover', expression });
			let response = <DebugProtocol.EvaluateResponse>await getResponse(0);
			assert.deepEqual(response.body, {
				result: 'roArray',
				variablesReference: 1,
				namedVariables: 0,
				indexedVariables: 2
			});
		});

		it('returns the correct named variables count', async () => {
			let expression = 'someObject';
			getVariableValue = <EvaluateContainer>{
				name: expression,
				evaluateName: expression,
				type: 'roAssociativeArray',
				value: 'roAssociativeArray',
				highLevelType: HighLevelType.object,
				//shouldn't actually process the children
				children: [getBooleanEvaluateContainer('someObject.isAlive', 'true'), getBooleanEvaluateContainer('someObject.ownsHouse', 'false')]
			};
			session.evaluateRequest(<any>{}, { context: 'hover', expression });
			let response = <DebugProtocol.EvaluateResponse>await getResponse(0);
			assert.deepEqual(response.body, {
				result: 'roAssociativeArray',
				variablesReference: 1,
				namedVariables: 2,
				indexedVariables: 0
			});
		});

		it.only('allows retrieval of children', async () => {
			let expression = 'someObject';
			getVariableValue = <EvaluateContainer>{
				name: expression,
				evaluateName: expression,
				type: 'roAssociativeArray',
				value: 'roAssociativeArray',
				highLevelType: HighLevelType.object,
				//shouldn't actually process the children
				children: [getBooleanEvaluateContainer('someObject.isAlive', 'isAlive'), getBooleanEvaluateContainer('someObject.ownsHouse', 'ownsHouse')]
			};
			session.evaluateRequest(<any>{}, { context: 'hover', expression });
			let response = <DebugProtocol.EvaluateResponse>await getResponse(0);

			//get variables
			session.variablesRequest(<any>{}, { variablesReference: 1 });
			let childVars = <DebugProtocol.VariablesResponse>await getResponse(1);
			assert.deepEqual(childVars.body.variables, [
				{
					name: 'isAlive',
					value: 'true',
					variablesReference: 2,
					evaluateName: 'someObject.isAlive'
				}, {
					name: 'ownsHouse',
					value: 'true',
					variablesReference: 3,
					evaluateName: 'someObject.ownsHouse'
				}
			]);
		});
	});
});