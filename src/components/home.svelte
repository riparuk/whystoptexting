<script lang="ts">
    import UploadChat from "./upload-chat.svelte";
    import Analytics from "./analytics.svelte";
    import { type ParsedChat } from "../lib/parser";

    let parsedData = $state<ParsedChat | null>(null);

    function handleParsed(data: ParsedChat) {
        parsedData = data;
    }

    function reset() {
        parsedData = null;
    }
</script>

{#if parsedData}
    <Analytics data={parsedData} onReset={reset} />
{:else}
    <UploadChat onParsed={handleParsed} />
{/if}
