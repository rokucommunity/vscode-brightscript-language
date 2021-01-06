<script>
    import JSONKey from './JSONKey.svelte';
    export let nodeKey, nodeValue;
    const nodeType = typeof(nodeValue);
  </script>
  <style>
    li {
      user-select: text;
      word-wrap: break-word;
      word-break: break-all;
    }
    .indent {
      padding-left: var(--li-identation);
    }
    .valueNode {
      color: "#8d8d8d";
    }
  </style>
  <li>
    <JSONKey key={nodeKey} />
    <span class="valueNode" contenteditable="true">
      {nodeValue}
    </span>
  </li>