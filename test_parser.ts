import { readFileSync } from 'fs';
import { parseWhatsAppChat } from './src/lib/parser';

const content = readFileSync('./example_file/_chat.txt', 'utf-8');
const result = parseWhatsAppChat(content);
console.log('Parsed messages:', result.messages.length);
console.log('Participants count:', result.participants.length);
console.log('Participants:', result.participants);
if (result.messages.length > 0) {
    console.log('First message:', result.messages[0]);
    console.log('Last message:', result.messages[result.messages.length - 1]);
}
