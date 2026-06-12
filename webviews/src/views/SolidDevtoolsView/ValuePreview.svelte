<!-- Compact one-line preview of a bridge encodeValue() payload (recursive). -->
<script lang="ts">
    import type { SolidEncodedValue } from '../../../../src/solidDevtools/protocol';

    export let value: SolidEncodedValue;
</script>

{#if !value}
    <span class="nul">?</span>
{:else if value.t === 'number' || value.t === 'bigint'}
    <span class="num">{value.v}</span>
{:else if value.t === 'boolean'}
    <span class="bool">{value.v}</span>
{:else if value.t === 'string'}
    <span class="str">"{value.v}"</span>{#if value.len}<span class="punc"> …{value.len} chars</span>{/if}
{:else if value.t === 'function'}
    <span class="fn">ƒ {value.v}()</span>
{:else if value.t === 'symbol'}
    <span class="sym">{value.v}</span>
{:else if value.t === 'null' || value.t === 'undefined'}
    <span class="nul">{value.t}</span>
{:else if value.t === 'circular'}
    <span class="nul">[circular]</span>
{:else if value.t === 'array'}
    <span class="punc">[</span>{#if value.items}{#each value.items as item, i}{#if i > 0}<span class="punc">, </span>{/if}<svelte:self value={item} />{/each}{#if value.more}<span class="punc"> …+{value.more}</span>{/if}{:else if value.len}<span class="punc">…{value.len}</span>{/if}<span class="punc">]</span>
{:else if value.t === 'object'}
    {#if value.ctor}<span class="ctor">{value.ctor} </span>{/if}<span class="punc">{'{'}</span>{#if value.entries}{#each value.entries as entry, i}{#if i > 0}<span class="punc">, </span>{/if}<span class="key">{entry.k}</span><span class="punc">: </span><svelte:self value={entry.value} />{/each}{#if value.more}<span class="punc"> …+{value.more}</span>{/if}{/if}<span class="punc">{'}'}</span>
{:else}
    <span class="nul">{value.t}</span>
{/if}

<style>
    .num {
        color: var(--vscode-debugTokenExpression-number, #b5cea8);
    }

    .bool {
        color: var(--vscode-debugTokenExpression-boolean, #569cd6);
    }

    .str {
        color: var(--vscode-debugTokenExpression-string, #ce9178);
    }

    .fn {
        color: var(--vscode-symbolIcon-functionForeground, #dcdcaa);
        font-style: italic;
    }

    .sym {
        color: #d7ba7d;
    }

    .nul {
        opacity: 0.5;
    }

    .ctor {
        color: var(--vscode-symbolIcon-classForeground, #4ec9b0);
    }

    .key {
        color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe);
    }

    .punc {
        opacity: 0.6;
    }
</style>
