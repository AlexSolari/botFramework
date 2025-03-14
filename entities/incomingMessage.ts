import { Chat, User } from 'telegraf/types';
import { randomInt } from 'crypto';

export class IncomingMessage {
    message_id: number;
    chat: Chat;
    from: User | undefined;
    text: string;
    chatName: string;
    traceId = randomInt(10000, 99999);

    constructor(ctxMessage: {
        message_id: number;
        chat: Chat;
        from?: User;
        text?: string;
    }) {
        this.message_id = ctxMessage.message_id;
        this.chat = ctxMessage.chat;
        this.from = ctxMessage.from;
        this.text = ctxMessage.text || '';
        this.chatName =
            'title' in ctxMessage.chat
                ? ctxMessage.chat.title + ' ' + ctxMessage.chat.id
                : 'DM';
    }
}
