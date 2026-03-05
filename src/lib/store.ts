import { writable } from 'svelte/store';
import type { ParsedChat } from './parser';
import { saveChatData, loadChatData } from './idb';

// Global store to handle the parsed chat data across components
export const chatStore = writable<ParsedChat | null>(null);

// Flag to indicate if we've attempted initial load from DB
export const isStoreLoaded = writable<boolean>(false);

// Optional: you can export actions to abstract away state mutators
export const setChatData = async (data: ParsedChat | null) => {
    chatStore.set(data);
    if (data) {
        await saveChatData(data);
    }
};

// Initialize store from IDB on mount
export const initStore = async () => {
    const data = await loadChatData();
    if (data) {
        chatStore.set(data);
    }
    isStoreLoaded.set(true);
};
