import { expect } from 'chai';
import { decideServerAction, ServerHolder } from './serverLifecycle';

function flush(): Promise<void> {
    return new Promise((resolve) => {
        setImmediate(resolve);
    });
}

describe('debugMcp serverLifecycle', () => {
    it('does nothing when the effective value is unchanged', () => {
        expect(decideServerAction(true, true)).to.equal('none');
        expect(decideServerAction(false, false)).to.equal('none');
    });

    it('starts when the setting becomes enabled', () => {
        expect(decideServerAction(false, true)).to.equal('start');
    });

    it('stops when the setting becomes disabled', () => {
        expect(decideServerAction(true, false)).to.equal('stop');
    });

    describe('ServerHolder', () => {
        function createFakeServer() {
            const server = {
                disposed: false,
                dispose: () => {
                    server.disposed = true;
                }
            };
            return server;
        }

        it('assigns a started server', async () => {
            const holder = new ServerHolder<ReturnType<typeof createFakeServer>>();
            const server = createFakeServer();
            await holder.start(() => Promise.resolve(server));
            expect(holder.current).to.equal(server);
        });

        it('disposes a late server when stopped during start', async () => {
            const holder = new ServerHolder<ReturnType<typeof createFakeServer>>();
            const server = createFakeServer();
            let finishStart: () => void;
            const starting = holder.start(() => new Promise((resolve) => {
                finishStart = () => resolve(server);
            }));
            await flush();
            holder.stop();
            finishStart();
            await starting;
            expect(server.disposed).to.be.true;
            expect(holder.current).to.be.undefined;
        });

        it('disposes the superseded server and keeps the newer one on restart', async () => {
            const holder = new ServerHolder<ReturnType<typeof createFakeServer>>();
            const first = createFakeServer();
            const second = createFakeServer();
            let finishFirst: () => void;
            const firstStart = holder.start(() => new Promise((resolve) => {
                finishFirst = () => resolve(first);
            }));
            await flush();
            holder.stop();
            const secondStart = holder.start(() => Promise.resolve(second));
            finishFirst();
            await Promise.all([firstStart, secondStart]);
            expect(first.disposed).to.be.true;
            expect(second.disposed).to.be.false;
            expect(holder.current).to.equal(second);
        });

        it('does not create a server for a start that was already superseded', async () => {
            const holder = new ServerHolder<ReturnType<typeof createFakeServer>>();
            let skippedCreated = false;
            let finishFirst: () => void;
            const blocker = holder.start(() => new Promise((resolve) => {
                finishFirst = () => resolve(createFakeServer());
            }));
            await flush();
            const skipped = holder.start(() => {
                skippedCreated = true;
                return Promise.resolve(createFakeServer());
            });
            const winner = createFakeServer();
            const latest = holder.start(() => Promise.resolve(winner));
            await flush();
            finishFirst();
            await Promise.all([blocker, skipped, latest]);
            expect(skippedCreated).to.be.false;
            expect(holder.current).to.equal(winner);
        });

        it('disposes the previous server before starting its replacement', async () => {
            const holder = new ServerHolder<ReturnType<typeof createFakeServer>>();
            const first = createFakeServer();
            await holder.start(() => Promise.resolve(first));
            let firstDisposedWhenReplacementCreated: boolean;
            const second = createFakeServer();
            await holder.start(() => {
                firstDisposedWhenReplacementCreated = first.disposed;
                return Promise.resolve(second);
            });
            expect(firstDisposedWhenReplacementCreated).to.be.true;
            expect(holder.current).to.equal(second);
        });

        it('disposes the current server on stop', async () => {
            const holder = new ServerHolder<ReturnType<typeof createFakeServer>>();
            const server = createFakeServer();
            await holder.start(() => Promise.resolve(server));
            holder.stop();
            expect(server.disposed).to.be.true;
            expect(holder.current).to.be.undefined;
        });
    });
});
