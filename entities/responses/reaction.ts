import { TelegramEmoji } from 'telegraf/types';
import { BotResponseTypes, IChatResponse } from '../../types/response';
import { IActionWithState } from '../../types/actionWithState';
import { IActionState } from '../../types/actionState';

export class Reaction implements IChatResponse {
    kind = BotResponseTypes.react;

    chatId: number;
    messageId: number;
    traceId: number | string;
    emoji: TelegramEmoji;
    action: IActionWithState<IActionState>;

    constructor(
        traceId: number | string,
        chatId: number,
        messageId: number,
        emoji: TelegramEmoji,
        action: IActionWithState<IActionState>
    ) {
        this.chatId = chatId;
        this.messageId = messageId;
        this.emoji = emoji;
        this.traceId = traceId;
        this.action = action;
    }
}
