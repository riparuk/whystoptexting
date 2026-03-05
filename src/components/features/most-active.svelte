<script lang="ts">
    import { onMount } from "svelte";
    import {
        Chart,
        BarController,
        BarElement,
        CategoryScale,
        LinearScale,
        Tooltip,
        Legend,
    } from "chart.js";
    import { type Message } from "../../lib/parser";

    Chart.register(
        BarController,
        BarElement,
        CategoryScale,
        LinearScale,
        Tooltip,
        Legend,
    );

    interface Props {
        messages: Message[];
        participants: string[];
        dateRange: { start: Date; end: Date };
    }

    let { messages, participants, dateRange }: Props = $props();

    let counts = $state<{ name: string; count: number; rank: number }[]>([]);
    let totalMessages = $derived(messages.length);
    let isCalculating = $state(true);

    let worker: Worker | null = null;
    import { onDestroy } from "svelte";

    onMount(() => {
        worker = new Worker(new URL("../../lib/worker.ts", import.meta.url), {
            type: "module",
        });

        worker.onmessage = (e) => {
            if (e.data.type === "MOST_ACTIVE" && e.data.success) {
                counts = e.data.result.counts;
                totalMessages = e.data.result.totalMessages;
                isCalculating = false;
            }
        };

        worker.postMessage({
            type: "MOST_ACTIVE",
            payload: { messages, participants },
        });

        buildChart();
        return () => {
            chartInstance?.destroy();
            worker?.terminate();
        };
    });

    // Filter options based on participant count
    const filterOptions = $derived(() => {
        const n = counts.length;
        const opts: number[] = [];
        if (n >= 3) opts.push(3);
        if (n >= 5) opts.push(5);
        if (n >= 10) opts.push(10);
        if (!opts.includes(n)) opts.push(n);
        return opts;
    });

    let selectedTop = $state(0); // 0 means "auto" = first option

    const activeFilter = $derived(() => {
        const opts = filterOptions();
        if (opts.length === 0) return counts.length;
        return opts[selectedTop] ?? opts[0];
    });

    const displayed = $derived(() => counts.slice(0, activeFilter()));

    // --- Chart ---
    let canvasEl = $state<HTMLCanvasElement | null>(null);
    let chartInstance: Chart | null = null;

    function formatDate(d: Date) {
        return d.toLocaleDateString("id-ID", {
            day: "numeric",
            month: "long",
            year: "numeric",
        });
    }

    function getRankEmoji(rank: number) {
        if (rank === 1) return "🥇";
        if (rank === 2) return "🥈";
        if (rank === 3) return "🥉";
        return `#${rank}`;
    }

    function percentage(count: number) {
        return totalMessages > 0
            ? ((count / totalMessages) * 100).toFixed(1)
            : "0";
    }

    function buildChart() {
        if (!canvasEl) return;
        if (chartInstance) chartInstance.destroy();

        const items = displayed();
        const labels = items.map((d) =>
            d.name.length > 18 ? d.name.slice(0, 16) + "…" : d.name,
        );
        const data = items.map((d) => d.count);

        chartInstance = new Chart(canvasEl, {
            type: "bar",
            data: {
                labels,
                datasets: [
                    {
                        label: "Jumlah Pesan",
                        data,
                        backgroundColor: items.map((_, i) => {
                            const opacity = 1 - (i / items.length) * 0.4;
                            return `rgba(236, 72, 153, ${opacity})`;
                        }),
                        borderColor: items.map((_, i) => {
                            const opacity = 1 - (i / items.length) * 0.3;
                            return `rgba(219, 39, 119, ${opacity})`;
                        }),
                        borderWidth: 1,
                        borderRadius: 6,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: "y",
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "rgba(26, 26, 46, 0.95)",
                        titleColor: "#f9a8d4",
                        bodyColor: "#a1a1c7",
                        borderColor: "rgba(236, 72, 153, 0.3)",
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: (ctx) => {
                                const val = (ctx.parsed.x as number) ?? 0;
                                return ` ${val.toLocaleString("id-ID")} pesan (${percentage(val)}%)`;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        grid: { color: "rgba(255,255,255,0.05)" },
                        ticks: { color: "#6b6b8e", font: { size: 12 } },
                    },
                    y: {
                        grid: { display: false },
                        ticks: {
                            color: "#a1a1c7",
                            font: { size: 12, weight: "bold" },
                        },
                    },
                },
            },
        });
    }

    $effect(() => {
        // Re-render chart when displayed data changes
        const _ = displayed();
        if (canvasEl && !isCalculating) {
            buildChart();
        }
    });
</script>

<div class="most-active">
    <!-- Header -->
    <div class="section-header animate-fade-up">
        <div class="header-left">
            <h2 class="section-title">👑 Siapa Paling Aktif?</h2>
            <p class="section-desc">
                Berdasarkan total pesan dari <strong
                    >{formatDate(dateRange.start)}</strong
                >
                sampai <strong>{formatDate(dateRange.end)}</strong>
            </p>
        </div>
        <!-- Filter buttons -->
        {#if filterOptions().length > 1}
            <div class="filter-group">
                {#each filterOptions() as opt, i}
                    <button
                        class="filter-btn"
                        class:active={selectedTop === i}
                        onclick={() => (selectedTop = i)}
                    >
                        Top {opt}
                    </button>
                {/each}
            </div>
        {/if}
    </div>

    <div class="content-grid">
        <!-- Ranking cards -->
        <div class="ranking-list">
            {#each displayed() as item, i}
                <div
                    class="rank-card glass-card animate-fade-up"
                    style="animation-delay: {i * 0.06}s"
                >
                    <div
                        class="rank-badge"
                        class:gold={item.rank === 1}
                        class:silver={item.rank === 2}
                        class:bronze={item.rank === 3}
                    >
                        {getRankEmoji(item.rank)}
                    </div>
                    <div class="rank-info">
                        <div class="rank-name">{item.name}</div>
                        <div class="rank-bar-wrapper">
                            <div
                                class="rank-bar"
                                style="width: {counts.length > 0
                                    ? (item.count / counts[0].count) * 100
                                    : 0}%"
                            ></div>
                        </div>
                    </div>
                    <div class="rank-stats">
                        <div class="rank-count">
                            {item.count.toLocaleString("id-ID")}
                        </div>
                        <div class="rank-pct">{percentage(item.count)}%</div>
                    </div>
                </div>
            {/each}
        </div>

        <!-- Chart -->
        <div
            class="chart-card glass-card animate-fade-up"
            style="animation-delay: 0.2s"
        >
            <div class="chart-title">Perbandingan Jumlah Pesan</div>
            {#if isCalculating}
                <div class="calculating-overlay">
                    <div class="spinner"></div>
                    <p style="text-align:center; color: var(--text-muted)">
                        Menghitung akumulasi pesan...
                    </p>
                </div>
            {:else}
                <div class="chart-wrap">
                    <canvas bind:this={canvasEl}></canvas>
                </div>
            {/if}
        </div>
    </div>

    <!-- Summary stats -->
    <div class="stats-row animate-fade-up" style="animation-delay: 0.3s">
        <div class="stat-card glass-card">
            <div class="stat-label">Total Pesan</div>
            <div class="stat-value gradient-text">
                {totalMessages.toLocaleString("id-ID")}
            </div>
        </div>
        <div class="stat-card glass-card">
            <div class="stat-label">Peserta Aktif</div>
            <div class="stat-value gradient-text">{counts.length}</div>
        </div>
        <div class="stat-card glass-card">
            <div class="stat-label">Rata-rata / Orang</div>
            <div class="stat-value gradient-text">
                {counts.length > 0
                    ? Math.round(totalMessages / counts.length).toLocaleString(
                          "id-ID",
                      )
                    : 0}
            </div>
        </div>
        <div class="stat-card glass-card">
            <div
                class="stat-value gradient-text"
                style="font-size: 1rem; truncate: ellipsis"
            >
                {counts[0]?.name.split(" ")[0] ?? "-"}
            </div>
        </div>
    </div>
</div>

<style>
    .most-active {
        display: flex;
        flex-direction: column;
        gap: 24px;
    }

    .section-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
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
        line-height: 1.5;
    }

    .section-desc strong {
        color: var(--pink-300);
        font-weight: 600;
    }

    .filter-group {
        display: flex;
        gap: 6px;
        flex-shrink: 0;
    }

    .filter-btn {
        padding: 6px 14px;
        border-radius: 8px;
        border: 1px solid var(--border-subtle);
        background: transparent;
        color: var(--text-secondary);
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        font-family: inherit;
    }

    .filter-btn:hover {
        border-color: var(--border-pink);
        color: var(--pink-300);
    }

    .filter-btn.active {
        background: rgba(236, 72, 153, 0.15);
        border-color: rgba(236, 72, 153, 0.4);
        color: var(--pink-300);
    }

    /* Grid layout */
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

    /* Ranking cards */
    .ranking-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .rank-card {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px 18px;
    }

    .rank-badge {
        font-size: 1.4rem;
        min-width: 32px;
        text-align: center;
        color: var(--text-muted);
        font-weight: 700;
        font-size: 0.9rem;
    }

    .rank-badge.gold {
        color: #fbbf24;
        font-size: 1.4rem;
    }
    .rank-badge.silver {
        color: #94a3b8;
        font-size: 1.4rem;
    }
    .rank-badge.bronze {
        color: #cd7c3a;
        font-size: 1.4rem;
    }

    .rank-info {
        flex: 1;
        min-width: 0;
    }

    .rank-name {
        font-size: 0.95rem;
        font-weight: 600;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 6px;
    }

    .rank-bar-wrapper {
        height: 4px;
        background: rgba(255, 255, 255, 0.06);
        border-radius: 2px;
        overflow: hidden;
    }

    .rank-bar {
        height: 100%;
        background: linear-gradient(90deg, var(--pink-600), var(--pink-400));
        border-radius: 2px;
        transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .rank-stats {
        text-align: right;
        flex-shrink: 0;
    }

    .rank-count {
        font-size: 1rem;
        font-weight: 700;
        color: var(--text-primary);
    }

    .rank-pct {
        font-size: 0.78rem;
        color: var(--text-muted);
        margin-top: 2px;
    }

    /* Chart */
    .chart-card {
        padding: 20px;
    }

    .chart-title {
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 16px;
    }

    .chart-wrap {
        height: 320px;
        position: relative;
    }

    .calculating-overlay {
        height: 320px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }

    .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid rgba(236, 72, 153, 0.2);
        border-top-color: var(--pink-500);
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 12px;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    /* Stats row */
    .stats-row {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;
    }

    @media (max-width: 640px) {
        .stats-row {
            grid-template-columns: repeat(2, 1fr);
        }
    }

    .stat-card {
        padding: 20px;
        text-align: center;
    }

    .stat-label {
        font-size: 0.78rem;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 6px;
    }

    .stat-value {
        font-size: 1.8rem;
        font-weight: 800;
        letter-spacing: -0.02em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
