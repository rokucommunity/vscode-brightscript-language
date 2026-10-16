import * as vscode from 'vscode';
import { EventEmitter } from 'eventemitter3';
import { util } from '../util';
import { vscodeContextManager } from './VscodeContextManager';

/**
 * Every experimental feature the extension can gate. Each value doubles as the settings key suffix
 * (`brightscript.experimental.<feature>`) and the context key suffix used by package.json `when`
 * clauses (view and command visibility).
 */
export enum ExperimentalFeature {
    /**
     * @deprecated Placeholder with no consumers, kept so the gating machinery in this class stays
     * exercised until a real experimental feature arrives. Has no package.json settings
     * contribution.
     */
    placeholder = 'placeholder'
}

/**
 * The enablement each feature falls back to when its setting is absent. For features with a
 * package.json settings contribution this mirrors that setting's `default`; the placeholder has
 * no contribution, so it relies on this map alone.
 */
const featureDefaults: Record<ExperimentalFeature, boolean> = {
    [ExperimentalFeature.placeholder]: false
};

/**
 * Owns the `brightscript.experimental.*` feature flags. `brightscript.experimental.all` enables
 * every feature at once; otherwise each feature's own setting decides.
 *
 * Features toggle live: the context keys that drive UI visibility (views, command palette
 * entries) follow the settings immediately, and runtime consumers either read `isEnabled` at the
 * moment they act or subscribe to `onEnablementChanged`.
 */
export class ExperimentalFeaturesManager {
    constructor(context: vscode.ExtensionContext) {
        for (const feature of Object.values(ExperimentalFeature)) {
            const enabled = this.isEnabled(feature);
            this.lastKnownEnablement.set(feature, enabled);
            void vscodeContextManager.set(`brightscript.experimental.${feature}`, enabled);
        }
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration('brightscript.experimental')) {
                    this.handleConfigurationChange();
                }
            })
        );
    }

    private emitter = new EventEmitter();

    /**
     * The enablement each feature most recently reported, so only real transitions emit events (a
     * settings edit that lands on the same effective value, like flipping an individual feature
     * while `all` is on, must not re-announce)
     */
    private lastKnownEnablement = new Map<ExperimentalFeature, boolean>();

    /**
     * Whether the feature is enabled right now (its own setting, or `experimental.all`)
     */
    public isEnabled(feature: ExperimentalFeature): boolean {
        const brightscriptConfig = util.getConfiguration('brightscript');
        return (brightscriptConfig.get<boolean>('experimental.all') ?? false) ||
            (brightscriptConfig.get<boolean>(`experimental.${feature}`) ?? featureDefaults[feature]);
    }

    /**
     * Register a handler that fires whenever a feature's effective enablement changes
     */
    public onEnablementChanged(handler: (feature: ExperimentalFeature, enabled: boolean) => void): () => void {
        this.emitter.on('enablement-changed', handler);
        return () => {
            this.emitter.off('enablement-changed', handler);
        };
    }

    private handleConfigurationChange() {
        for (const feature of Object.values(ExperimentalFeature)) {
            const enabled = this.isEnabled(feature);
            if (enabled !== this.lastKnownEnablement.get(feature)) {
                this.lastKnownEnablement.set(feature, enabled);
                void vscodeContextManager.set(`brightscript.experimental.${feature}`, enabled);
                this.emitter.emit('enablement-changed', feature, enabled);
            }
        }
    }
}
