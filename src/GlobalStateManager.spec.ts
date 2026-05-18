import { expect } from 'chai';
let Module = require('module');
import { vscode } from './mockVscode.spec';

//override the "require" call to mock certain items (specifically 'vscode')
const { require: oldRequire } = Module.prototype;
Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

import { GlobalStateManager } from './GlobalStateManager';

describe('GlobalStateManager', () => {
    let manager: GlobalStateManager;
    let mockContext: any;
    let storage: Record<string, any>;

    beforeEach(() => {
        storage = {};
        mockContext = {
            globalState: {
                get: (key: string) => storage[key],
                update: (key: string, value: any) => {
                    storage[key] = value;
                }
            }
        };
        // Configure text history as enabled with a limit via util.getConfiguration return shape
        vscode.workspace._configuration = {
            'brightscript.sendRemoteTextHistory': {
                enabled: true,
                limit: 30
            }
        };
        manager = new GlobalStateManager(mockContext);
        // Enable text history for tests by directly setting the private property
        (manager as any).remoteTextHistoryEnabled = true;
        (manager as any).remoteTextHistoryLimit = 30;
    });

    describe('lastRunExtensionVersion', () => {
        it('returns undefined when not set', () => {
            expect(manager.lastRunExtensionVersion).to.be.undefined;
        });

        it('stores and retrieves a version', () => {
            manager.lastRunExtensionVersion = '1.2.3';
            expect(manager.lastRunExtensionVersion).to.equal('1.2.3');
        });
    });

    describe('lastSeenReleaseNotesVersion', () => {
        it('returns undefined when not set', () => {
            expect(manager.lastSeenReleaseNotesVersion).to.be.undefined;
        });

        it('stores and retrieves a version', () => {
            manager.lastSeenReleaseNotesVersion = '2.0.0';
            expect(manager.lastSeenReleaseNotesVersion).to.equal('2.0.0');
        });
    });

    describe('sendRemoteTextHistory', () => {
        it('returns empty array when no history stored', () => {
            expect(manager.sendRemoteTextHistory).to.deep.equal([]);
        });

        it('stores and retrieves history', () => {
            manager.sendRemoteTextHistory = ['text1', 'text2'];
            expect(manager.sendRemoteTextHistory).to.deep.equal(['text1', 'text2']);
        });
    });

    describe('addTextHistory', () => {
        it('adds new text to history', () => {
            manager.addTextHistory('hello');
            expect(manager.sendRemoteTextHistory).to.deep.equal(['hello']);
        });

        it('moves duplicate to front of history', () => {
            manager.addTextHistory('first');
            manager.addTextHistory('second');
            manager.addTextHistory('first');
            expect(manager.sendRemoteTextHistory).to.deep.equal(['first', 'second']);
        });

        it('does not add empty string', () => {
            manager.addTextHistory('');
            expect(manager.sendRemoteTextHistory).to.deep.equal([]);
        });
    });

    describe('clear', () => {
        it('clears all stored values', () => {
            manager.lastRunExtensionVersion = '1.0.0';
            manager.lastSeenReleaseNotesVersion = '2.0.0';
            manager.sendRemoteTextHistory = ['text'];

            manager.clear();

            expect(manager.lastRunExtensionVersion).to.be.undefined;
            expect(manager.lastSeenReleaseNotesVersion).to.be.undefined;
            expect(manager.sendRemoteTextHistory).to.deep.equal([]);
        });
    });
});
