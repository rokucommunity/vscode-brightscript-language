<script lang="ts">
    /**
     * Two-way bindable selection, like a native `<select bind:value>`: reflects the selected
     * option's value, and setting it selects the matching option. `undefined` means "leave the
     * dropdown to its own default" (useful while placeholder options are rendered).
     */
    export let value: string | undefined = undefined;
    export let disabled = false;
    /** Native tooltip for the rendered dropdown element */
    export let title: string | undefined = undefined;

    let dropdownElement: (HTMLElement & { value?: string }) | undefined;

    /**
     * The selection as the rendered element itself reports it, for callers that must act on
     * exactly what the user sees rather than on bound state.
     */
    export function readDisplayedValue(): string | undefined {
        return dropdownElement?.value || undefined;
    }

    //vscode-single-select defers a value set before the matching option exists (it re-applies the
    //value once the option arrives), so unlike the old FAST dropdown this needs no re-assert
    //machinery - a plain property write is enough
    $: if (dropdownElement && value !== undefined && dropdownElement.value !== value) {
        dropdownElement.value = value;
    }

    function handleChange(event) {
        value = event.target.value;
    }
</script>

<vscode-single-select
    bind:this={dropdownElement}
    {disabled}
    {title}
    on:change={handleChange}
    on:change>
    <slot />
</vscode-single-select>
