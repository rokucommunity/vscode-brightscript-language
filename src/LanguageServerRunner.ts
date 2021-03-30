//this runs in a separate process without the vscode module support
const pathToBrighterScript = process.argv[2];
// tslint:disable-next-line
const LanguageServer = require(pathToBrighterScript).LanguageServer;
const server = new LanguageServer();
server.run();
