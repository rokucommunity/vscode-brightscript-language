<script>
    export let expanded;
</script>
<style>
    .container {
        display: inline-block;
        cursor: pointer;
        transform: translate(calc(0px - var(--li-identation)), 20%);
        position: absolute;
    }
    .arrow {
        transform-origin: 50% 75%;
        position: relative;
        line-height: 1.1em;
        font-size: 0.75em;
        padding-top: 8px;
        padding-left: 3px;
        transition: 150ms;
        color: var(--arrow-sign);
        user-select: none;
        font-family: 'Courier New', Courier, monospace;
    }
    .expanded {
        transform: rotateZ(90deg) translateX(-3px);
    }
</style>

<div class="container" on:click>
    <div class="arrow" class:expanded={expanded}>{'\u25B6'}</div>
</div>
