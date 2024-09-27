import * as vscode from 'vscode';
import type { RokuDeviceDetails } from './ActiveDeviceManager';

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
    },
    /**
     * Get the correct icon for the device type
     */
    getDeviceType: (device: RokuDeviceDetails) => {
        if (device.deviceInfo?.['is-stick']) {
            return icons.streamingStick;
        } else if (device.deviceInfo?.['is-tv']) {
            return icons.tv;
            //fall back to settop box in all other cases
        } else {
            return icons.setTopBox;
        }
    }
};
