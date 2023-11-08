import { expect } from 'chai';
import * as semver from 'semver';
import { GlobalStateManager } from '../GlobalStateManager';
import { vscode } from '../mockVscode.spec';
import { WhatsNewManager } from './WhatsNewManager';

describe('WhatsNewManager', () => {
    let whatsNewManager: WhatsNewManager;
    let globalStateManager: GlobalStateManager;

    beforeEach(() => {
        globalStateManager = new GlobalStateManager(vscode.context);
        whatsNewManager = new WhatsNewManager(globalStateManager, '0.0.0');
    });

    it('notableReleaseVersions is always in highest-to-lowest order', () => {
        let versions = [...whatsNewManager['notableReleaseVersions']].sort((a, b) => {
            return semver.lt(a, b) ? 1 : -1;
        });
        expect(whatsNewManager['notableReleaseVersions']).to.eql([...new Set(versions)]);
    });
});
