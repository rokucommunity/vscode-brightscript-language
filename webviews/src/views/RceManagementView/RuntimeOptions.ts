const runtimePresetSeconds = [15 * 60, 30 * 60, 3600, 2 * 3600, 4 * 3600, 8 * 3600, 16 * 3600, 24 * 3600, 48 * 3600];

const defaultRuntimeSeconds = 3600;

/**
 * The max-runtime choices (in seconds, ascending) offered when starting a device. Presets above the
 * org's runtime cap are dropped, and the cap itself becomes the top choice when it is not a preset.
 */
export function buildRuntimeOptions(orgMaxRuntimeSeconds: number | undefined): number[] {
    if (!orgMaxRuntimeSeconds) {
        return runtimePresetSeconds;
    }
    const options = runtimePresetSeconds.filter((presetSeconds) => presetSeconds <= orgMaxRuntimeSeconds);
    if (!options.includes(orgMaxRuntimeSeconds)) {
        options.push(orgMaxRuntimeSeconds);
    }
    return options;
}

/**
 * Resolves the runtime a start request should use: the user's pick when the option list still
 * offers it (an account switch can lower the cap), otherwise one hour, otherwise the largest option.
 */
export function resolveRuntimeSeconds(pickedSeconds: number | undefined, availableOptions: number[]): number {
    if (pickedSeconds !== undefined && availableOptions.includes(pickedSeconds)) {
        return pickedSeconds;
    }
    return availableOptions.includes(defaultRuntimeSeconds) ? defaultRuntimeSeconds : availableOptions[availableOptions.length - 1];
}

/** Compact label such as `15m`, `1h` or `1h 30m` */
export function formatRuntimeOption(totalSeconds: number): string {
    const totalMinutes = Math.round(totalSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) {
        return `${minutes}m`;
    }
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}
