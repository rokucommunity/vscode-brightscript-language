//this runs in a separate process without the vscode module support
import { LanguageServer } from 'brighterscript';
let server = new LanguageServer();
server.run();
