import * as vscode from 'vscode';
import * as path from 'path';
import * as fsExtra from 'fs-extra';

/**
 * Build the html for a webview from the built webviews bundle's index.html, replacing its
 * placeholders. Shared by BaseWebviewViewProvider (sidebar views and their mirrored panels) and
 * standalone editor webview panels like the Cloud Emulator video tabs.
 */
export function buildWebviewIndexHtml(options: BuildWebviewIndexHtmlOptions): string {
    let html: string;
    try {
        html = fsExtra.readFileSync(options.webviewBasePath + '/index.html').toString();
    } catch (e) {
        console.error(e);
        return '<h1>Error loading webview</h1>';
    }

    const baseUri = options.webview?.asWebviewUri?.(
        vscode.Uri.file(path.join(options.webviewBasePath))
    );

    //the data that will be replaced in the index.html
    const data = {
        viewName: options.viewName,
        webviewContext: options.webviewContext ?? 'sidebar',
        baseHref: `${baseUri}/`,
        additionalScriptContents: (options.additionalScriptContents ?? []).join('\n                        ')
    };
    /**
     * replace placeholders in the html, in one of these formats:
     * <!--{{thing1}}-->
     * //{{thing2}}
     * {{thing3}}
     */
    html = html.replace(/(\/\/{{(\w+)}})|({{(\w+)}})|(<!--{{(\w+)}})/gm, (...match: string[]) => {
        const [, , key1, , key2, , key3] = match;
        return data[key1] ?? data[key2] ?? data[key3] ?? match[0];
    });
    // remove leading slash for css/js urls so we can make them relative to the baseHref
    html = html.replace(/((?:href|src)\s*=\s*["'])(\/.*")/g, (...match: string[]) => {
        return match[1] + match[2]?.replace(/^\/+/, '');
    });
    return html;
}

export interface BuildWebviewIndexHtmlOptions {
    /** The webview the html will render in (used to build webview-safe resource uris) */
    webview: vscode.Webview;
    /** Absolute path to the built webviews bundle directory (dist/webviews) */
    webviewBasePath: string;
    /** The client-side view name the bundle should boot (a key in webviews/src/main.ts's views map) */
    viewName: string;
    /** Where the view is rendering, so it can persist/behave differently in the sidebar vs a popped-out editor panel */
    webviewContext?: 'sidebar' | 'panel';
    /** Extra script lines injected into the page */
    additionalScriptContents?: string[];
}
