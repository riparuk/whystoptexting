import { writable } from 'svelte/store';
import type { ParsedChat } from './parser';

// Global store to handle the parsed chat data across components
export const chatStore = writable<ParsedChat | null>(null);

// Optional: you can export actions to abstract away state mutators
export const setChatData = (data: ParsedChat | null) => {
    chatStore.set(data);
};
