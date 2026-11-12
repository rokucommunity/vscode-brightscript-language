import { expect } from 'chai';
import * as fsExtra from 'fs-extra';
import * as JSZip from 'jszip';
import * as path from 'path';
import { ComponentLibraryServer } from 'roku-debug';
import * as sinonImport from 'sinon';
import { vscode } from '../mockVscode.spec';
import { RokuCommandsViewProvider } from './RokuCommandsViewProvider';
import { VscodeCommand } from '../commands/VscodeCommand';
import { ViewProviderCommand } from './ViewProviderCommand';
import { ViewProviderEvent } from './ViewProviderEvent';

let Module = require('module');
const { require: oldRequire } = Module.prototype;
Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

const CONTAINER_ID_KEYPATH = 'memoryPressure.id';
const LIBRARY_URI_KEYPATH = 'memoryPressure.#memoryPressureLibrary.uri';
const READY_KEYPATH = 'memoryPressure.#memoryPressureTask.ready';
const TARGET_KEYPATH = 'memoryPressure.#memoryPressureTask.targetMegabytes';
const APPLIED_KEYPATH = 'memoryPressure.#memoryPressureTask.appliedMegabytes';
const ERROR_KEYPATH = 'memoryPressure.#memoryPressureTask.error';

let sinon: sinonImport.SinonSandbox;
let view;
let callback;
let provider: RokuCommandsViewProvider;
beforeEach(() => {
    sinon = sinonImport.createSandbox();
    view = {
        webview: {
            onDidReceiveMessage: (cb) => {
                callback = cb;
            },
            postMessage: (message) => { }
        },
        show: () => { }
    };

    provider = new RokuCommandsViewProvider(vscode.context, {}) as any;
});
afterEach(() => {
    provider['componentLibraryServer']?.stop();
    provider.dispose();
    sinon.restore();
});

/**
 * Creates a fake on-device component backed by an in-memory map of global keypaths.
 * By default, setting the target simulates the task reaching it right away.
 */
function createOdc(values: Record<string, any> = {}, options: { onTarget?: (value: number, notify: (value: any) => void) => void } = {}) {
    let observers: Array<(response) => void> = [];
    const notify = (value) => {
        values[APPLIED_KEYPATH] = value;
        for (const observer of [...observers]) {
            observer({ value: value });
        }
    };
    const onTarget = options.onTarget ?? ((value: number) => notify(value));
    const odc = {
        observers: () => observers,
        getValue: sinon.stub().callsFake(({ keyPath }) => {
            return Promise.resolve(keyPath in values ? { found: true, value: values[keyPath] } : { found: false });
        }),
        setValue: sinon.stub().callsFake(({ keyPath, field, value }) => {
            values[keyPath || field] = value;
            if (keyPath === TARGET_KEYPATH) {
                onTarget(value, notify);
            }
            return Promise.resolve({});
        }),
        createChild: sinon.stub().callsFake(({ fields }) => {
            if (fields.id === 'memoryPressureTask') {
                values[READY_KEYPATH] = true;
            }
            return Promise.resolve({});
        }),
        getClientHost: sinon.stub().resolves({ host: '192.168.1.2' }),
        onFieldChangeOnce: sinon.stub().resolves({}),
        onFieldChange: sinon.stub().callsFake((args, opts, observer) => {
            observers.push(observer);
            return Promise.resolve(() => {
                observers = observers.filter(x => x !== observer);
                return Promise.resolve();
            });
        })
    };
    provider['dependencies'] = {
        rtaManager: {
            onDeviceComponent: odc
        }
    } as any;
    return odc;
}

/**
 * Makes every setTimeout fire on the next tick so timeout paths run without waiting
 */
function skipTimerDelays() {
    const originalSetTimeout = global.setTimeout;
    sinon.stub(global, 'setTimeout').callsFake(((fn: () => void) => originalSetTimeout(fn, 0)) as any);
}

describe('RokuCommandsViewProvider', () => {
    describe('getHtmlForWebview', () => {
        it('includes the contents of additionalScriptContents', async () => {
            const html = await provider['getHtmlForWebview']();
            for (const line of provider['additionalScriptContents']()) {
                expect(html).to.contain(line);
            }
        });
    });

    describe('resolveWebviewView', () => {
        it('sets up observer to handle messages from the ui', async () => {
            await provider['resolveWebviewView'](view, {} as any, {} as any);

            expect(typeof callback).to.equal('function');
            const fake = sinonImport.fake.returns(Promise.resolve(true));
            provider['addMessageCommandCallback'](VscodeCommand.rokuRegistryImportRegistry, fake);
            callback({
                command: VscodeCommand.rokuRegistryImportRegistry,
                context: {}
            });
            expect(fake.calledOnce).to.be.true;
        });

        it('sets the view title', async () => {
            await provider['resolveWebviewView'](view, {} as any, {} as any);
            expect(view.title).to.equal('RTA Tools');
        });
    });

    describe('message callbacks', () => {
        it('getMemoryPressure responds with the applied megabytes', async () => {
            createOdc({ [APPLIED_KEYPATH]: 12 });
            const post = sinon.stub(provider, 'postOrQueueMessage');
            const handled = await provider['messageCommandCallbacks'][ViewProviderCommand.getMemoryPressure]({ command: ViewProviderCommand.getMemoryPressure });
            expect(handled).to.be.true;
            expect(post.firstCall.args[0].response).to.eql({ appliedMegabytes: 12 });
        });

        it('getMemoryPressure responds with 0 when the task does not exist', async () => {
            createOdc();
            const post = sinon.stub(provider, 'postOrQueueMessage');
            await provider['messageCommandCallbacks'][ViewProviderCommand.getMemoryPressure]({ command: ViewProviderCommand.getMemoryPressure });
            expect(post.firstCall.args[0].response).to.eql({ appliedMegabytes: 0 });
        });

        it('applyMemoryPressure responds with the result', async () => {
            createOdc({ [APPLIED_KEYPATH]: 5 });
            const post = sinon.stub(provider, 'postOrQueueMessage');
            const handled = await provider['messageCommandCallbacks'][ViewProviderCommand.applyMemoryPressure]({
                command: ViewProviderCommand.applyMemoryPressure,
                context: { megabytes: 5 }
            });
            expect(handled).to.be.true;
            expect(post.firstCall.args[0].response).to.eql({ appliedMegabytes: 5 });
        });
    });

    describe('applyMemoryPressure', () => {
        it('throws when the on-device component is not available', async () => {
            provider['dependencies'] = { rtaManager: {} } as any;
            let error: Error;
            try {
                await provider.applyMemoryPressure(10);
            } catch (e) {
                error = e;
            }
            expect(error?.message).to.equal('On-device component is not available');
        });

        it('does not create the task when clearing pressure that was never applied', async () => {
            const odc = createOdc();
            const ensure = sinon.stub(provider as any, 'ensureMemoryPressureNode');
            expect(await provider.applyMemoryPressure(0)).to.eql({ appliedMegabytes: 0 });
            expect(ensure.called).to.be.false;
            expect(odc.setValue.called).to.be.false;
        });

        it('does nothing when already at the target', async () => {
            const odc = createOdc({ [APPLIED_KEYPATH]: 20 });
            expect(await provider.applyMemoryPressure(20)).to.eql({ appliedMegabytes: 20 });
            expect(odc.onFieldChange.called).to.be.false;
            expect(odc.setValue.called).to.be.false;
        });

        it('creates the task, hosts the component library, and applies the target', async () => {
            const startHosting = sinon.stub(ComponentLibraryServer.prototype, 'startStaticFileHosting').resolves();
            const odc = createOdc();

            expect(await provider.applyMemoryPressure(30)).to.eql({ appliedMegabytes: 30 });

            expect(startHosting.calledOnce).to.be.true;
            expect(odc.setValue.getCalls().map(x => x.args[0].keyPath || x.args[0].field)).to.eql([
                'memoryPressure',
                LIBRARY_URI_KEYPATH,
                TARGET_KEYPATH
            ]);
            const uri = odc.setValue.getCalls().find(x => x.args[0].keyPath === LIBRARY_URI_KEYPATH).args[0].value as string;
            expect(uri).to.match(/^http:\/\/192\.168\.1\.2:\d+\/memoryPressure\.zip\?i=0&rokuForce=\.zip$/);
            expect(odc.createChild.getCalls().map(x => x.args[0].subtype)).to.eql([
                'ComponentLibrary',
                'vscodeMemoryPressure:MemoryPressure'
            ]);

            const zip = await JSZip.loadAsync(
                fsExtra.readFileSync(path.join(provider['componentLibraryFolder'], provider['componentLibraryFileName']))
            );
            expect(Object.keys(zip.files).sort()).to.eql([
                'components/',
                'components/MemoryPressure.brs',
                'components/MemoryPressure.xml',
                'manifest'
            ]);
            expect(await zip.file('manifest').async('string')).to.contain('sg_component_libs_provided=vscodeMemoryPressure');
        });

        it('only starts the component library server once', async () => {
            const startHosting = sinon.stub(ComponentLibraryServer.prototype, 'startStaticFileHosting').resolves();
            sinon.stub(fsExtra, 'outputFile').resolves();
            await provider['ensureComponentLibraryServer']();
            await provider['ensureComponentLibraryServer']();
            expect(startHosting.calledOnce).to.be.true;
        });

        it('reuses the container node when it already exists', async () => {
            const ensureServer = sinon.stub(provider as any, 'ensureComponentLibraryServer');
            const odc = createOdc({ [CONTAINER_ID_KEYPATH]: 'memoryPressure' });
            expect(await provider.applyMemoryPressure(8)).to.eql({ appliedMegabytes: 8 });
            expect(ensureServer.called).to.be.false;
            expect(odc.createChild.called).to.be.false;
        });

        it('posts progress events until the target is reached, ignoring non-numeric values', async () => {
            createOdc({ [APPLIED_KEYPATH]: 0 }, {
                onTarget: (value, notify) => {
                    notify(undefined);
                    notify(10);
                    notify(value);
                }
            });
            const post = sinon.stub(provider, 'postOrQueueMessage');

            expect(await provider.applyMemoryPressure(20)).to.eql({ appliedMegabytes: 20 });

            expect(post.getCalls().map(x => x.args[0])).to.eql([{
                event: ViewProviderEvent.onMemoryPressureProgress,
                context: { appliedMegabytes: 10, targetMegabytes: 20 }
            }, {
                event: ViewProviderEvent.onMemoryPressureProgress,
                context: { appliedMegabytes: 20, targetMegabytes: 20 }
            }]);
        });

        it('cancels the observer once finished', async () => {
            const odc = createOdc({ [APPLIED_KEYPATH]: 0 });
            await provider.applyMemoryPressure(4);
            expect(odc.observers()).to.be.empty;
        });

        it('logs instead of throwing when cancelling the observer fails', async () => {
            const odc = createOdc({ [APPLIED_KEYPATH]: 0 });
            odc.onFieldChange.callsFake((args, opts, observer) => {
                setTimeout(() => observer({ value: 4 }));
                return Promise.resolve(() => Promise.reject(new Error('socket closed')));
            });
            expect(await provider.applyMemoryPressure(4)).to.eql({ appliedMegabytes: 4 });
        });

        it('resolves an earlier request with its last value when a newer one replaces it', async () => {
            let targets = 0;
            createOdc({ [APPLIED_KEYPATH]: 0 }, {
                onTarget: (value, notify) => {
                    // the first request never reaches its target on its own
                    if (++targets > 1) {
                        notify(value);
                    }
                }
            });

            const first = provider.applyMemoryPressure(50);
            await new Promise((resolve) => {
                setTimeout(resolve, 10);
            });
            const second = provider.applyMemoryPressure(25);

            expect(await first).to.eql({ appliedMegabytes: 0 });
            expect(await second).to.eql({ appliedMegabytes: 25 });
        });

        it('stops without setting the target when replaced before the observer is registered', async () => {
            const odc = createOdc({ [APPLIED_KEYPATH]: 0 });
            odc.onFieldChange.callsFake(() => {
                provider['startOperation']();
                return Promise.resolve(() => Promise.resolve());
            });
            expect(await provider.applyMemoryPressure(10)).to.eql({ appliedMegabytes: 0 });
            expect(odc.setValue.calledWithMatch({ keyPath: TARGET_KEYPATH })).to.be.false;
        });

        it('stops when replaced while creating the task', async () => {
            const odc = createOdc();
            sinon.stub(provider as any, 'ensureMemoryPressureNode').callsFake(() => {
                provider['startOperation']();
                return Promise.resolve();
            });
            expect(await provider.applyMemoryPressure(10)).to.eql({ appliedMegabytes: 0 });
            expect(odc.onFieldChange.called).to.be.false;
        });

        it('returns the error reported by the task', async () => {
            const odc = createOdc({ [APPLIED_KEYPATH]: 3, [ERROR_KEYPATH]: 'out of memory' });
            odc.onFieldChange.rejects(new Error('observer failed'));
            expect(await provider.applyMemoryPressure(500)).to.eql({
                appliedMegabytes: 3,
                error: 'out of memory'
            });
        });

        it('returns the caught error when the task has none and the device stops responding', async () => {
            const odc = createOdc({ [APPLIED_KEYPATH]: 3 });
            odc.onFieldChange.callsFake(() => {
                odc.getValue.rejects(new Error('device offline'));
                return Promise.reject(new Error('observer failed'));
            });
            expect(await provider.applyMemoryPressure(500)).to.eql({
                appliedMegabytes: 3,
                error: 'observer failed'
            });
        });

        it('returns the last value without an error when replaced while failing', async () => {
            const odc = createOdc({ [APPLIED_KEYPATH]: 3 });
            odc.onFieldChange.callsFake(() => {
                provider['startOperation']();
                return Promise.reject(new Error('observer failed'));
            });
            expect(await provider.applyMemoryPressure(500)).to.eql({ appliedMegabytes: 3 });
        });

        it('times out when the task never reaches the target', async () => {
            createOdc({ [APPLIED_KEYPATH]: 0 }, {
                onTarget: () => { }
            });
            skipTimerDelays();
            expect(await provider.applyMemoryPressure(10)).to.eql({
                appliedMegabytes: 0,
                error: 'Memory pressure timed out'
            });
        });

        it('throws when the task never becomes ready', async () => {
            sinon.stub(provider as any, 'ensureComponentLibraryServer').resolves();
            const odc = createOdc();
            odc.createChild.resolves({});
            skipTimerDelays();
            let now = 0;
            sinon.stub(Date, 'now').callsFake(() => {
                now += 4000;
                return now;
            });
            let error: Error;
            try {
                await provider.applyMemoryPressure(10);
            } catch (e) {
                error = e;
            }
            expect(error?.message).to.equal('Memory pressure task did not start');
        });
    });
});
