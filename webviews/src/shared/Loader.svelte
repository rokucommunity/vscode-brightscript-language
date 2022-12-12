<style>
    .container {
        position: absolute;
        left: 0;
        right: 0;
        padding: 10px;
    }

    .loader {
        border: 6px solid rgb(190, 190, 190);
        border-top: 6px solid #00509f;
        border-bottom: 6px solid #00509f;
        border-radius: 50%;
        height: 30px;
        width: 30px;
        animation: spin 2s linear infinite;
        margin: auto;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
</style>

<div class="container">
    <div class="loader" />
</div>
