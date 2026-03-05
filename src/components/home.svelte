<script lang="ts">
    import UploadChat from "./upload-chat.svelte";
    import Analytics from "./analytics.svelte";
    import { chatStore, setChatData } from "../lib/store";

    function reset() {
        setChatData(null);
    }
</script>

{#if $chatStore}
    <Analytics data={$chatStore} onReset={reset} />
{:else}
    <UploadChat />
{/if}
