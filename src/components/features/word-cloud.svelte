<script lang="ts">
    import { type Message } from "../../lib/parser";

    interface Props {
        messages: Message[];
        participants: string[];
    }

    let { messages, participants }: Props = $props();

    type WordEntry = { word: string; count: number };

    // View state
    type ViewMode = "overall" | "by-user";
    let viewMode = $state<ViewMode>("overall");
    let selectedUser = $state("");

    $effect(() => {
        if (!selectedUser && participants.length > 0) {
            selectedUser = participants[0];
        }
    });

    let topN = $state(10);

    let computedWords = $state<WordEntry[]>([]);
    let computedEmojis = $state<WordEntry[]>([]);
    let isCalculating = $state(true);

    let worker: Worker | null = null;
    import { onMount, onDestroy } from "svelte";

    onMount(() => {
        worker = new Worker(new URL("../../lib/worker.ts", import.meta.url), {
            type: "module",
        });

        worker.onmessage = (e) => {
            if (e.data.type === "WORD_CLOUD" && e.data.success) {
                computedWords = e.data.result.words;
                computedEmojis = e.data.result.emojis;
                isCalculating = false;
            }
        };
    });

    onDestroy(() => {
        if (worker) worker.terminate();
    });

    $effect(() => {
        if (!worker) return;

        isCalculating = true;

        const targetMsgs =
            viewMode === "overall"
                ? messages
                : messages.filter((m) => m.sender === selectedUser);

        worker.postMessage({
            type: "WORD_CLOUD",
            payload: { messages: targetMsgs },
        });
    });

    const displayedWords = $derived(computedWords.slice(0, topN));
    const displayedEmojis = $derived(computedEmojis.slice(0, 15));

    const maxCount = $derived(displayedWords[0]?.count ?? 1);
    const maxEmojiCount = $derived(displayedEmojis[0]?.count ?? 1);

    function barWidth(count: number, max: number) {
        return `${Math.max(4, (count / max) * 100)}%`;
    }

    function colorLevel(count: number, max: number) {
        const ratio = count / max;
        if (ratio > 0.8) return "var(--pink-500)";
        if (ratio > 0.6) return "var(--pink-600)";
        if (ratio > 0.4) return "var(--pink-700)";
        if (ratio > 0.2) return "#9d174d";
        return "#6b1f3e";
    }
</script>

<div class="word-cloud">
    <!-- Header -->
    <div class="section-header animate-fade-up">
        <div>
            <h2 class="section-title">💬 Kata & Emoji Favorit</h2>
            <p class="section-desc">
                Kata dan emoji yang paling sering dipakai dalam chat ini
            </p>
        </div>

        <div class="controls glass-card">
            <!-- View toggle -->
            <div class="view-toggle">
                <button
                    class="toggle-btn"
                    class:active={viewMode === "overall"}
                    onclick={() => (viewMode = "overall")}
                >
                    🌐 Semua
                </button>
                <button
                    class="toggle-btn"
                    class:active={viewMode === "by-user"}
                    onclick={() => (viewMode = "by-user")}
                >
                    👤 Per Orang
                </button>
            </div>

            <!-- User selector (only when by-user) -->
            {#if viewMode === "by-user"}
                <div class="user-selector">
                    <label class="filter-label" for="user-select">Peserta</label
                    >
                    <select
                        id="user-select"
                        class="user-select"
                        bind:value={selectedUser}
                    >
                        {#each participants as p}
                            <option value={p}>{p}</option>
                        {/each}
                    </select>
                </div>
            {/if}

            <!-- Top N selector -->
            <div class="topn-group">
                <span class="filter-label">Top</span>
                <div class="topn-btns">
                    {#each [5, 10, 20] as n}
                        <button
                            class="topn-btn"
                            class:active={topN === n}
                            onclick={() => (topN = n)}
                        >
                            {n}
                        </button>
                    {/each}
                </div>
            </div>
        </div>
    </div>

    <div class="content-grid">
        {#if isCalculating}
            <div class="calculating-overlay glass-card">
                <div class="spinner"></div>
                <p>
                    Memproses kata dan emoji...<br />
                    <span style="font-size: 0.8em; color: var(--text-muted)"
                        >Ini mungkin memakan waktu sebentar untuk data yang
                        sangat besar.</span
                    >
                </p>
            </div>
        {:else}
            <!-- Words list -->
            <div
                class="words-section animate-fade-up"
                style="animation-delay: 0.05s"
            >
                <div class="list-header glass-card">
                    <div class="list-hdr-text">
                        <span class="list-title">🔤 Kata Paling Sering</span>
                        {#if viewMode === "by-user"}
                            <span class="badge"
                                >{selectedUser.split(" ")[0]}</span
                            >
                        {/if}
                    </div>
                    <span
                        class="total-unique"
                        style="color: var(--text-muted); font-size:0.78rem"
                    >
                        {computedWords.length} teratas
                    </span>
                </div>

                <div class="word-bars">
                    {#each displayedWords as item, i}
                        <div
                            class="word-bar-row animate-fade-up"
                            style="animation-delay: {i * 0.03}s"
                        >
                            <span class="rank-num">{i + 1}</span>
                            <span class="word-label">{item.word}</span>
                            <div class="bar-track">
                                <div
                                    class="bar-fill"
                                    style="width: {barWidth(
                                        item.count,
                                        maxCount,
                                    )}; background: {colorLevel(
                                        item.count,
                                        maxCount,
                                    )}"
                                ></div>
                            </div>
                            <span class="word-count"
                                >{item.count.toLocaleString("id-ID")}</span
                            >
                        </div>
                    {/each}

                    {#if displayedWords.length === 0}
                        <div class="empty-words">
                            Tidak ada kata yang cukup sering muncul
                        </div>
                    {/if}
                </div>
            </div>

            <!-- Emojis section -->
            <div
                class="emojis-section animate-fade-up"
                style="animation-delay: 0.1s"
            >
                <div class="list-header glass-card">
                    <span class="list-title">😊 Emoji Favorit</span>
                    {#if viewMode === "by-user"}
                        <span class="badge">{selectedUser.split(" ")[0]}</span>
                    {/if}
                </div>

                {#if displayedEmojis.length === 0}
                    <div class="empty-emoji glass-card">
                        <p>Tidak ada emoji terdeteksi dalam chat ini</p>
                    </div>
                {:else}
                    <!-- Emoji bubbles -->
                    <div class="emoji-bubbles glass-card">
                        {#each displayedEmojis as item, i}
                            {@const ratio = item.count / maxEmojiCount}
                            <div
                                class="emoji-pill"
                                title="{item.word} · {item.count.toLocaleString(
                                    'id-ID',
                                )} kali"
                                style="font-size: {0.9 +
                                    ratio * 1.6}rem; opacity: {0.5 +
                                    ratio * 0.5}"
                            >
                                {item.word}
                                <span class="emoji-count">{item.count}</span>
                            </div>
                        {/each}
                    </div>

                    <!-- Emoji bar chart -->
                    <div class="emoji-bars glass-card">
                        {#each displayedEmojis.slice(0, 10) as item, i}
                            <div class="emoji-bar-row">
                                <span class="emoji-symbol">{item.word}</span>
                                <div class="bar-track">
                                    <div
                                        class="bar-fill emoji-bar-fill"
                                        style="width: {barWidth(
                                            item.count,
                                            maxEmojiCount,
                                        )}"
                                    ></div>
                                </div>
                                <span class="word-count"
                                    >{item.count.toLocaleString("id-ID")}</span
                                >
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>

<style>
    .word-cloud {
        display: flex;
        flex-direction: column;
        gap: 24px;
    }

    .section-header {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
    }

    .section-title {
        font-size: 1.5rem;
        font-weight: 800;
        margin: 0 0 4px;
        letter-spacing: -0.01em;
    }

    .section-desc {
        color: var(--text-secondary);
        font-size: 0.88rem;
        margin: 0;
    }

    /* Controls */
    .controls {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 12px 16px;
        flex-wrap: wrap;
    }

    .view-toggle {
        display: flex;
        gap: 4px;
        background: var(--bg-secondary);
        border-radius: 9px;
        padding: 3px;
    }

    .toggle-btn {
        padding: 6px 14px;
        border-radius: 7px;
        border: none;
        background: transparent;
        color: var(--text-secondary);
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        font-family: inherit;
        white-space: nowrap;
    }

    .toggle-btn.active {
        background: rgba(236, 72, 153, 0.2);
        color: var(--pink-300);
    }

    .user-selector {
        display: flex;
        flex-direction: column;
        gap: 3px;
    }

    .filter-label {
        font-size: 0.7rem;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .user-select {
        background: var(--bg-secondary);
        border: 1px solid var(--border-subtle);
        border-radius: 8px;
        color: var(--text-primary);
        font-size: 0.85rem;
        font-family: inherit;
        padding: 6px 10px;
        outline: none;
        cursor: pointer;
        transition: border-color 0.2s;
    }

    .user-select:focus {
        border-color: var(--pink-500);
    }

    .topn-group {
        display: flex;
        flex-direction: column;
        gap: 3px;
    }

    .topn-btns {
        display: flex;
        gap: 4px;
    }

    .topn-btn {
        padding: 5px 11px;
        border-radius: 7px;
        border: 1px solid var(--border-subtle);
        background: transparent;
        color: var(--text-secondary);
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        font-family: inherit;
    }

    .topn-btn.active {
        background: rgba(236, 72, 153, 0.15);
        border-color: rgba(236, 72, 153, 0.4);
        color: var(--pink-300);
    }

    /* Content grid */
    .content-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
    }

    @media (max-width: 900px) {
        .content-grid {
            grid-template-columns: 1fr;
        }
    }

    /* Words section */
    .words-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .list-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        gap: 8px;
    }

    .list-hdr-text {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .list-title {
        font-size: 0.88rem;
        font-weight: 700;
        color: var(--text-primary);
    }

    .total-unique {
        font-size: 0.78rem;
    }

    .word-bars {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .word-bar-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 4px;
    }

    .rank-num {
        font-size: 0.72rem;
        color: var(--text-muted);
        width: 20px;
        text-align: right;
        flex-shrink: 0;
        font-weight: 600;
    }

    .word-label {
        font-size: 0.88rem;
        font-weight: 600;
        color: var(--text-primary);
        min-width: 80px;
        max-width: 140px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex-shrink: 0;
    }

    .bar-track {
        flex: 1;
        height: 8px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 4px;
        overflow: hidden;
    }

    .bar-fill {
        height: 100%;
        border-radius: 4px;
        transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .word-count {
        font-size: 0.78rem;
        color: var(--text-muted);
        width: 36px;
        text-align: right;
        flex-shrink: 0;
        font-weight: 600;
    }

    .empty-words {
        color: var(--text-muted);
        font-size: 0.88rem;
        text-align: center;
        padding: 32px;
    }

    /* Emojis */
    .emojis-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .emoji-bubbles {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 20px;
        align-items: center;
    }

    .emoji-pill {
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: default;
        transition: transform 0.15s;
        line-height: 1;
    }

    .emoji-pill:hover {
        transform: scale(1.2);
    }

    .emoji-count {
        font-size: 0.68rem;
        color: var(--text-muted);
        font-weight: 600;
        background: rgba(255, 255, 255, 0.06);
        border-radius: 4px;
        padding: 1px 4px;
    }

    .emoji-bars {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 16px;
    }

    .emoji-bar-row {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .emoji-symbol {
        font-size: 1.2rem;
        width: 28px;
        text-align: center;
        flex-shrink: 0;
    }

    .emoji-bar-fill {
        background: linear-gradient(90deg, var(--pink-700), var(--pink-400));
    }

    .empty-emoji {
        padding: 40px;
        text-align: center;
        color: var(--text-muted);
        font-size: 0.88rem;
    }

    .calculating-overlay {
        grid-column: 1 / -1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 20px;
        color: var(--text-secondary);
        gap: 16px;
        text-align: center;
        min-height: 300px;
    }

    .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid rgba(236, 72, 153, 0.2);
        border-top-color: var(--pink-500);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
</style>
