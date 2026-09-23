<!--
    Compact one-line preview of a bridge encodeValue() payload.

    The value is flattened into styled text tokens in the script, so the markup stays
    a single {#each} — inline rendering needs exact whitespace, and expressing the
    recursion in the template would force it all onto unreadable one-liners.
-->
<script lang="ts">
    import type { SolidEncodedValue } from '../../../../src/solidDevtools/protocol';

    export let value: SolidEncodedValue;

    interface Token {
        cls: 'num' | 'bool' | 'str' | 'fn' | 'sym' | 'nul' | 'ctor' | 'key' | 'punc';
        text: string;
    }

    function push(out: Token[], cls: Token['cls'], text: string) {
        out.push({ cls: cls, text: text });
    }

    function appendValue(v: SolidEncodedValue | undefined, out: Token[]) {
        if (!v) {
            push(out, 'nul', '?');
            return;
        }
        switch (v.t) {
            case 'number':
            case 'bigint':
                push(out, 'num', String(v.v));
                break;
            case 'boolean':
                push(out, 'bool', String(v.v));
                break;
            case 'string':
                push(out, 'str', `"${v.v}"`);
                if (v.len) {
                    push(out, 'punc', ` …${v.len} chars`);
                }
                break;
            case 'function':
                push(out, 'fn', `ƒ ${v.v}()`);
                break;
            case 'symbol':
                push(out, 'sym', String(v.v));
                break;
            case 'null':
            case 'undefined':
                push(out, 'nul', v.t);
                break;
            case 'circular':
                push(out, 'nul', '[circular]');
                break;
            case 'array':
                appendArray(v, out);
                break;
            case 'object':
                appendObject(v, out);
                break;
            default:
                push(out, 'nul', v.t);
        }
    }

    function appendArray(v: SolidEncodedValue, out: Token[]) {
        push(out, 'punc', '[');
        if (v.items) {
            v.items.forEach((item, i) => {
                if (i > 0) {
                    push(out, 'punc', ', ');
                }
                appendValue(item, out);
            });
            if (v.more) {
                push(out, 'punc', ` …+${v.more}`);
            }
        } else if (v.len) {
            push(out, 'punc', `…${v.len}`);
        }
        push(out, 'punc', ']');
    }

    function appendObject(v: SolidEncodedValue, out: Token[]) {
        if (v.ctor) {
            push(out, 'ctor', `${v.ctor} `);
        }
        push(out, 'punc', '{');
        if (v.entries) {
            v.entries.forEach((entry, i) => {
                if (i > 0) {
                    push(out, 'punc', ', ');
                }
                push(out, 'key', entry.k);
                push(out, 'punc', ': ');
                appendValue(entry.value, out);
            });
            if (v.more) {
                push(out, 'punc', ` …+${v.more}`);
            }
        }
        push(out, 'punc', '}');
    }

    function buildTokens(v: SolidEncodedValue): Token[] {
        const out: Token[] = [];
        appendValue(v, out);
        return out;
    }

    $: parts = buildTokens(value);
</script>

{#each parts as part}<span class="sdtv-{part.cls}">{part.text}</span>{/each}

<style>
    /* :global with an sdtv- prefix — the class names are dynamic, so scoped
       selectors could be pruned as "unused" by the compiler */
    :global(.sdtv-num) {
        color: var(--vscode-debugTokenExpression-number, #b5cea8);
    }

    :global(.sdtv-bool) {
        color: var(--vscode-debugTokenExpression-boolean, #569cd6);
    }

    :global(.sdtv-str) {
        color: var(--vscode-debugTokenExpression-string, #ce9178);
    }

    :global(.sdtv-fn) {
        color: var(--vscode-symbolIcon-functionForeground, #dcdcaa);
        font-style: italic;
    }

    :global(.sdtv-sym) {
        color: #d7ba7d;
    }

    :global(.sdtv-nul) {
        opacity: 0.5;
    }

    :global(.sdtv-ctor) {
        color: var(--vscode-symbolIcon-classForeground, #4ec9b0);
    }

    :global(.sdtv-key) {
        color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe);
    }

    :global(.sdtv-punc) {
        opacity: 0.6;
    }
</style>
