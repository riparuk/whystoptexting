<script lang="ts">
    import { onMount } from "svelte";
    import Analytics from "./analytics.svelte";
    import { chatStore, isStoreLoaded, initStore } from "../lib/store";

    onMount(async () => {
        // Only run initialization if not already loaded or store is empty
        if (!$isStoreLoaded || !$chatStore) {
            await initStore();
        }

        // If finally loaded and still zero data, push back home
        if ($isStoreLoaded && !$chatStore && typeof window !== "undefined") {
            window.location.href = import.meta.env.BASE_URL;
        }
    });

    const triggerReset = () => {
        if (typeof window !== "undefined") {
            window.location.href = import.meta.env.BASE_URL;
        }
    };
</script>

{#if !$isStoreLoaded}
    <div class="loading-wrapper">
        <div class="spinner"></div>
        <p>Memuat data analitik kamu...</p>
    </div>
{:else if $isStoreLoaded && $chatStore}
    <Analytics data={$chatStore} onReset={triggerReset} />
{/if}

<style>
    .loading-wrapper {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: var(--bg-primary);
        color: var(--text-primary);
        gap: 1rem;
    }

    .spinner {
        width: 48px;
        height: 48px;
        border: 4px solid rgba(236, 72, 153, 0.2);
        border-top-color: var(--pink-500);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }
</style>
