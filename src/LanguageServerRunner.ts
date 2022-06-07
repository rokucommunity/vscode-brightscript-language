//this runs in a separate process without the vscode module support
const pathToBrighterScript = process.argv[2];
const isDevMode = process.argv[3] === 'true';

//when running in dev mode, the language server sometimes runs faster than the debugger can pick up. So run a loop for a bit to let us catch up
if (isDevMode) {
    const delay = 1500;
    const start = Date.now();
    while (Date.now() < start + delay) {
        //do nothing
    }
}

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const LanguageServer = require(pathToBrighterScript).LanguageServer;
const server = new LanguageServer();
server.run();
