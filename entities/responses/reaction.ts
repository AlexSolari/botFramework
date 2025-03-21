import { TelegramEmoji } from 'telegraf/types';
import { BotResponseTypes, IChatResponse } from '../../types/response';

export class Reaction implements IChatResponse {
    kind = BotResponseTypes.react;

    chatId: number;
    messageId: number;
    traceId: number | string;
    emoji: TelegramEmoji;
    sourceActionKey: string;

    constructor(
        traceId: number | string,
        chatId: number,
        messageId: number,
        emoji: TelegramEmoji,
        sourceActionKey: string
    ) {
        this.chatId = chatId;
        this.messageId = messageId;
        this.emoji = emoji;
        this.traceId = traceId;
        this.sourceActionKey = sourceActionKey;
    }
}
