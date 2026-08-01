<script lang="ts">
    import { onMount } from 'svelte';

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

    /**
     * The toolkit dropdown (FAST select) needs its value re-asserted from outside: a value set
     * while different options are slotted gets swallowed to '', and any slotted-option change
     * re-derives the selection from scratch (falling back to the first option). So the bound
     * value is re-applied after every value change and after every option mutation, a frame
     * later so FAST's own async slot processing has settled first.
     */
    function applyValueToElement(element: typeof dropdownElement, valueToApply: string | undefined) {
        requestAnimationFrame(() => {
            if (element && valueToApply !== undefined && element.value !== valueToApply) {
                element.value = valueToApply;
            }
        });
    }

    $: applyValueToElement(dropdownElement, value);

    onMount(() => {
        const optionObserver = new MutationObserver(() => applyValueToElement(dropdownElement, value));
        optionObserver.observe(dropdownElement, { childList: true });
        return () => optionObserver.disconnect();
    });

    function handleChange(event) {
        value = event.target.value;
    }
</script>

<vscode-dropdown
    bind:this={dropdownElement}
    {disabled}
    {title}
    on:change={handleChange}
    on:change>
    <slot />
</vscode-dropdown>
