import * as vscode from 'vscode';
import * as minimatch from 'minimatch';

export class ConfigurationManager {
    /**
     * Wrapper around `vscode.workspace.getConfiguration` that defaults the resource to `null`.
     * This avoids VS Code warnings when accessing resource-scoped settings without a URI.
     *
    * Get a workspace configuration object.
    *
    * When a section-identifier is provided only that part of the configuration
    * is returned. Dots in the section-identifier are interpreted as child-access,
    * like `{ myExt: { setting: { doIt: true }}}` and `getConfiguration('myExt.setting').get('doIt') === true`.
    *
    * When a scope is provided configuration confined to that scope is returned. Scope can be a resource or a language identifier or both.
    *
    * @param section A dot-separated identifier.
    * @param scope A scope for which the configuration is asked for.
    * @return The full configuration or a subset.
    */
    public getConfiguration(section?: string, scope?: vscode.ConfigurationScope): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration(section, scope ?? null);
    }

    public getConfigurationValueIfDefined(key: string, defaultValue = undefined) {
        const [, configurationKey, settingKey] = /(.+?)\.([^\.]+)$/.exec(key) ?? [];
        let settings = this.getConfiguration(configurationKey);
        const inspection = settings.inspect(settingKey);

        if (
            inspection.defaultLanguageValue !== undefined ||
            inspection.globalLanguageValue !== undefined ||
            inspection.globalValue !== undefined ||
            inspection.workspaceFolderLanguageValue !== undefined ||
            inspection.workspaceFolderValue !== undefined ||
            inspection.workspaceLanguageValue !== undefined ||
            inspection.workspaceValue !== undefined
        ) {
            return settings.get(settingKey, defaultValue);
        }
        return defaultValue;
    }

    /**
     * Writes a configuration value to the closest scope where it is already defined, falling back to global (user) settings.
     * In a single-folder workspace, "closest" means `.vscode/settings.json`.
     * In a `.code-workspace`, "closest" means the top-level `settings` block; per-folder `.vscode/settings.json`
     * files are ignored because VS Code gives the workspace block higher priority than them.
     */
    public async setConfigurationValueAtUserOrClosestScope(key: string, value: any) {
        const match = /(.+?)\.([^.]+)$/.exec(key);
        if (!match) {
            throw new Error(`Invalid configuration key format: '${key}'. Expected 'namespace.settingName'.`);
        }
        const [, configurationKey, settingKey] = match;
        const scope = vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.workspace.workspaceFile;
        const inspection = vscode.workspace.getConfiguration(configurationKey, scope).inspect(settingKey);

        let target: vscode.ConfigurationTarget;
        let resource: vscode.Uri | undefined;
        if (!vscode.workspace.workspaceFile && inspection?.workspaceFolderValue !== undefined) {
            // Single-folder: write to .vscode/settings.json
            target = vscode.ConfigurationTarget.WorkspaceFolder;
            resource = vscode.workspace.workspaceFolders?.[0]?.uri;
        } else if (inspection?.workspaceValue !== undefined) {
            // .code-workspace: write to the top-level settings block
            target = vscode.ConfigurationTarget.Workspace;
        } else {
            // Not defined anywhere closer, so fall back to user (global) settings
            target = vscode.ConfigurationTarget.Global;
        }

        await vscode.workspace.getConfiguration(configurationKey, resource).update(settingKey, value, target);
    }

    /**
     * Returns the deduplicated set of active exclude patterns by combining enabled entries from
     * the user's `files.exclude` and `search.exclude` settings with any additional patterns provided.
     *
     * @param additionalExcludes Extra glob patterns to exclude on top of the VS Code settings.
     * @param scope A scope for which the configuration is asked for.
     */
    public getExcludePatterns(additionalExcludes: string[], scope?: vscode.ConfigurationScope): string[] {
        const filesExclude = this.getConfiguration('files', scope).get<Record<string, boolean>>('exclude') ?? {};
        const searchExclude = this.getConfiguration('search', scope).get<Record<string, boolean>>('exclude') ?? {};

        return [...new Set([
            ...Object.entries(filesExclude).filter(([, enabled]) => enabled).map(([pattern]) => pattern),
            ...Object.entries(searchExclude).filter(([, enabled]) => enabled).map(([pattern]) => pattern),
            ...additionalExcludes
        ])];
    }

    /**
     * Builds a single exclude glob pattern suitable for passing directly to `vscode.workspace.findFiles`
     * as the `exclude` argument. Returns `undefined` when there are no patterns, which preserves
     * `findFiles`' default exclude behavior.
     *
     * @param additionalExcludes Extra glob patterns to exclude on top of the VS Code settings.
     * @param scope A scope for which the configuration is asked for.
     */
    public buildExcludeGlob(additionalExcludes: string[], scope?: vscode.ConfigurationScope): string | undefined {
        const patterns = this.getExcludePatterns(additionalExcludes, scope);
        if (patterns.length === 0) {
            return undefined;
        }
        if (patterns.length === 1) {
            return patterns[0];
        }
        return `{${patterns.join(',')}}`;
    }

    /**
     * Returns true if the given URI matches any of the active exclude patterns from `files.exclude`,
     * `search.exclude`, or the provided additional patterns. Intended for filtering file watcher events.
     *
     * @param uri The file URI to test.
     * @param additionalExcludes Extra glob patterns to exclude on top of the VS Code settings.
     * @param scope A scope for which the configuration is asked for.
     */
    public isUriExcluded(uri: vscode.Uri, additionalExcludes: string[], scope?: vscode.ConfigurationScope): boolean {
        const patterns = this.getExcludePatterns(additionalExcludes, scope);
        if (patterns.length === 0) {
            return false;
        }
        const relativePath = vscode.workspace.asRelativePath(uri, false);
        // Check the path itself and each ancestor so that directory-level patterns
        // (e.g. `**/.git`) also match files nested inside them (e.g. `.git/config`).
        const segments = relativePath.split('/');
        for (let i = segments.length; i > 0; i--) {
            const candidate = segments.slice(0, i).join('/');
            if (patterns.some(pattern => minimatch(candidate, pattern, { dot: true }))) {
                return true;
            }
        }
        return false;
    }
}

export const configurationManager = new ConfigurationManager();
