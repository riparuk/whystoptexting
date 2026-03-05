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

    // --- Response time calculation ---
    // For each pair (A→B), find where sender switched, measure gap from last A msg to first B msg
    const MAX_GAP_MS = 24 * 60 * 60 * 1000; // 24 hours threshold

    const stats = $derived(() => {
        const msgs = filteredMessages();
        if (msgs.length < 2 || participants.length !== 2) return null;

        const [p1, p2] = participants;

        // Pairs: p1->p2 and p2->p1
        const gaps: Record<string, number[]> = {
            [`${p1}→${p2}`]: [],
            [`${p2}→${p1}`]: [],
        };
        const distribution: Record<string, number[]> = {
            [`${p1}→${p2}`]: [0, 0, 0, 0, 0],
            [`${p2}→${p1}`]: [0, 0, 0, 0, 0],
        };

        let blockStart = 0;
        for (let i = 1; i < msgs.length; i++) {
            const prev = msgs[i - 1];
            const curr = msgs[i];
            const gapMs = curr.date.getTime() - prev.date.getTime();

            // New conversation block if gap > threshold
            if (gapMs > MAX_GAP_MS) {
                blockStart = i;
                continue;
            }

            if (prev.sender !== curr.sender) {
                // Find the last message from sender change
                // Walk back to find last msg of prev sender in current block
                let lastPrevIdx = i - 1;
                while (
                    lastPrevIdx > blockStart &&
                    msgs[lastPrevIdx].sender !== prev.sender
                ) {
                    lastPrevIdx--;
                }

                // Walk forward to find first msg of new sender
                const delta =
                    curr.date.getTime() - msgs[lastPrevIdx].date.getTime();
                if (delta > 0 && delta <= MAX_GAP_MS) {
                    const senderNorm = normalizeName(prev.sender);
                    const recvNorm = normalizeName(curr.sender);
                    const key = `${senderNorm}→${recvNorm}`;
                    const flip = `${recvNorm}→${senderNorm}`;

                    const targetKey =
                        gaps[key] !== undefined
                            ? key
                            : gaps[flip] !== undefined
                              ? flip
                              : null;
                    if (targetKey) {
                        const deltaMin = delta / 60000;
                        gaps[targetKey].push(deltaMin);

                        // Bucket: <1, 1-5, 5-30, 30-60, >60
                        const d = distribution[targetKey];
                        if (deltaMin < 1) d[0]++;
                        else if (deltaMin < 5) d[1]++;
                        else if (deltaMin < 30) d[2]++;
                        else if (deltaMin < 60) d[3]++;
                        else d[4]++;
                    }
                }
            }
        }

        const result: {
            key: string;
            avg: number;
            median: number;
            min: number;
            max: number;
            count: number;
            dist: number[];
        }[] = [];
        for (const [key, arr] of Object.entries(gaps)) {
            if (arr.length === 0) continue;
            const sorted = [...arr].sort((a, b) => a - b);
            result.push({
                key,
                avg: arr.reduce((s, v) => s + v, 0) / arr.length,
                median: sorted[Math.floor(sorted.length / 2)],
                min: sorted[0],
                max: sorted[sorted.length - 1],
                count: arr.length,
                dist: distribution[key],
            });
        }
        return result;
    });

    function normalizeName(name: string) {
        return name.startsWith("~ ") ? name.slice(2) : name;
    }

    function formatDuration(minutes: number) {
        if (minutes < 1) return `< 1 menit`;
        if (minutes < 60) return `${Math.round(minutes)} menit`;
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return m > 0 ? `${h} jam ${m} menit` : `${h} jam`;
    }

    function shortName(key: string) {
        return key
            .split("→")
            .map((n) => n.split(" ")[0])
            .join(" → ");
    }

    // -- Distribution chart --
    const DIST_LABELS = [
        "< 1 mnt",
        "1–5 mnt",
        "5–30 mnt",
        "30–60 mnt",
        "> 1 jam",
    ];

    let canvas1 = $state<HTMLCanvasElement | null>(null);
    let canvas2 = $state<HTMLCanvasElement | null>(null);
    let charts: (Chart | null)[] = [null, null];

    function buildCharts() {
        const s = stats();
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
                            label: "Jumlah respons",
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
                                label: (ctx) => ` ${ctx.parsed.y} kali`,
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
        const _ = stats();
        if (canvas1 || canvas2) buildCharts();
    });

    onMount(() => {
        buildCharts();
        return () => charts.forEach((c) => c?.destroy());
    });
</script>

<div class="response-time">
    {#if isGroup}
        <!-- Not available for groups -->
        <div class="not-available glass-card">
            <div class="na-icon">🚫</div>
            <h3 class="na-title">Tidak tersedia untuk chat grup</h3>
            <p class="na-desc">
                Fitur Response Time hanya dapat dianalisis pada chat <strong
                    >1-on-1</strong
                >, karena pada percakapan grup urutan balas-membalas tidak bisa
                didefinisikan dengan jelas.
            </p>
        </div>
    {:else}
        <!-- Header -->
        <div class="section-header animate-fade-up">
            <div>
                <h2 class="section-title">⏱️ Response Time</h2>
                <p class="section-desc">
                    Rata-rata waktu membalas pesan antara {participants[0]?.split(
                        " ",
                    )[0]} dan {participants[1]?.split(" ")[0]}
                </p>
            </div>

            <!-- Date range filter -->
            <div class="date-filter glass-card">
                <div class="filter-row">
                    <div class="filter-group">
                        <label class="filter-label" for="rt-start">Dari</label>
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
                        <label class="filter-label" for="rt-end">Sampai</label>
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

        {#if !stats() || stats()!.length === 0}
            <div class="empty glass-card">
                <p>
                    Tidak cukup data untuk menghitung response time pada rentang
                    ini.
                </p>
            </div>
        {:else}
            <!-- Summary cards -->
            <div
                class="summary-cards animate-fade-up"
                style="animation-delay: 0.05s"
            >
                {#each stats()! as item, i}
                    <div class="summary-card glass-card">
                        <div class="direction-label">{shortName(item.key)}</div>
                        <div class="avg-time gradient-text">
                            {formatDuration(item.avg)}
                        </div>
                        <div class="avg-sub">rata-rata</div>

                        <div class="meta-grid">
                            <div class="meta-item">
                                <div class="meta-label">Median</div>
                                <div class="meta-value">
                                    {formatDuration(item.median)}
                                </div>
                            </div>
                            <div class="meta-item">
                                <div class="meta-label">Tercepat</div>
                                <div class="meta-value" style="color: #34d399">
                                    {formatDuration(item.min)}
                                </div>
                            </div>
                            <div class="meta-item">
                                <div class="meta-label">Terlama</div>
                                <div class="meta-value" style="color: #f87171">
                                    {formatDuration(item.max)}
                                </div>
                            </div>
                            <div class="meta-item">
                                <div class="meta-label">Sampel</div>
                                <div class="meta-value">
                                    {item.count.toLocaleString("id-ID")}
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
                {#each stats()! as item, i}
                    <div class="chart-card glass-card">
                        <div class="chart-title">
                            Distribusi Waktu Balas — {shortName(item.key)}
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
                    Hanya menghitung waktu balas saat pengirim berganti. Gap
                    lebih dari <strong>24 jam</strong> dianggap percakapan baru dan
                    tidak dihitung.
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
</style>
