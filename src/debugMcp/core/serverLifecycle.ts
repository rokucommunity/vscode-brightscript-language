/** What to do with the server when the effective `enabled` setting may have changed. */
export function decideServerAction(wasEnabled: boolean, isEnabled: boolean): 'start' | 'stop' | 'none' {
    if (wasEnabled === isEnabled) {
        return 'none';
    }
    return isEnabled ? 'start' : 'stop';
}

/**
 * Holds the running server across asynchronous starts. A start that is still pending when
 * `stop()` or a newer `start()` runs has its server disposed instead of assigned, and starts run
 * one at a time so a superseded server is gone before its replacement binds the same endpoint.
 */
export class ServerHolder<T extends Disposable> {
    public current: T | undefined;

    private generation = 0;
    private inFlight: Promise<void> = Promise.resolve();

    public start(createStartedServer: () => Promise<T>): Promise<void> {
        const generation = ++this.generation;
        const previous = this.inFlight;
        const run = (async () => {
            await previous.catch(() => { });
            if (generation !== this.generation) {
                return;
            }
            this.current?.dispose();
            this.current = undefined;
            const server = await createStartedServer();
            if (generation !== this.generation) {
                server.dispose();
                return;
            }
            this.current = server;
        })();
        this.inFlight = run;
        return run;
    }

    public stop(): void {
        this.generation++;
        this.current?.dispose();
        this.current = undefined;
    }
}

export interface Disposable {
    dispose(): void;
}
