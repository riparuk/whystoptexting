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
    const allDateBuckets = $derived(() => {
        const keys = new Set<string>();
        for (const m of messages) {
            const k = `${m.date.getFullYear()}-${String(m.date.getMonth() + 1).padStart(2, "0")}-${String(m.date.getDate()).padStart(2, "0")}`;
            keys.add(k);
        }
        return Array.from(keys).sort();
    });

    let startDate = $state("");
    let endDate = $state("");

    $effect(() => {
        const buckets = allDateBuckets();
        if (buckets.length > 0 && !startDate) {
            startDate = buckets[0];
            endDate = buckets[buckets.length - 1];
        }
    });

    const filteredMessages = $derived(() => {
        if (!startDate && !endDate) return messages;
        return messages.filter((m) => {
            const k = `${m.date.getFullYear()}-${String(m.date.getMonth() + 1).padStart(2, "0")}-${String(m.date.getDate()).padStart(2, "0")}`;
            return k >= (startDate || "") && k <= (endDate || "9999-99-99");
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

    const userStreaks = $derived.by(() => {
        const msgs = filteredMessages();
        const activeDaysPerUser = new Map<string, Set<string>>();

        for (const p of participants) {
            activeDaysPerUser.set(normalizeName(p), new Set());
        }

        if (msgs && msgs.length > 0) {
            for (const m of msgs) {
                const sender = normalizeName(m.sender);
                if (!activeDaysPerUser.has(sender)) {
                    activeDaysPerUser.set(sender, new Set());
                }
                const d = m.date;
                const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                activeDaysPerUser.get(sender)!.add(dateKey);
            }
        }

        const streaks: { name: string; streak: number }[] = [];

        for (const [p, daysSet] of activeDaysPerUser.entries()) {
            const sortedDays = Array.from(daysSet).sort();
            let maxStreak = 0;
            let currentStreak = 0;
            let lastDate: Date | null = null;

            for (const dayStr of sortedDays) {
                const parts = dayStr.split("-");
                const currDate = new Date(
                    Date.UTC(
                        Number(parts[0]),
                        Number(parts[1]) - 1,
                        Number(parts[2]),
                    ),
                );

                if (!lastDate) {
                    currentStreak = 1;
                } else {
                    const diff = Math.round(
                        (currDate.getTime() - lastDate.getTime()) /
                            (1000 * 60 * 60 * 24),
                    );
                    if (diff === 1) {
                        currentStreak++;
                    } else if (diff > 1) {
                        currentStreak = 1;
                    }
                }
                lastDate = currDate;
                if (currentStreak > maxStreak) {
                    maxStreak = currentStreak;
                }
            }
            streaks.push({ name: p, streak: maxStreak });
        }

        return streaks.sort((a, b) => b.streak - a.streak);
    });

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

    function getResponderLabel(item: StatItem) {
        const instantPct = Math.round((item.dist[0] / item.count) * 100);
        if (instantPct > 70)
            return { emoji: "⚡", text: "Instant responder", color: "#eab308" }; // yellow-500
        if (instantPct >= 40)
            return { emoji: "🟢", text: "Fast responder", color: "#22c55e" }; // green-500
        if (instantPct >= 20)
            return { emoji: "🟡", text: "Normal responder", color: "#facc15" }; // yellow-400
        return { emoji: "🐢", text: "Slow responder", color: "#9ca3af" }; // gray-400
    }

    // -- Distribution chart --
    const DIST_LABELS = [
        "< 1 min",
        "1–5 min",
        "5–30 min",
        "30–60 min",
        "> 1 hr",
    ];

    function chartAction(node: HTMLCanvasElement, item: StatItem) {
        const chart = new Chart(node, {
            type: "bar",
            data: {
                labels: DIST_LABELS,
                datasets: [
                    {
                        label: "Response count",
                        data: [...item.dist],
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

        return {
            update(newItem: StatItem) {
                chart.data.datasets[0].data = [...newItem.dist];
                chart.update();
            },
            destroy() {
                chart.destroy();
            },
        };
    }

    onMount(() => {
        return () => {
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

            <div class="date-filter glass-card">
                <div class="filter-row">
                    <div class="filter-group">
                        <label class="filter-label" for="rt-start">From</label>
                        <input
                            id="rt-start"
                            type="date"
                            class="date-input"
                            bind:value={startDate}
                            min={allDateBuckets()[0] ?? ""}
                            max={(endDate || allDateBuckets().at(-1)) ?? ""}
                        />
                    </div>
                    <span class="filter-sep">—</span>
                    <div class="filter-group">
                        <label class="filter-label" for="rt-end">To</label>
                        <input
                            id="rt-end"
                            type="date"
                            class="date-input"
                            bind:value={endDate}
                            min={(startDate || allDateBuckets()[0]) ?? ""}
                            max={allDateBuckets().at(-1) ?? ""}
                        />
                    </div>
                    <button
                        class="reset-btn"
                        onclick={() => {
                            startDate = allDateBuckets()[0] ?? "";
                            endDate = allDateBuckets().at(-1) ?? "";
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
            {#if userStreaks.length > 0}
                <!-- Streaks Section -->
                <div
                    class="streaks-row animate-fade-up"
                    style="animation-delay: 0.02s"
                >
                    {#each userStreaks as userStreak}
                        <div class="streak-pill glass-card">
                            <span class="fire-emoji">🔥</span>
                            <div class="streak-info">
                                <span class="streak-count"
                                    >{userStreak.streak} Days Streak</span
                                >
                                <span class="streak-name"
                                    >{userStreak.name}</span
                                >
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}

            <!-- Summary cards -->
            <div
                class="summary-cards animate-fade-up"
                style="animation-delay: 0.05s"
            >
                {#each stats! as item, i}
                    {@const label = getResponderLabel(item)}
                    {@const pct1m = Math.round(
                        (item.dist[0] / item.count) * 100,
                    )}
                    {@const pct5m = Math.round(
                        ((item.dist[0] + item.dist[1]) / item.count) * 100,
                    )}
                    <div class="summary-card glass-card">
                        <div class="direction-label">{shortName(item.key)}</div>

                        <div
                            class="responder-badge"
                            style="color: {label.color}"
                        >
                            {label.emoji}
                            {label.text}
                        </div>

                        <div
                            class="avg-time gradient-text"
                            style="font-size: 2.2rem; margin-top: 8px;"
                        >
                            {formatDuration(item.median)}
                        </div>
                        <div class="avg-sub" style="margin-bottom: 4px;">
                            Median response time
                        </div>

                        <!-- Behavioral breakdown -->
                        <div class="behavior-stats">
                            <div class="stat-row">
                                <span
                                    class="stat-dot"
                                    style="background: rgba(52, 211, 153, 0.7)"
                                ></span>
                                <span class="stat-text"
                                    ><strong>{pct1m}%</strong> replies under 1 min</span
                                >
                            </div>
                            <div class="stat-row">
                                <span
                                    class="stat-dot"
                                    style="background: rgba(236, 72, 153, 0.8)"
                                ></span>
                                <span class="stat-text"
                                    ><strong>{pct5m}%</strong> replies under 5 min</span
                                >
                            </div>
                            <div class="stat-row" style="margin-top: 4px;">
                                <span class="stat-note"
                                    >Average: {formatDuration(item.avg)}</span
                                >
                            </div>
                        </div>

                        <div class="meta-grid">
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
                {#each stats! as item}
                    <div class="chart-card glass-card">
                        <div class="chart-title">
                            Response Time Distribution — {shortName(item.key)}
                        </div>
                        <div class="chart-wrap">
                            <canvas use:chartAction={item}></canvas>
                        </div>
                    </div>
                {/each}
            </div>

            <!-- Legend and Interpretation note -->
            <div
                class="note-card glass-card animate-fade-up"
                style="animation-delay: 0.15s; flex-direction: column; gap: 16px;"
            >
                <div style="display: flex; align-items: flex-start; gap: 12px;">
                    <span class="note-icon">💡</span>
                    <p class="note-text">
                        Only measures reply time when the sender changes. Gaps
                        larger than <strong>24 hours</strong> are considered new
                        conversations and are excluded.
                    </p>
                </div>

                <div class="legend-box">
                    <div class="legend-title">Responder Profiling Guide:</div>
                    <div class="legend-grid">
                        <div class="legend-item">
                            <span class="l-emoji">⚡</span>
                            <span class="l-name" style="color: #eab308"
                                >Instant</span
                            >
                            <span class="l-criteria">>70% under 1 min</span>
                        </div>
                        <div class="legend-item">
                            <span class="l-emoji">🟢</span>
                            <span class="l-name" style="color: #22c55e"
                                >Fast</span
                            >
                            <span class="l-criteria">40–70% under 1 min</span>
                        </div>
                        <div class="legend-item">
                            <span class="l-emoji">🟡</span>
                            <span class="l-name" style="color: #facc15"
                                >Normal</span
                            >
                            <span class="l-criteria">20–40% under 1 min</span>
                        </div>
                        <div class="legend-item">
                            <span class="l-emoji">🐢</span>
                            <span class="l-name" style="color: #9ca3af"
                                >Slow</span
                            >
                            <span class="l-criteria">&lt;20% under 1 min</span>
                        </div>
                    </div>
                </div>
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

    .date-input {
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

    .date-input:focus {
        border-color: var(--pink-500);
    }
    .date-input::-webkit-calendar-picker-indicator {
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

    /* Streaks */
    .streaks-row {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        margin-bottom: 8px; /* space between streaks and summary cards */
    }

    .streak-pill {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 12px 24px;
        border-radius: 100px;
        background: linear-gradient(
            145deg,
            rgba(236, 72, 153, 0.08),
            rgba(0, 0, 0, 0.2)
        );
        border: 1px solid var(--border-subtle);
        transition: all 0.3s ease;
    }

    .streak-pill:hover {
        border-color: var(--pink-500);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(236, 72, 153, 0.15);
    }

    .fire-emoji {
        font-size: 2rem;
        filter: drop-shadow(0 0 8px rgba(249, 115, 22, 0.5));
        animation: pulse-fire 2s infinite alternate;
    }

    .streak-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .streak-count {
        font-size: 1.1rem;
        font-weight: 800;
        color: var(--text-primary);
        line-height: 1.1;
    }

    .streak-name {
        font-size: 0.75rem;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 600;
    }

    @keyframes pulse-fire {
        0% {
            transform: scale(1);
            filter: drop-shadow(0 0 4px rgba(249, 115, 22, 0.3));
        }
        100% {
            transform: scale(1.15);
            filter: drop-shadow(0 0 12px rgba(249, 115, 22, 0.7));
        }
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

    /* Legend Box */
    .legend-box {
        margin-top: 8px;
        padding-top: 16px;
        border-top: 1px dashed rgba(255, 255, 255, 0.1);
        width: 100%;
    }

    .legend-title {
        font-size: 0.8rem;
        font-weight: 700;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 12px;
    }

    .legend-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 12px;
    }

    .legend-item {
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(0, 0, 0, 0.2);
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .l-emoji {
        font-size: 1.1rem;
    }

    .l-name {
        font-size: 0.85rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.02em;
    }

    .l-criteria {
        font-size: 0.8rem;
        color: var(--text-muted);
        margin-left: auto;
    }

    /* Behavioral Stats */
    .responder-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.85rem;
        font-weight: 700;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        background: rgba(0, 0, 0, 0.2);
        padding: 6px 12px;
        border-radius: 6px;
        width: fit-content;
        margin-top: 4px;
        margin-bottom: 8px;
    }

    .behavior-stats {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin: 12px 0 16px;
        padding: 12px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .stat-row {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .stat-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .stat-text {
        font-size: 0.85rem;
        color: var(--text-secondary);
    }

    .stat-text strong {
        color: var(--text-primary);
        font-weight: 700;
    }

    .stat-note {
        font-size: 0.75rem;
        color: var(--text-muted);
        font-style: italic;
        padding-left: 16px;
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
