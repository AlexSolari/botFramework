import { TelegramEmoji } from 'telegraf/types';
import { BotResponseTypes, IChatResponse } from '../../types/response';
import { IActionWithState } from '../../types/actionWithState';

export class Reaction implements IChatResponse {
    kind = BotResponseTypes.react;

    chatId: number;
    messageId: number;
    traceId: number | string;
    emoji: TelegramEmoji;
    action: IActionWithState;

    constructor(
        traceId: number | string,
        chatId: number,
        messageId: number,
        emoji: TelegramEmoji,
        action: IActionWithState
    ) {
        this.chatId = chatId;
        this.messageId = messageId;
        this.emoji = emoji;
        this.traceId = traceId;
        this.action = action;
    }
}
