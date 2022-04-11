//this runs in a separate process without the vscode module support
const pathToBrighterScript = process.argv[2];
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const LanguageServer = require(pathToBrighterScript).LanguageServer;
const server = new LanguageServer();
server.run();
