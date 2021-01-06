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
      color: #ececec;
    }
  </style>
  <li>
    <JSONKey key={nodeKey} />
    <label for="jsonNodeValue" class="valueNode" contenteditable="true">
      {nodeValue}
    </label>
  </li>