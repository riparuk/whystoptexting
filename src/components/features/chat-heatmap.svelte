<script lang="ts">
    import { type Message } from "../../lib/parser";

    interface Props {
        messages: Message[];
        dateRange: { start: Date; end: Date };
    }

    let { messages, dateRange }: Props = $props();

    const allYears = $derived(() => {
        const s = new Set<number>();
        for (const m of messages) s.add(m.date.getFullYear());
        return Array.from(s).sort((a, b) => b - a);
    });

    let selectedYear = $state(0); // 0 = use first year

    const activeYear = $derived(() => {
        const years = allYears();
        return years[selectedYear] ?? years[0] ?? new Date().getFullYear();
    });

    // Build day-count map for selected year
    type DayEntry = { date: Date; count: number; key: string };

    const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
    const MONTH_NAMES = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "Mei",
        "Jun",
        "Jul",
        "Ags",
        "Sep",
        "Okt",
        "Nov",
        "Des",
    ];

    const dayCounts = $derived(() => {
        const year = activeYear();
        const map: Record<string, number> = {};
        for (const m of messages) {
            if (m.date.getFullYear() !== year) continue;
            const k = `${year}-${String(m.date.getMonth() + 1).padStart(2, "0")}-${String(m.date.getDate()).padStart(2, "0")}`;
            map[k] = (map[k] || 0) + 1;
        }
        return map;
    });

    // Build the full grid: week columns × 7 day rows
    // Using Sun-Sat (0-6) to match GitHub style
    const grid = $derived(() => {
        const year = activeYear();
        const counts = dayCounts();
        const weeks: DayEntry[][] = [];

        // Start from Jan 1 of selected year, go to Dec 31
        const startDate = new Date(year, 0, 1);
        const endDate = new Date(year, 11, 31);

        // Pad to Sunday
        const firstDayOfWeek = startDate.getDay(); // 0=Sun
        // Build day slots
        let current = new Date(startDate);
        current.setDate(current.getDate() - firstDayOfWeek);

        while (current <= endDate || current.getDay() !== 0) {
            const week: DayEntry[] = [];
            for (let d = 0; d < 7; d++) {
                const k = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
                week.push({
                    date: new Date(current),
                    count: counts[k] ?? 0,
                    key: k,
                });
                current.setDate(current.getDate() + 1);
                if (current.getFullYear() > year && current.getDay() === 0)
                    break;
            }
            if (week.length === 7) weeks.push(week);
            if (current.getFullYear() > year && current.getDay() === 0) break;
        }
        return weeks;
    });

    const maxCount = $derived(() => {
        return Math.max(1, ...Object.values(dayCounts()));
    });

    function cellColor(count: number, max: number): string {
        if (count === 0) return "rgba(255,255,255,0.04)";
        const ratio = count / max;
        if (ratio <= 0.2) return "rgba(189, 24, 93, 0.25)";
        if (ratio <= 0.4) return "rgba(219, 39, 119, 0.45)";
        if (ratio <= 0.65) return "rgba(236, 72, 153, 0.65)";
        if (ratio <= 0.85) return "rgba(236, 72, 153, 0.85)";
        return "rgba(249, 168, 212, 1)";
    }

    const totalThisYear = $derived(
        Object.values(dayCounts()).reduce((s, v) => s + v, 0),
    );
    const activeDays = $derived(
        Object.values(dayCounts()).filter((v) => v > 0).length,
    );
    const peakDay = $derived(() => {
        const counts = dayCounts();
        const peak = Object.entries(counts).sort(([, a], [, b]) => b - a)[0];
        return peak ? { key: peak[0], count: peak[1] } : null;
    });

    function formatDateKey(key: string) {
        const [y, mo, d] = key.split("-");
        const date = new Date(parseInt(y), parseInt(mo) - 1, parseInt(d));
        return date.toLocaleDateString("id-ID", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
        });
    }

    // Month label positions
    const monthPositions = $derived(() => {
        const weeks = grid();
        const labels: { label: string; col: number }[] = [];
        let lastMonth = -1;
        weeks.forEach((week, i) => {
            const firstOfYear = week.find(
                (d) => d.date.getFullYear() === activeYear(),
            );
            if (!firstOfYear) return;
            const mo = firstOfYear.date.getMonth();
            if (mo !== lastMonth) {
                lastMonth = mo;
                labels.push({ label: MONTH_NAMES[mo], col: i });
            }
        });
        return labels;
    });

    // Tooltip state
    let tooltip = $state<{ x: number; y: number; content: string } | null>(
        null,
    );

    function showTooltip(e: MouseEvent, day: DayEntry) {
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        const wrapRect = document
            .getElementById("heatmap-wrap")
            ?.getBoundingClientRect();
        if (!wrapRect) return;
        tooltip = {
            x: rect.left - wrapRect.left + rect.width / 2,
            y: rect.top - wrapRect.top - 8,
            content:
                day.date.getFullYear() === activeYear()
                    ? `${formatDateKey(day.key)} · ${day.count} pesan`
                    : `(di luar ${activeYear()})`,
        };
    }

    function hideTooltip() {
        tooltip = null;
    }
</script>

<div class="heatmap-section">
    <!-- Header -->
    <div class="section-header animate-fade-up">
        <div>
            <h2 class="section-title">🗓️ Chat Heatmap</h2>
            <p class="section-desc">
                Pola aktivitas chat per hari sepanjang tahun
            </p>
        </div>

        <!-- Year selector -->
        <div class="year-selector">
            {#each allYears() as year, i}
                <button
                    class="year-btn"
                    class:active={selectedYear === i}
                    onclick={() => (selectedYear = i)}
                >
                    {year}
                </button>
            {/each}
        </div>
    </div>

    <!-- Stats row -->
    <div class="stats-row animate-fade-up" style="animation-delay: 0.05s">
        <div class="stat-card glass-card">
            <div class="stat-label">Total Pesan {activeYear()}</div>
            <div class="stat-value gradient-text">
                {totalThisYear.toLocaleString("id-ID")}
            </div>
        </div>
        <div class="stat-card glass-card">
            <div class="stat-label">Hari Aktif</div>
            <div class="stat-value gradient-text">{activeDays}</div>
        </div>
        <div class="stat-card glass-card">
            <div class="stat-label">Rata-rata / Hari Aktif</div>
            <div class="stat-value gradient-text">
                {activeDays > 0
                    ? Math.round(totalThisYear / activeDays).toLocaleString(
                          "id-ID",
                      )
                    : 0}
            </div>
        </div>
        <div class="stat-card glass-card">
            <div class="stat-label">Hari Tersibuk</div>
            <div
                class="stat-value gradient-text"
                style="font-size: 0.9rem; line-height: 1.3"
            >
                {#if peakDay()}
                    {new Date(peakDay()!.key + "T00:00:00").toLocaleDateString(
                        "id-ID",
                        { day: "numeric", month: "short" },
                    )}
                    <div class="stat-sub">
                        {peakDay()!.count.toLocaleString("id-ID")} pesan
                    </div>
                {:else}
                    -
                {/if}
            </div>
        </div>
    </div>

    <!-- Heatmap grid -->
    <div
        class="heatmap-card glass-card animate-fade-up"
        style="animation-delay: 0.1s"
    >
        <div class="heatmap-scroll">
            <div id="heatmap-wrap" class="heatmap-wrap">
                <!-- Tooltip -->
                {#if tooltip}
                    <div
                        class="tooltip"
                        style="left: {tooltip.x}px; top: {tooltip.y}px"
                    >
                        {tooltip.content}
                    </div>
                {/if}

                <!-- Day labels (rows) -->
                <div class="day-labels">
                    {#each DAY_NAMES as day, i}
                        <div class="day-label" class:visible={i % 2 !== 0}>
                            {day}
                        </div>
                    {/each}
                </div>

                <div class="grid-area">
                    <!-- Month labels -->
                    <div
                        class="month-labels"
                        style="position: relative; height: 20px; margin-bottom: 4px;"
                    >
                        {#each monthPositions() as { label, col }}
                            <span class="month-label" style="left: {col * 14}px"
                                >{label}</span
                            >
                        {/each}
                    </div>

                    <!-- Week columns -->
                    <div class="weeks-row">
                        {#each grid() as week, wi}
                            <div class="week-col">
                                {#each week as day}
                                    {@const isCurrentYear =
                                        day.date.getFullYear() === activeYear()}
                                    <div
                                        class="day-cell"
                                        style="background: {isCurrentYear
                                            ? cellColor(day.count, maxCount())
                                            : 'transparent'}"
                                        class:out-of-year={!isCurrentYear}
                                        onmouseenter={(e) =>
                                            isCurrentYear &&
                                            showTooltip(e, day)}
                                        onmouseleave={hideTooltip}
                                        role="img"
                                        aria-label={isCurrentYear
                                            ? `${day.key}: ${day.count} pesan`
                                            : ""}
                                    ></div>
                                {/each}
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
        </div>

        <!-- Legend -->
        <div class="legend">
            <span class="legend-label">Kurang</span>
            <div class="legend-cells">
                {#each [0, 0.2, 0.4, 0.65, 1] as level}
                    <div
                        class="legend-cell"
                        style="background: {cellColor(
                            level * maxCount(),
                            maxCount(),
                        )}"
                    ></div>
                {/each}
            </div>
            <span class="legend-label">Banyak</span>
        </div>
    </div>
</div>

<style>
    .heatmap-section {
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

    .year-selector {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
    }

    .year-btn {
        padding: 6px 16px;
        border-radius: 8px;
        border: 1px solid var(--border-subtle);
        background: transparent;
        color: var(--text-secondary);
        font-size: 0.88rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        font-family: inherit;
    }

    .year-btn:hover {
        border-color: var(--border-pink);
        color: var(--pink-300);
    }
    .year-btn.active {
        background: rgba(236, 72, 153, 0.15);
        border-color: rgba(236, 72, 153, 0.4);
        color: var(--pink-300);
    }

    /* Stats */
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
        font-size: 0.72rem;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 6px;
    }

    .stat-value {
        font-size: 1.8rem;
        font-weight: 800;
        letter-spacing: -0.02em;
    }

    .stat-sub {
        font-size: 0.72rem;
        color: var(--text-muted);
        font-weight: 400;
        margin-top: 2px;
    }

    /* Heatmap card */
    .heatmap-card {
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .heatmap-scroll {
        overflow-x: auto;
        overflow-y: visible;
        padding-bottom: 4px;
    }

    .heatmap-wrap {
        display: flex;
        gap: 8px;
        position: relative;
        min-width: max-content;
    }

    /* Tooltip */
    .tooltip {
        position: absolute;
        transform: translateX(-50%) translateY(-100%);
        background: rgba(26, 26, 46, 0.97);
        border: 1px solid rgba(236, 72, 153, 0.3);
        color: var(--text-primary);
        font-size: 0.78rem;
        padding: 6px 10px;
        border-radius: 6px;
        white-space: nowrap;
        pointer-events: none;
        z-index: 20;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }

    /* Day labels */
    .day-labels {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding-top: 24px; /* align with month labels height */
    }

    .day-label {
        height: 12px;
        font-size: 0.62rem;
        color: transparent;
        display: flex;
        align-items: center;
        padding-right: 4px;
        line-height: 1;
        width: 24px;
        text-align: right;
        justify-content: flex-end;
    }

    .day-label.visible {
        color: var(--text-muted);
    }

    .grid-area {
        display: flex;
        flex-direction: column;
    }

    /* Month labels */
    .month-labels {
        display: flex;
        position: relative;
    }

    .month-label {
        position: absolute;
        font-size: 0.72rem;
        color: var(--text-muted);
        font-weight: 600;
        white-space: nowrap;
    }

    /* Grid */
    .weeks-row {
        display: flex;
        gap: 2px;
    }

    .week-col {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .day-cell {
        width: 12px;
        height: 12px;
        border-radius: 2px;
        cursor: pointer;
        transition:
            transform 0.1s,
            box-shadow 0.1s;
        flex-shrink: 0;
    }

    .day-cell:hover {
        transform: scale(1.4);
        box-shadow: 0 0 6px rgba(236, 72, 153, 0.5);
        z-index: 10;
        position: relative;
    }

    .day-cell.out-of-year {
        cursor: default;
        opacity: 0;
    }

    /* Legend */
    .legend {
        display: flex;
        align-items: center;
        gap: 6px;
        justify-content: flex-end;
    }

    .legend-label {
        font-size: 0.72rem;
        color: var(--text-muted);
    }

    .legend-cells {
        display: flex;
        gap: 2px;
    }

    .legend-cell {
        width: 12px;
        height: 12px;
        border-radius: 2px;
    }
</style>
