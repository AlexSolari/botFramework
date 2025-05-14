import { TelegramEmoji } from 'telegraf/types';
import { BotResponseTypes, IChatResponse } from '../../types/response';
import { IActionWithState } from '../../types/actionWithState';
import { IActionState } from '../../types/actionState';
import { ChatInfo } from '../chatInfo';

export class Reaction implements IChatResponse {
    readonly kind = BotResponseTypes.react;

    readonly chatInfo: ChatInfo;
    readonly messageId: number;
    readonly traceId: number | string;
    readonly emoji: TelegramEmoji;
    readonly action: IActionWithState<IActionState>;

    constructor(
        traceId: number | string,
        chatInfo: ChatInfo,
        messageId: number,
        emoji: TelegramEmoji,
        action: IActionWithState<IActionState>
    ) {
        this.chatInfo = chatInfo;
        this.messageId = messageId;
        this.emoji = emoji;
        this.traceId = traceId;
        this.action = action;
    }
}
