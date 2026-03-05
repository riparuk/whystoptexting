<script lang="ts">
    import { type ParsedChat } from "../lib/parser";
    import MostActive from "./features/most-active.svelte";
    import ChatIntensity from "./features/chat-intensity.svelte";
    import ResponseTime from "./features/response-time.svelte";
    import WordCloud from "./features/word-cloud.svelte";
    import ChatHeatmap from "./features/chat-heatmap.svelte";

    interface Props {
        data: ParsedChat;
        onReset: () => void;
    }

    let { data, onReset }: Props = $props();

    type Tab =
        | "most-active"
        | "chat-intensity"
        | "response-time"
        | "word-cloud"
        | "heatmap";
    let activeTab = $state<Tab>("most-active");

    // All tabs — response-time visible for all but shows a "not available" msg for groups
    const tabs: { id: Tab; label: string; icon: string }[] = [
        { id: "most-active", label: "Paling Aktif", icon: "👑" },
        { id: "chat-intensity", label: "Intensitas", icon: "📈" },
        { id: "response-time", label: "Response Time", icon: "⏱️" },
        { id: "word-cloud", label: "Kata & Emoji", icon: "😘" },
        { id: "heatmap", label: "Heatmap", icon: "🗓️" },
    ];

    function formatDate(d: Date) {
        return d.toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
    }
</script>

<div class="analytics-wrapper">
    <!-- Top Navbar -->
    <nav class="navbar">
        <div class="nav-inner">
            <div
                class="nav-brand"
                onclick={onReset}
                role="button"
                tabindex="0"
                onkeydown={(e) => e.key === "Enter" && onReset()}
            >
                <span class="brand-name gradient-text tab-label"
                    >WhyStopTexting</span
                >
            </div>

            <!-- Desktop tabs -->
            <div class="nav-tabs hidden gap-2 md:flex">
                {#each tabs as tab}
                    <button
                        class="tab-btn flex items-center gap-2 rounded-lg px-3 py-2"
                        class:active={activeTab === tab.id}
                        class:bg-blue-500={activeTab === tab.id}
                        class:text-white={activeTab === tab.id}
                        class:bg-gray-100={activeTab !== tab.id}
                        onclick={() => (activeTab = tab.id)}
                    >
                        <span class="tab-icon">{tab.icon}</span>
                        <span class="tab-label">{tab.label}</span>
                    </button>
                {/each}
            </div>

            <!-- Mobile dropdown -->
            <select
                bind:value={activeTab}
                class="w-full rounded-lg border border-gray-300 p-2 text-sm md:hidden"
            >
                {#each tabs as tab}
                    <option value={tab.id}>
                        <span class="tab-icon">{tab.icon}</span>
                        <span class="tab-label">{tab.label}</span>
                    </option>
                {/each}
            </select>

            <div class="nav-actions">
                <button
                    class="reset-btn"
                    onclick={onReset}
                    title="Upload file baru"
                >
                    <span>↩</span> Ganti File
                </button>
            </div>
        </div>
    </nav>

    <!-- Date range info strip -->
    <div class="info-strip">
        <div class="info-strip-inner">
            <span class="info-item">
                <span class="info-label">Backup:</span>
                <span class="info-value"
                    >{formatDate(data.dateRange.start)} — {formatDate(
                        data.dateRange.end,
                    )}</span
                >
            </span>
            <span class="info-separator">·</span>
            <span class="info-item">
                <span class="info-label">Pesan:</span>
                <span class="info-value"
                    >{data.messages.length.toLocaleString("id-ID")}</span
                >
            </span>
            <span class="info-separator">·</span>
            <span class="info-item">
                <span class="info-label">Peserta:</span>
                <span class="info-value">{data.participants.length}</span>
            </span>
            <span class="info-separator">·</span>
            <span class="info-item">
                <span class="badge">{data.isGroup ? "Grup" : "1-on-1"}</span>
            </span>
        </div>
    </div>

    <!-- Feature Content -->
    <main class="content">
        {#if activeTab === "most-active"}
            <MostActive
                messages={data.messages}
                participants={data.participants}
                dateRange={data.dateRange}
            />
        {:else if activeTab === "chat-intensity"}
            <ChatIntensity
                messages={data.messages}
                dateRange={data.dateRange}
            />
        {:else if activeTab === "response-time"}
            <ResponseTime
                messages={data.messages}
                participants={data.participants}
                isGroup={data.isGroup}
                dateRange={data.dateRange}
            />
        {:else if activeTab === "word-cloud"}
            <WordCloud
                messages={data.messages}
                participants={data.participants}
            />
        {:else if activeTab === "heatmap"}
            <ChatHeatmap messages={data.messages} dateRange={data.dateRange} />
        {/if}
    </main>
</div>

<style>
    .analytics-wrapper {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        background: var(--bg-primary);
    }

    /* Navbar */
    .navbar {
        position: sticky;
        top: 0;
        z-index: 100;
        background: rgba(13, 13, 20, 0.85);
        backdrop-filter: blur(16px);
        border-bottom: 1px solid var(--border-subtle);
    }

    .nav-inner {
        max-width: 1280px;
        margin: 0 auto;
        padding: 0 24px;
        height: 60px;
        display: flex;
        align-items: center;
        gap: 20px;
    }

    .nav-brand {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        text-decoration: none;
        flex-shrink: 0;
        outline: none;
    }

    .brand-name {
        font-size: 1rem;
        font-weight: 800;
        letter-spacing: -0.01em;
    }

    .nav-tabs {
        display: flex;
        gap: 2px;
        flex: 1;
        justify-content: center;
        overflow-x: auto;
    }

    .tab-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 7px 14px;
        border-radius: 8px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--text-secondary);
        font-size: 0.82rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        font-family: inherit;
        white-space: nowrap;
        flex-shrink: 0;
    }

    .tab-btn:hover {
        color: var(--text-primary);
        background: rgba(236, 72, 153, 0.08);
        border-color: var(--border-subtle);
    }

    .tab-btn.active {
        color: var(--pink-300);
        background: rgba(236, 72, 153, 0.12);
        border-color: rgba(236, 72, 153, 0.35);
    }

    .tab-icon {
        font-size: 13px;
    }

    .nav-actions {
        flex-shrink: 0;
    }

    .reset-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        border-radius: 8px;
        border: 1px solid var(--border-subtle);
        background: transparent;
        color: var(--text-secondary);
        font-size: 0.82rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        font-family: inherit;
    }

    .reset-btn:hover {
        color: var(--text-primary);
        border-color: var(--border-pink);
    }

    /* Info strip */
    .info-strip {
        background: var(--bg-secondary);
        border-bottom: 1px solid var(--border-subtle);
        padding: 10px 24px;
    }

    .info-strip-inner {
        max-width: 1280px;
        margin: 0 auto;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 16px;
    }

    .info-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.82rem;
    }

    .info-label {
        color: var(--text-muted);
    }
    .info-value {
        color: var(--text-primary);
        font-weight: 600;
    }
    .info-separator {
        color: var(--text-muted);
    }

    /* Content */
    .content {
        flex: 1;
        max-width: 1280px;
        width: 100%;
        margin: 0 auto;
        padding: 32px 24px;
    }

    @media (max-width: 768px) {
        .nav-inner {
            padding: 0 12px;
            gap: 10px;
        }
        .tab-label {
            display: none;
        }
        .tab-icon {
            font-size: 16px;
        }
        .tab-btn {
            padding: 8px 10px;
        }
        .info-separator {
            display: none;
        }
        .content {
            padding: 20px 16px;
        }
    }
</style>
