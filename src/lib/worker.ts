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
const STOPWORDS = new Set([
    "yang", "di", "dan", "itu", "ini", "ada", "ga", "gak", "saya", "aku", "lu",
    "gue", "lo", "kamu", "dia", "kita", "kalian", "mereka", "aja", "juga", "udah",
    "ya", "yah", "yaa", "yaaa", "iyaa", "iya", "iye", "si", "sih", "deh", "dong",
    "lah", "loh", "nih", "tuh", "nah", "ber", "ke", "dari", "untuk", "dengan",
    "pada", "atau", "bukan", "tidak", "mau", "bisa", "sudah", "jadi", "lebih",
    "lagi", "mah", "kalo", "kalau", "tapi", "karena", "mas", "mbak", "bang", "pak",
    "bu", "ku", "mu", "nya", "pun", "sama", "buat", "tu", "dah", "oh", "oke", "ok",
    "ooh", "makanya", "kayak", "kyk", "udh", "eh", "ah", "haha", "hahaha", "wkwk",
    "wkwkwk", "hehe", "hahah", "hhh", "hh", "hmm", "umm", "yg", "tp", "gw",
    "abis", "bakal", "mana", "sana", "sini", "situ", "bagi", "trus", "terus",
    "gimana", "bagaimana", "dulu", "enggak", "engg", "engga", "gada", "emg", "emang",
    "the", "a", "an", "is", "it", "in", "on", "at", "to", "for", "of", "and",
    "or", "but", "with", "this", "that", "was", "are", "he", "she", "we", "they",
    "i", "you", "be", "been", "have", "has", "do", "did", "not", "from", "by",
    "as", "so", "if", "my", "your", "his", "her", "our", "their", "me", "him",
    "us", "them", "omitted", "image", "sticker", "video", "audio", "document",
    "gif", "contact", "location", "message", "edited", "deleted"
]);

const EMOJI_REGEX = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu;

function extractWords(text: string): string[] {
    text = text.replace(/https?:\/\/\S+/g, "");
    text = text.replace(EMOJI_REGEX, " ");
    text = text.replace(/[^\w\s']/g, " ");
    return text
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

function extractEmojis(text: string): string[] {
    return Array.from(text.matchAll(EMOJI_REGEX)).map((m) => m[0]);
}

type WordEntry = { word: string; count: number };

function topItemsFromMsgs(msgs: Message[], type: "word" | "emoji", limit = 50): WordEntry[] {
    const freq: Record<string, number> = {};
    for (const msg of msgs) {
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
function calculateResponseTimes(messages: Message[], participants: string[], isGroup: boolean) {
    if (isGroup || participants.length !== 2) {
        return { averageMs: 0, byUser: {} };
    }

    const byUser: Record<string, { ms: number; count: number }> = {
        [participants[0]]: { ms: 0, count: 0 },
        [participants[1]]: { ms: 0, count: 0 },
    };

    let prevMsg: Message | null = null;
    let globalTotalMs = 0;
    let globalReps = 0;

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (!prevMsg) {
            prevMsg = msg;
            continue;
        }

        if (msg.sender !== prevMsg.sender) {
            const delta = msg.date.getTime() - prevMsg.date.getTime();
            if (delta > 0 && delta < 1000 * 60 * 60 * 24) {
                byUser[msg.sender].ms += delta;
                byUser[msg.sender].count++;
                globalTotalMs += delta;
                globalReps++;
            }
        }
        prevMsg = msg;
    }

    const resByUser: Record<string, number> = {};
    for (const [user, s] of Object.entries(byUser)) {
        resByUser[user] = s.count > 0 ? s.ms / s.count : 0;
    }

    return {
        averageMs: globalReps > 0 ? globalTotalMs / globalReps : 0,
        byUser: resByUser
    };
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
