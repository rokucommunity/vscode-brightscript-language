import { env, window } from 'vscode';
import { gte as semverGte } from 'semver';
import * as vscode from 'vscode';
import type { GlobalStateManager } from '../GlobalStateManager';

const FILE_SCHEME = 'bs-whatsNew';

export class WhatsNewManager {
    constructor(
        private globalStateManager: GlobalStateManager,
        private currentVersion: string
    ) {
        this.previousExtensionVersion = this.globalStateManager.lastRunExtensionVersion;

        vscode.workspace.registerTextDocumentContentProvider(FILE_SCHEME, {
            provideTextDocumentContent: async (uri: vscode.Uri): Promise<string> => {
                let doc = await vscode.workspace.openTextDocument(uri.with({ scheme: 'file' }));

                let contents = doc.getText();
                contents += [
                    `\n\n## Past notable releases`,
                    `For past releases please see our [Release Notes](https://rokucommunity.github.io/vscode-brightscript-language/release-notes/index.html) page on our documentation website. For a comprehensive list`,
                    `of all changes for each version see [CHANGELOG.md](https://github.com/rokucommunity/vscode-brightscript-language/blob/master/CHANGELOG.md).\n`
                ].join('\n');
                return contents;
            }
        });
    }

    private previousExtensionVersion: string;

    /**
     * List of version numbers that should prompt the ReleaseNotes page.
     * these should be in highest-to-lowest order, because we will launch the highest version
     */
    private notableReleaseVersions = [
        '2.31.0',
        '2.0.0'
    ];

    public async showWelcomeOrWhatsNewIfRequired() {
        let config = vscode.workspace.getConfiguration('brightscript');
        let isReleaseNotificationsEnabled = config.get('enableReleaseNotifications') === false ? false : true;
        //this is the first launch of the extension
        if (this.previousExtensionVersion === undefined) {

            //if release notifications are enabled
            //TODO once we have the welcome page content prepared, remove the `&& false` from the condition below
            if (isReleaseNotificationsEnabled && false) {
                let viewText = 'View the get started guide';
                let response = await window.showInformationMessage(
                    'Thank you for installing the BrightScript VSCode extension. Click the button below to read some tips on how to get the most out of this extension.',
                    viewText
                );
                if (response === viewText) {
                    void env.openExternal(vscode.Uri.parse('https://github.com/rokucommunity/vscode-brightscript-language/blob/master/Welcome.md'));
                }
            }
            this.globalStateManager.lastSeenReleaseNotesVersion = this.currentVersion;
            return;
        }

        this.globalStateManager.lastSeenReleaseNotesVersion = '0.0.0';
        for (let releaseVersion of this.notableReleaseVersions) {
            if (
                //if the current version is larger than the whitelist version
                semverGte(releaseVersion, this.previousExtensionVersion) &&
                //if the user hasn't seen this popup before
                this.globalStateManager.lastSeenReleaseNotesVersion !== releaseVersion &&
                //if ReleaseNote popups are enabled
                isReleaseNotificationsEnabled
            ) {
                //mark this version as viewed
                this.globalStateManager.lastSeenReleaseNotesVersion = releaseVersion;
                let viewText = 'Release Notes';
                let viewOnWebText = 'View On Github';
                let response = await window.showInformationMessage(
                    `BrightScript Language v${releaseVersion} includes significant changes from previous versions. Please take a moment to review the release notes.`,
                    viewText,
                    viewOnWebText
                );
                if (response === viewText) {
                    this.showReleaseNotes(releaseVersion);
                } else if (response === viewOnWebText) {
                    void env.openExternal(vscode.Uri.parse(`https://github.com/rokucommunity/vscode-brightscript-language/blob/master/release-notes/v${releaseVersion}.md`));
                }
                this.globalStateManager.lastSeenReleaseNotesVersion = this.currentVersion;
            }
        }
    }

    public showReleaseNotes(version: string = this.notableReleaseVersions[0]) {
        if (this.notableReleaseVersions.includes(version)) {
            let uri = vscode.Uri.file(`${__dirname}/../../docs/Release Notes/v${version}.md`);
            uri = uri.with({ scheme: FILE_SCHEME });
            void vscode.commands.executeCommand('markdown.showPreview', uri, { sideBySide: false });
        } else {
            console.error(`WhatsNewManager.showReleaseNotes: Unknown version: ${version}`);
        }
    }
}
