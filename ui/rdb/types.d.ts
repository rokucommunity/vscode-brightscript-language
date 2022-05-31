import type { Definition } from 'typescript-json-schema';

declare global {
    declare const acquireVsCodeApi: <T = unknown>() => {
        getState: () => T;
        setState: (data: T) => void;
        postMessage: (msg: unknown) => void;
    };

    interface Window {
        vscode: {
            getState: () => T;
            setState: (data: T) => void;
            postMessage: (msg: unknown) => void;
        };
    }

    declare const requestArgsSchema: Definition;
    declare const odcCommands: string[];
}
