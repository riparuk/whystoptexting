<script lang="ts">
    import { onMount } from "svelte";
    import {
        Chart,
        BarController,
        BarElement,
        CategoryScale,
        LinearScale,
        Tooltip,
    } from "chart.js";
    import { type Message } from "../../lib/parser";

    Chart.register(
        BarController,
        BarElement,
        CategoryScale,
        LinearScale,
        Tooltip,
    );

    interface Props {
        messages: Message[];
        participants: string[];
        isGroup: boolean;
        dateRange: { start: Date; end: Date };
    }

    let { messages, participants, isGroup, dateRange }: Props = $props();

    // --- Date range filter ---
    const allMonthBuckets = $derived(() => {
        const keys = new Set<string>();
        for (const m of messages) {
            const k = `${m.date.getFullYear()}-${String(m.date.getMonth() + 1).padStart(2, "0")}`;
            keys.add(k);
        }
        return Array.from(keys).sort();
    });

    let startKey = $state("");
    let endKey = $state("");

    $effect(() => {
        const buckets = allMonthBuckets();
        if (buckets.length > 0 && !startKey) {
            startKey = buckets[0];
            endKey = buckets[buckets.length - 1];
        }
    });

    const filteredMessages = $derived(() => {
        if (!startKey && !endKey) return messages;
        return messages.filter((m) => {
            const k = `${m.date.getFullYear()}-${String(m.date.getMonth() + 1).padStart(2, "0")}`;
            return k >= (startKey || "") && k <= (endKey || "9999-99");
        });
    });

    const MAX_GAP_MS = 24 * 60 * 60 * 1000; // 24 hours threshold

    type StatItem = {
        key: string;
        avg: number;
        median: number;
        min: number;
        max: number;
        count: number;
        dist: number[];
    };

    let stats = $state<StatItem[] | null>(null);
    let isCalculating = $state(true);
    let worker: Worker | null = null;

    import { onDestroy } from "svelte";

    onMount(() => {
        worker = new Worker(new URL("../../lib/worker.ts", import.meta.url), {
            type: "module",
        });

        worker.onmessage = (e) => {
            if (e.data.type === "RESPONSE_TIME" && e.data.success) {
                // Formatting payload
                const byUser = e.data.result.byUser;
                const dists = e.data.result.dists ?? {
                    [`${participants[0]}→${participants[1]}`]: [0, 0, 0, 0, 0],
                    [`${participants[1]}→${participants[0]}`]: [0, 0, 0, 0, 0],
                };
                const formattedStats: StatItem[] = [];
                for (const [p, val] of Object.entries(byUser)) {
                    formattedStats.push({
                        key: p,
                        avg: val as number,
                        median: 0,
                        min: 0,
                        max: 0,
                        count: 0, // Incomplete worker payload handled soon.
                        dist: [0, 0, 0, 0, 0],
                    });
                }
                // (Wait, the worker implementation of response time needs full distribution arrays, so I'll need to overwrite response time logic entirely locally or move local logic directly to worker).
                // Moving all logic to worker is safer.

                // Let's rewrite the entire worker logic for response-time to match what the component needs.
                stats = e.data.result.stats || null;
                isCalculating = false;
            }
        };

        // Delay starting worker until filter bounds are resolved
    });

    $effect(() => {
        const msgs = filteredMessages();
        if (worker && msgs) {
            isCalculating = true;
            worker.postMessage({
                type: "RESPONSE_TIME",
                payload: { messages: msgs, participants, isGroup },
            });
        }
    });
    function normalizeName(name: string) {
        return name.startsWith("~ ") ? name.slice(2) : name;
    }

    function formatDuration(minutes: number) {
        if (minutes < 1) return `< 1 min`;
        if (minutes < 60) return `${Math.round(minutes)} min`;
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
    }

    function shortName(key: string) {
        return key
            .split("→")
            .map((n) => n.split(" ")[0])
            .join(" → ");
    }

    // -- Distribution chart --
    const DIST_LABELS = [
        "< 1 min",
        "1–5 min",
        "5–30 min",
        "30–60 min",
        "> 1 hr",
    ];

    let canvas1 = $state<HTMLCanvasElement | null>(null);
    let canvas2 = $state<HTMLCanvasElement | null>(null);
    let charts: (Chart | null)[] = [null, null];

    function buildCharts() {
        const s = stats;
        if (!s || s.length === 0) return;

        const canvases = [canvas1, canvas2];
        s.forEach((item, i) => {
            if (!canvases[i]) return;
            charts[i]?.destroy();
            charts[i] = new Chart(canvases[i]!, {
                type: "bar",
                data: {
                    labels: DIST_LABELS,
                    datasets: [
                        {
                            label: "Response count",
                            data: item.dist,
                            backgroundColor: [
                                "rgba(52, 211, 153, 0.7)",
                                "rgba(236, 72, 153, 0.8)",
                                "rgba(236, 72, 153, 0.6)",
                                "rgba(236, 72, 153, 0.4)",
                                "rgba(239, 68, 68, 0.6)",
                            ],
                            borderRadius: 6,
                            borderWidth: 0,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: "rgba(26,26,46,0.97)",
                            titleColor: "#f9a8d4",
                            bodyColor: "#a1a1c7",
                            borderColor: "rgba(236,72,153,0.3)",
                            borderWidth: 1,
                            callbacks: {
                                label: (ctx) => ` ${ctx.parsed.y} times`,
                            },
                        },
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { color: "#6b6b8e", font: { size: 11 } },
                        },
                        y: {
                            grid: { color: "rgba(255,255,255,0.04)" },
                            ticks: { color: "#6b6b8e", font: { size: 11 } },
                            beginAtZero: true,
                        },
                    },
                },
            });
        });
    }

    $effect(() => {
        const _ = stats;
        if ((canvas1 || canvas2) && !isCalculating) buildCharts();
    });

    onMount(() => {
        return () => {
            charts.forEach((c) => c?.destroy());
            worker?.terminate();
        };
    });
</script>

<div class="response-time">
    {#if isGroup}
        <!-- Not available for groups -->
        <div class="not-available glass-card">
            <div class="na-icon">🚫</div>
            <h3 class="na-title">Not available for group chats</h3>
            <p class="na-desc">
                Response Time feature can only be analyzed in <strong
                    >1-on-1</strong
                > chats, as in group conversations the order of replies cannot be
                clearly defined.
            </p>
        </div>
    {:else}
        <!-- Header -->
        <div class="section-header animate-fade-up">
            <div>
                <h2 class="section-title">⏱️ Response Time</h2>
                <p class="section-desc">
                    Average time to reply between {participants[0]?.split(
                        " ",
                    )[0]} and {participants[1]?.split(" ")[0]}
                </p>
            </div>

            <!-- Date range filter -->
            <div class="date-filter glass-card">
                <div class="filter-row">
                    <div class="filter-group">
                        <label class="filter-label" for="rt-start">From</label>
                        <input
                            id="rt-start"
                            type="month"
                            class="month-input"
                            bind:value={startKey}
                            min={allMonthBuckets()[0] ?? ""}
                            max={(endKey || allMonthBuckets().at(-1)) ?? ""}
                        />
                    </div>
                    <span class="filter-sep">—</span>
                    <div class="filter-group">
                        <label class="filter-label" for="rt-end">To</label>
                        <input
                            id="rt-end"
                            type="month"
                            class="month-input"
                            bind:value={endKey}
                            min={(startKey || allMonthBuckets()[0]) ?? ""}
                            max={allMonthBuckets().at(-1) ?? ""}
                        />
                    </div>
                    <button
                        class="reset-btn"
                        onclick={() => {
                            startKey = allMonthBuckets()[0] ?? "";
                            endKey = allMonthBuckets().at(-1) ?? "";
                        }}
                    >
                        Reset
                    </button>
                </div>
            </div>
        </div>

        {#if isCalculating}
            <div class="empty glass-card">
                <div class="spinner" style="margin: 0 auto 16px;"></div>
                <p>Measuring reply speed...</p>
            </div>
        {:else if !stats || stats.length === 0}
            <div class="empty glass-card">
                <p>Not enough data to calculate response time in this range.</p>
            </div>
        {:else}
            <!-- Summary cards -->
            <div
                class="summary-cards animate-fade-up"
                style="animation-delay: 0.05s"
            >
                {#each stats! as item, i}
                    <div class="summary-card glass-card">
                        <div class="direction-label">{shortName(item.key)}</div>
                        <div class="avg-time gradient-text">
                            {formatDuration(item.avg)}
                        </div>
                        <div class="avg-sub">average</div>

                        <div class="meta-grid">
                            <div class="meta-item">
                                <div class="meta-label">Median</div>
                                <div class="meta-value">
                                    {formatDuration(item.median)}
                                </div>
                            </div>
                            <div class="meta-item">
                                <div class="meta-label">Fastest</div>
                                <div class="meta-value" style="color: #34d399">
                                    {formatDuration(item.min)}
                                </div>
                            </div>
                            <div class="meta-item">
                                <div class="meta-label">Slowest</div>
                                <div class="meta-value" style="color: #f87171">
                                    {formatDuration(item.max)}
                                </div>
                            </div>
                            <div class="meta-item">
                                <div class="meta-label">Samples</div>
                                <div class="meta-value">
                                    {item.count.toLocaleString("en-US")}
                                </div>
                            </div>
                        </div>
                    </div>
                {/each}
            </div>

            <!-- Distribution charts -->
            <div
                class="charts-grid animate-fade-up"
                style="animation-delay: 0.1s"
            >
                {#each stats! as item, i}
                    <div class="chart-card glass-card">
                        <div class="chart-title">
                            Response Time Distribution — {shortName(item.key)}
                        </div>
                        <div class="chart-wrap">
                            {#if i === 0}
                                <canvas bind:this={canvas1}></canvas>
                            {:else}
                                <canvas bind:this={canvas2}></canvas>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>

            <!-- Interpretation note -->
            <div
                class="note-card glass-card animate-fade-up"
                style="animation-delay: 0.15s"
            >
                <span class="note-icon">💡</span>
                <p class="note-text">
                    Only measures reply time when the sender changes. Gaps
                    larger than <strong>24 hours</strong> are considered new conversations
                    and are excluded.
                </p>
            </div>
        {/if}
    {/if}
</div>

<style>
    .response-time {
        display: flex;
        flex-direction: column;
        gap: 24px;
    }

    /* Not available */
    .not-available {
        padding: 64px 32px;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
    }

    .na-icon {
        font-size: 3rem;
    }

    .na-title {
        font-size: 1.2rem;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
    }

    .na-desc {
        color: var(--text-secondary);
        font-size: 0.9rem;
        max-width: 480px;
        line-height: 1.6;
        margin: 0;
    }

    .na-desc strong {
        color: var(--pink-300);
    }

    /* Header */
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

    /* Date filter */
    .date-filter {
        padding: 14px 18px;
    }

    .filter-row {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
    }

    .filter-group {
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

    .month-input {
        background: var(--bg-secondary);
        border: 1px solid var(--border-subtle);
        border-radius: 8px;
        color: var(--text-primary);
        font-size: 0.85rem;
        font-family: inherit;
        padding: 6px 10px;
        outline: none;
        transition: border-color 0.2s;
    }

    .month-input:focus {
        border-color: var(--pink-500);
    }
    .month-input::-webkit-calendar-picker-indicator {
        filter: invert(60%) sepia(50%) saturate(800%) hue-rotate(280deg);
        cursor: pointer;
    }

    .filter-sep {
        color: var(--text-muted);
        padding-top: 16px;
    }

    .reset-btn {
        margin-top: 16px;
        padding: 6px 12px;
        border-radius: 7px;
        border: 1px solid var(--border-subtle);
        background: transparent;
        color: var(--text-secondary);
        font-size: 0.8rem;
        font-family: inherit;
        cursor: pointer;
        transition: all 0.2s;
    }

    .reset-btn:hover {
        border-color: var(--border-pink);
        color: var(--pink-300);
    }

    /* Summary cards */
    .summary-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 20px;
    }

    .summary-card {
        padding: 28px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .direction-label {
        font-size: 0.82rem;
        font-weight: 700;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.06em;
    }

    .avg-time {
        font-size: 2.4rem;
        font-weight: 800;
        letter-spacing: -0.02em;
        line-height: 1;
    }

    .avg-sub {
        font-size: 0.78rem;
        color: var(--text-muted);
        margin-bottom: 8px;
    }

    .meta-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
        margin-top: 8px;
        padding-top: 16px;
        border-top: 1px solid var(--border-subtle);
    }

    .meta-item {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .meta-label {
        font-size: 0.7rem;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }

    .meta-value {
        font-size: 0.88rem;
        font-weight: 600;
        color: var(--text-primary);
    }

    /* Charts */
    .charts-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 20px;
    }

    .chart-card {
        padding: 20px;
    }

    .chart-title {
        font-size: 0.82rem;
        font-weight: 600;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 16px;
    }

    .chart-wrap {
        height: 220px;
        position: relative;
    }

    /* Note */
    .note-card {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 16px 20px;
    }

    .note-icon {
        font-size: 1.1rem;
        flex-shrink: 0;
        margin-top: 1px;
    }

    .note-text {
        color: var(--text-secondary);
        font-size: 0.85rem;
        margin: 0;
        line-height: 1.6;
    }

    .note-text strong {
        color: var(--pink-300);
    }

    .empty {
        padding: 40px;
        text-align: center;
        color: var(--text-muted);
        font-size: 0.9rem;
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
