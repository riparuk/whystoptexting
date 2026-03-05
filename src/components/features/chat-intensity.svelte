<script lang="ts">
    import { onMount } from "svelte";
    import {
        Chart,
        LineController,
        LineElement,
        BarController,
        BarElement,
        PointElement,
        CategoryScale,
        LinearScale,
        Filler,
        Tooltip,
        Legend,
    } from "chart.js";
    import { type Message } from "../../lib/parser";

    Chart.register(
        LineController,
        LineElement,
        BarController,
        BarElement,
        PointElement,
        CategoryScale,
        LinearScale,
        Filler,
        Tooltip,
        Legend,
    );

    interface Props {
        messages: Message[];
        dateRange: { start: Date; end: Date };
    }

    let { messages, dateRange }: Props = $props();

    // Build all year-month buckets from the data
    const allMonthBuckets = $derived(() => {
        const map: Record<string, number> = {};
        for (const msg of messages) {
            const key = `${msg.date.getFullYear()}-${String(msg.date.getMonth() + 1).padStart(2, "0")}`;
            map[key] = (map[key] || 0) + 1;
        }
        // Sort keys chronologically
        return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
    });

    const allYears = $derived(() => {
        const years = new Set<number>();
        for (const [key] of allMonthBuckets()) {
            years.add(parseInt(key.split("-")[0]));
        }
        return Array.from(years).sort((a, b) => a - b);
    });

    // Range state
    let startKey = $state("");
    let endKey = $state("");

    // Initialize range to full data range on mount
    $effect(() => {
        const buckets = allMonthBuckets();
        if (buckets.length > 0 && !startKey) {
            startKey = buckets[0][0];
            endKey = buckets[buckets.length - 1][0];
        }
    });

    type ChartType = "line" | "bar";
    let chartType = $state<ChartType>("bar");

    const filteredBuckets = $derived(() => {
        return allMonthBuckets().filter(([key]) => {
            return (!startKey || key >= startKey) && (!endKey || key <= endKey);
        });
    });

    function formatMonthKey(key: string) {
        const [year, month] = key.split("-");
        const d = new Date(parseInt(year), parseInt(month) - 1, 1);
        return d.toLocaleDateString("id-ID", {
            month: "short",
            year: "2-digit",
        });
    }

    function formatMonthLong(key: string) {
        const [year, month] = key.split("-");
        const d = new Date(parseInt(year), parseInt(month) - 1, 1);
        return d.toLocaleDateString("id-ID", {
            month: "long",
            year: "numeric",
        });
    }

    // Trend: compare to previous period
    const trendInfo = $derived(() => {
        const buckets = filteredBuckets();
        if (buckets.length < 2) return null;
        const half = Math.floor(buckets.length / 2);
        const firstHalf = buckets.slice(0, half).reduce((s, [, v]) => s + v, 0);
        const secondHalf = buckets.slice(half).reduce((s, [, v]) => s + v, 0);
        const pct =
            firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0;
        return { pct: Math.round(pct), up: secondHalf >= firstHalf };
    });

    const peakMonth = $derived(() => {
        const buckets = filteredBuckets();
        if (buckets.length === 0) return null;
        return buckets.reduce((max, cur) => (cur[1] > max[1] ? cur : max));
    });

    const totalInRange = $derived(
        filteredBuckets().reduce((s, [, v]) => s + v, 0),
    );

    // Conversation Gaps: top 5 longest silences
    const topGaps = $derived(() => {
        const msgs = messages;
        if (msgs.length < 2) return [];
        const gaps: { start: Date; end: Date; days: number }[] = [];
        for (let i = 1; i < msgs.length; i++) {
            const delta = msgs[i].date.getTime() - msgs[i - 1].date.getTime();
            const days = delta / (1000 * 60 * 60 * 24);
            if (days >= 1) {
                gaps.push({ start: msgs[i - 1].date, end: msgs[i].date, days });
            }
        }
        return gaps.sort((a, b) => b.days - a.days).slice(0, 5);
    });

    function fmtGapDate(d: Date) {
        return d.toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
    }

    // Chart
    let canvasEl = $state<HTMLCanvasElement | null>(null);
    let chartInstance: Chart | null = null;

    function buildChart() {
        if (!canvasEl) return;
        if (chartInstance) chartInstance.destroy();

        const buckets = filteredBuckets();
        if (buckets.length === 0) return;

        const labels = buckets.map(([k]) => formatMonthKey(k));
        const data = buckets.map(([, v]) => v);

        const pink500 = "rgb(236, 72, 153)";
        const pink700 = "rgb(190, 24, 93)";

        const gradientFn = (ctx: CanvasRenderingContext2D, chartArea: any) => {
            const gradient = ctx.createLinearGradient(
                0,
                chartArea.top,
                0,
                chartArea.bottom,
            );
            gradient.addColorStop(0, "rgba(236, 72, 153, 0.4)");
            gradient.addColorStop(1, "rgba(236, 72, 153, 0.02)");
            return gradient;
        };

        const isLine = chartType === "line";

        chartInstance = new Chart(canvasEl, {
            type: chartType,
            data: {
                labels,
                datasets: [
                    {
                        label: "Jumlah Pesan",
                        data,
                        backgroundColor: isLine
                            ? (ctx: any) => {
                                  const chart = ctx.chart;
                                  const { ctx: c, chartArea } = chart;
                                  if (!chartArea) return "rgba(236,72,153,0.3)";
                                  return gradientFn(c, chartArea);
                              }
                            : data.map((v, i) => {
                                  // Highlight peak month
                                  const max = Math.max(...data);
                                  return v === max
                                      ? "rgba(236,72,153,0.9)"
                                      : "rgba(236,72,153,0.45)";
                              }),
                        borderColor: pink500,
                        borderWidth: isLine ? 2 : 1,
                        pointBackgroundColor: pink500,
                        pointBorderColor: "#0d0d14",
                        pointBorderWidth: 2,
                        pointRadius: isLine ? 4 : 0,
                        pointHoverRadius: 6,
                        fill: isLine,
                        tension: 0.4,
                        borderRadius: isLine ? 0 : 6,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "rgba(26, 26, 46, 0.97)",
                        titleColor: "#f9a8d4",
                        bodyColor: "#a1a1c7",
                        borderColor: "rgba(236, 72, 153, 0.3)",
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            title: (items) => {
                                const idx = items[0]?.dataIndex;
                                return formatMonthLong(buckets[idx]?.[0] ?? "");
                            },
                            label: (ctx) =>
                                ` ${(ctx.parsed.y ?? 0).toLocaleString("id-ID")} pesan`,
                        },
                    },
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: "#6b6b8e",
                            font: { size: 11 },
                            maxRotation: 45,
                            autoSkip: true,
                            maxTicksLimit: 18,
                        },
                    },
                    y: {
                        grid: { color: "rgba(255,255,255,0.04)" },
                        ticks: { color: "#6b6b8e", font: { size: 11 } },
                        beginAtZero: true,
                    },
                },
            },
        });
    }

    $effect(() => {
        const _ = filteredBuckets();
        const __ = chartType;
        if (canvasEl) buildChart();
    });

    onMount(() => {
        buildChart();
        return () => chartInstance?.destroy();
    });
</script>

<div class="chat-intensity">
    <!-- Header -->
    <div class="section-header animate-fade-up">
        <div>
            <h2 class="section-title">📈 Intensitas Chat</h2>
            <p class="section-desc">Pola dan tren pesan berdasarkan waktu</p>
        </div>
    </div>

    <!-- Controls -->
    <div
        class="controls-row animate-fade-up glass-card"
        style="animation-delay: 0.05s"
    >
        <div class="control-group">
            <label class="control-label" for="start-month">Dari</label>
            <input
                id="start-month"
                type="month"
                class="month-input"
                bind:value={startKey}
                min={allMonthBuckets()[0]?.[0] ?? ""}
                max={(endKey || allMonthBuckets().at(-1)?.[0]) ?? ""}
            />
        </div>
        <div class="control-separator">—</div>
        <div class="control-group">
            <label class="control-label" for="end-month">Sampai</label>
            <input
                id="end-month"
                type="month"
                class="month-input"
                bind:value={endKey}
                min={(startKey || allMonthBuckets()[0]?.[0]) ?? ""}
                max={allMonthBuckets().at(-1)?.[0] ?? ""}
            />
        </div>
        <div class="control-sep-vert"></div>
        <div class="chart-type-group">
            <button
                class="chart-type-btn"
                class:active={chartType === "bar"}
                onclick={() => (chartType = "bar")}
                title="Bar chart">▐▌</button
            >
            <button
                class="chart-type-btn"
                class:active={chartType === "line"}
                onclick={() => (chartType = "line")}
                title="Line chart">〜</button
            >
        </div>
        <button
            class="reset-range-btn"
            onclick={() => {
                startKey = allMonthBuckets()[0]?.[0] ?? "";
                endKey = allMonthBuckets().at(-1)?.[0] ?? "";
            }}
        >
            Reset Range
        </button>
    </div>

    <!-- Chart -->
    <div
        class="chart-card glass-card animate-fade-up"
        style="animation-delay: 0.1s"
    >
        {#if filteredBuckets().length === 0}
            <div class="empty-chart">
                Tidak ada data untuk rentang yang dipilih
            </div>
        {:else}
            <div class="chart-wrap">
                <canvas bind:this={canvasEl}></canvas>
            </div>
        {/if}
    </div>

    <!-- Stats row -->
    <div class="stats-row animate-fade-up" style="animation-delay: 0.2s">
        <div class="stat-card glass-card">
            <div class="stat-label">Total Pesan (periode ini)</div>
            <div class="stat-value gradient-text">
                {totalInRange.toLocaleString("id-ID")}
            </div>
        </div>
        <div class="stat-card glass-card">
            <div class="stat-label">Jumlah Bulan</div>
            <div class="stat-value gradient-text">
                {filteredBuckets().length}
            </div>
        </div>
        <div class="stat-card glass-card">
            <div class="stat-label">Rata-rata / Bulan</div>
            <div class="stat-value gradient-text">
                {filteredBuckets().length > 0
                    ? Math.round(
                          totalInRange / filteredBuckets().length,
                      ).toLocaleString("id-ID")
                    : 0}
            </div>
        </div>
        <div class="stat-card glass-card">
            <div class="stat-label">Bulan Tersibuk</div>
            <div
                class="stat-value gradient-text"
                style="font-size: 0.95rem; line-height: 1.3"
            >
                {#if peakMonth()}
                    {formatMonthLong(peakMonth()![0])}
                    <div class="stat-sub">
                        {peakMonth()![1].toLocaleString("id-ID")} pesan
                    </div>
                {:else}
                    -
                {/if}
            </div>
        </div>
        <div class="stat-card glass-card">
            <div class="stat-label">Tren Periode</div>
            <div
                class="stat-value"
                class:trend-up={trendInfo()?.up}
                class:trend-down={!trendInfo()?.up}
            >
                {#if trendInfo()}
                    {trendInfo()!.up ? "↑" : "↓"}
                    {Math.abs(trendInfo()!.pct)}%
                    <div class="stat-sub" style="color: var(--text-muted)">
                        {trendInfo()!.up ? "meningkat" : "menurun"}
                    </div>
                {:else}
                    -
                {/if}
            </div>
        </div>
    </div>

    <!-- Conversation Gap -->
    <div class="gap-section animate-fade-up" style="animation-delay: 0.25s">
        <h3 class="year-title">🕳️ Conversation Gap Terpanjang</h3>
        {#if topGaps().length === 0}
            <p style="color: var(--text-muted); font-size: 0.88rem;">
                Tidak ada gap signifikan.
            </p>
        {:else}
            <div class="gap-list">
                {#each topGaps() as gap, i}
                    <div class="gap-row glass-card">
                        <span class="gap-rank">#{i + 1}</span>
                        <span class="gap-dates"
                            >{fmtGapDate(gap.start)} → {fmtGapDate(
                                gap.end,
                            )}</span
                        >
                        <span class="gap-days">{Math.round(gap.days)} hari</span
                        >
                    </div>
                {/each}
            </div>
        {/if}
    </div>

    <!-- Year breakdown -->
    {#if allYears().length > 1}
        <div class="year-section animate-fade-up" style="animation-delay: 0.3s">
            <h3 class="year-title">Ringkasan per Tahun</h3>
            <div class="year-cards">
                {#each allYears() as year}
                    {@const yearBuckets = allMonthBuckets().filter(([k]) =>
                        k.startsWith(String(year)),
                    )}
                    {@const yearTotal = yearBuckets.reduce(
                        (s, [, v]) => s + v,
                        0,
                    )}
                    {@const maxYear = Math.max(
                        ...allYears().map((y) =>
                            allMonthBuckets()
                                .filter(([k]) => k.startsWith(String(y)))
                                .reduce((s, [, v]) => s + v, 0),
                        ),
                    )}
                    <div class="year-card glass-card">
                        <div class="year-label">{year}</div>
                        <div class="year-count gradient-text">
                            {yearTotal.toLocaleString("id-ID")}
                        </div>
                        <div class="year-bar-bg">
                            <div
                                class="year-bar"
                                style="width: {maxYear > 0
                                    ? (yearTotal / maxYear) * 100
                                    : 0}%"
                            ></div>
                        </div>
                        <div class="year-months">
                            {yearBuckets.length} bulan
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    {/if}
</div>

<style>
    .chat-intensity {
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
    }

    /* Controls */
    .controls-row {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 16px 20px;
        flex-wrap: wrap;
    }

    .control-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .control-label {
        font-size: 0.72rem;
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
        font-size: 0.88rem;
        font-family: inherit;
        padding: 7px 12px;
        outline: none;
        transition: border-color 0.2s;
        cursor: pointer;
    }

    .month-input:focus {
        border-color: var(--pink-500);
        box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.15);
    }

    .month-input::-webkit-calendar-picker-indicator {
        filter: invert(60%) sepia(50%) saturate(800%) hue-rotate(280deg);
        cursor: pointer;
    }

    .control-separator {
        color: var(--text-muted);
        font-size: 1.2rem;
        padding-top: 16px;
    }

    .control-sep-vert {
        width: 1px;
        height: 32px;
        background: var(--border-subtle);
        margin: 0 4px;
    }

    .chart-type-group {
        display: flex;
        gap: 4px;
    }

    .chart-type-btn {
        padding: 6px 12px;
        border-radius: 7px;
        border: 1px solid var(--border-subtle);
        background: transparent;
        color: var(--text-secondary);
        font-size: 1rem;
        cursor: pointer;
        transition: all 0.2s;
        font-family: inherit;
        line-height: 1;
    }

    .chart-type-btn:hover {
        border-color: var(--border-pink);
        color: var(--pink-300);
    }

    .chart-type-btn.active {
        background: rgba(236, 72, 153, 0.15);
        border-color: rgba(236, 72, 153, 0.4);
        color: var(--pink-300);
    }

    .reset-range-btn {
        padding: 7px 14px;
        border-radius: 8px;
        border: 1px solid var(--border-subtle);
        background: transparent;
        color: var(--text-secondary);
        font-size: 0.82rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        font-family: inherit;
        margin-left: auto;
    }

    .reset-range-btn:hover {
        border-color: var(--border-pink);
        color: var(--pink-300);
    }

    /* Chart */
    .chart-card {
        padding: 20px;
    }

    .chart-wrap {
        height: 360px;
        position: relative;
    }

    .empty-chart {
        height: 200px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-muted);
        font-size: 0.9rem;
    }

    /* Stats */
    .stats-row {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 16px;
    }

    @media (max-width: 900px) {
        .stats-row {
            grid-template-columns: repeat(3, 1fr);
        }
    }

    @media (max-width: 640px) {
        .stats-row {
            grid-template-columns: repeat(2, 1fr);
        }
    }

    .stat-card {
        padding: 18px;
        text-align: center;
    }

    .stat-label {
        font-size: 0.72rem;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 6px;
    }

    .stat-value {
        font-size: 1.6rem;
        font-weight: 800;
        letter-spacing: -0.02em;
    }

    .stat-sub {
        font-size: 0.72rem;
        font-weight: 400;
        margin-top: 2px;
        color: var(--text-muted);
    }

    .trend-up {
        color: #34d399;
    }
    .trend-down {
        color: #f87171;
    }

    /* Year breakdown */
    .year-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .year-title {
        font-size: 0.9rem;
        font-weight: 700;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin: 0;
    }

    .year-cards {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
    }

    .year-card {
        flex: 1;
        min-width: 120px;
        padding: 18px;
        text-align: center;
    }

    .year-label {
        font-size: 0.82rem;
        color: var(--text-muted);
        font-weight: 600;
        margin-bottom: 4px;
    }

    .year-count {
        font-size: 1.4rem;
        font-weight: 800;
        letter-spacing: -0.02em;
        margin-bottom: 8px;
    }

    .year-bar-bg {
        height: 4px;
        background: rgba(255, 255, 255, 0.06);
        border-radius: 2px;
        overflow: hidden;
        margin-bottom: 6px;
    }

    .year-bar {
        height: 100%;
        background: linear-gradient(90deg, var(--pink-700), var(--pink-400));
        border-radius: 2px;
        transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .year-months {
        font-size: 0.72rem;
        color: var(--text-muted);
    }

    /* Conversation Gap */
    .gap-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .gap-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .gap-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 18px;
    }

    .gap-rank {
        font-size: 0.78rem;
        color: var(--text-muted);
        font-weight: 700;
        width: 28px;
        flex-shrink: 0;
    }

    .gap-dates {
        flex: 1;
        font-size: 0.9rem;
        color: var(--text-primary);
        font-weight: 500;
    }

    .gap-days {
        font-size: 0.9rem;
        font-weight: 700;
        color: var(--pink-300);
        flex-shrink: 0;
    }
</style>
