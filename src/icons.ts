import * as vscode from 'vscode';
export const icons = {
    streamingStick: {
        light: vscode.Uri.file(`${__dirname}/../images/icons/streaming-stick-light.svg`),
        dark: vscode.Uri.file(`${__dirname}/../images/icons/streaming-stick-dark.svg`)
    },
    tv: {
        light: vscode.Uri.file(`${__dirname}/../images/icons/tv-light.svg`),
        dark: vscode.Uri.file(`${__dirname}/../images/icons/tv-dark.svg`)
    },
    setTopBox: {
        light: vscode.Uri.file(`${__dirname}/../images/icons/set-top-box-light.svg`),
        dark: vscode.Uri.file(`${__dirname}/../images/icons/set-top-box-dark.svg`)
    }
};
