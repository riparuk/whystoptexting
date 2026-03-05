<script lang="ts">
    import { onMount } from "svelte";
    import UploadChat from "./upload-chat.svelte";
    import { setChatData } from "../lib/store";
    import { clearChatData } from "../lib/idb";

    onMount(async () => {
        // Clear chat data every time user explicitly visits home route
        await clearChatData();
        await setChatData(null);
    });
</script>

<UploadChat />
