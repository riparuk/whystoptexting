/// <reference lib="webworker" />

// This worker script will compile into a separate bundle in Vite if imported via `?worker`
import type { Message, ParsedChat } from "./parser";

export type WorkerMessage =
    | { type: "WORD_CLOUD"; payload: { messages: Message[] } }
    | { type: "RESPONSE_TIME"; payload: { messages: Message[], isGroup: boolean, participants: string[] } }
    | { type: "CHAT_INTENSITY"; payload: { messages: Message[] } }
    | { type: "MOST_ACTIVE"; payload: { messages: Message[], participants: string[] } }
    | { type: "CHAT_HEATMAP"; payload: { messages: Message[] } };

// Helpers for word cloud
const REMOVE_WORDS = [
    "this message was deleted",
    "this message was edited",
    "image omitted",
    "video omitted",
    "audio omitted",
    "document omitted",
    "gif omitted",
    "contact card omitted",
    "sticker omitted",
    "<media omitted>"
];

const LOCATION_REGEX = /(?:location|lokasi):\s*https?:\/\//i;

const EMOJI_REGEX = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu;

function extractWords(text: string): string[] {
    text = text.replace(/https?:\/\/\S+/g, "");
    text = text.replace(EMOJI_REGEX, " ");
    text = text.replace(/[^\w\s']/g, " ");
    return text
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !/^\d+$/.test(w));
}

function extractEmojis(text: string): string[] {
    return Array.from(text.matchAll(EMOJI_REGEX)).map((m) => m[0]);
}

type WordEntry = { word: string; count: number };

function topItemsFromMsgs(msgs: Message[], type: "word" | "emoji", limit = 50): WordEntry[] {
    const freq: Record<string, number> = {};
    for (const msg of msgs) {
        const lowerContent = msg.content.toLowerCase();
        if (REMOVE_WORDS.some(w => lowerContent.includes(w)) || LOCATION_REGEX.test(lowerContent)) {
            continue;
        }

        const items = type === "word" ? extractWords(msg.content) : extractEmojis(msg.content);
        for (const item of items) {
            freq[item] = (freq[item] || 0) + 1;
        }
    }
    return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([word, count]) => ({ word, count }));
}

// Helpers for response time (1-on-1 logic)
/**
 * HOW THE ALGORITHM WORKS:
 * 1. Only calculates for 1-on-1 chats.
 * 2. It tracks the `lastSender` and `lastMsgTime`.
 * 3. Whenever the sender changes, it means the new sender is replying to the `lastSender`.
 * 4. The response time is calculated as (Current Message Time - `lastMsgTime`).
 * 5. If the same sender sends multiple messages in a row, `lastMsgTime` gets updated to the latest message.
 *    This ensures the response time measures how long it took the receiver to reply to the *last* message of the sender block.
 * 6. If the gap between the messages is larger than 24 hours, it's considered a new conversation and NOT counted as a response.
 * 7. Results are aggregated, returning minimum, maximum, median, average, and a frequency distribution.
 */
function calculateResponseTimes(messages: Message[], participants: string[], isGroup: boolean) {
    if (isGroup || participants.length !== 2) {
        return { stats: [] };
    }

    const p1 = participants[0];
    const p2 = participants[1];

    // Store response times in milliseconds
    const responseTimes: Record<string, number[]> = {
        [`${p2}→${p1}`]: [], // time it takes for p2 to reply to p1
        [`${p1}→${p2}`]: [], // time it takes for p1 to reply to p2
    };

    let lastSender: string | null = null;
    let lastMsgTime: number = 0;

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (msg.isSystem || !msg.sender) continue;

        if (!lastSender) {
            lastSender = msg.sender;
            lastMsgTime = msg.date.getTime();
            continue;
        }

        if (msg.sender !== lastSender) {
            const currentMsgTime = msg.date.getTime();
            const diff = currentMsgTime - lastMsgTime;

            if (diff > 0 && diff <= 24 * 60 * 60 * 1000) {
                // Sender changed, so msg.sender is replying to lastSender
                // Example: B (msg.sender) replies to A (lastSender) -> key is "B→A"
                const key = `${msg.sender}→${lastSender}`;
                if (responseTimes[key]) {
                    responseTimes[key].push(diff);
                }
            }

            // Update state for next cycle
            lastSender = msg.sender;
            lastMsgTime = currentMsgTime;
        } else {
            // Consecutive messages by the same sender, update to the latest message time
            lastMsgTime = msg.date.getTime();
        }
    }

    const stats: any[] = [];

    for (const [key, times] of Object.entries(responseTimes)) {
        if (times.length === 0) continue;

        times.sort((a, b) => a - b);
        const count = times.length;
        const total = times.reduce((a, b) => a + b, 0);
        const avg = (total / count) / 60000;
        const median = times[Math.floor(count / 2)] / 60000;
        const min = times[0] / 60000;
        const max = times[count - 1] / 60000;

        const dist = [0, 0, 0, 0, 0];
        for (const t of times) {
            const m = t / 60000;
            if (m < 1) dist[0]++;
            else if (m <= 5) dist[1]++;
            else if (m <= 30) dist[2]++;
            else if (m <= 60) dist[3]++;
            else dist[4]++;
        }

        stats.push({
            key,
            avg,
            median,
            min,
            max,
            count,
            dist,
        });
    }

    return { stats };
}

// Map the request handling
self.onmessage = (e: MessageEvent<WorkerMessage>) => {
    try {
        const { type, payload } = e.data;

        if (type === "WORD_CLOUD") {
            const words = topItemsFromMsgs(payload.messages, "word", 50);
            const emojis = topItemsFromMsgs(payload.messages, "emoji", 20);
            self.postMessage({ type, success: true, result: { words, emojis } });
        }

        else if (type === "RESPONSE_TIME") {
            const data = calculateResponseTimes(payload.messages, payload.participants, payload.isGroup);
            self.postMessage({ type, success: true, result: data });
        }

        else if (type === "CHAT_INTENSITY") {
            const msgs = payload.messages;

            // Month buckets
            const map: Record<string, number> = {};
            for (const msg of msgs) {
                const key = `${msg.date.getFullYear()}-${String(msg.date.getMonth() + 1).padStart(2, "0")}`;
                map[key] = (map[key] || 0) + 1;
            }
            const allMonthBuckets = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));

            // Conversation gaps
            const gaps: { start: Date; end: Date; days: number }[] = [];
            if (msgs.length >= 2) {
                for (let i = 1; i < msgs.length; i++) {
                    const delta = msgs[i].date.getTime() - msgs[i - 1].date.getTime();
                    const days = delta / (1000 * 60 * 60 * 24);
                    if (days >= 1) {
                        gaps.push({ start: msgs[i - 1].date, end: msgs[i].date, days });
                    }
                }
            }
            const topGaps = gaps.sort((a, b) => b.days - a.days).slice(0, 5);

            self.postMessage({
                type,
                success: true,
                result: { allMonthBuckets, topGaps }
            });
        }

        else if (type === "MOST_ACTIVE") {
            const msgs = payload.messages;
            const map: Record<string, number> = {};
            for (const msg of msgs) {
                if (!msg.isSystem && msg.sender) {
                    map[msg.sender] = (map[msg.sender] || 0) + 1;
                }
            }

            const counts = Object.entries(map)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count], i) => ({ name, count, rank: i + 1 }));

            self.postMessage({
                type,
                success: true,
                result: { counts, totalMessages: msgs.length }
            });
        }

        else if (type === "CHAT_HEATMAP") {
            const msgs = payload.messages;

            const map: Record<string, number> = {};
            const yearsSet = new Set<number>();

            for (const msg of msgs) {
                const year = msg.date.getFullYear();
                yearsSet.add(year);
                const k = `${year}-${String(msg.date.getMonth() + 1).padStart(2, "0")}-${String(msg.date.getDate()).padStart(2, "0")}`;
                map[k] = (map[k] || 0) + 1;
            }

            const allYears = Array.from(yearsSet).sort((a, b) => b - a);
            // Default active year = 0 index (newest)
            const activeYear = allYears[0] ?? new Date().getFullYear();

            type DayEntry = { date: Date; count: number; key: string };
            const weeks: DayEntry[][] = [];

            // We only need to generate the grid for the initial activeYear 
            // but the heatmap lets the user toggle years! 
            // So we send back *all* maps, and the UI can construct the grid very fast since they are just days of the year.

            self.postMessage({
                type,
                success: true,
                result: { dayCounts: map, allYears }
            });
        }

        // Just throwing an unimplemented block if we need raw lists without UI derived states
        // In the future we can migrate most-active and others here
        else {
            self.postMessage({ type, success: false, error: "Not implemented in worker yet" });
        }

    } catch (err: any) {
        self.postMessage({ type: e.data.type, success: false, error: err.message });
    }
};
