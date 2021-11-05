import type { ExtensionContext } from "vscode";
import { Extension } from "./extension";

export const extension = new Extension();

//export the default `activate` function called by vscode to activate our extension
export function activate(context: ExtensionContext) {
    extension.activate(context);
}

//export the brighterscript language server class for use in the LanguageServer runner
export const LanguageServer = require('brighterscript').LanguageServer;