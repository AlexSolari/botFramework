import { BotResponseTypes, IChatResponse } from '../../types/response';
import { IAction } from '../../types/action';
import { ChatInfo } from '../chatInfo';
import { TraceId } from '../../types/trace';
import { TelegramEmoji } from 'node-telegram-bot-api';

export class Reaction implements IChatResponse {
    readonly kind = BotResponseTypes.react;
    readonly createdAt = Date.now();

    readonly chatInfo: ChatInfo;
    readonly messageId: number;
    readonly traceId: TraceId;
    readonly emoji: TelegramEmoji;
    readonly action: IAction;

    constructor(
        traceId: TraceId,
        chatInfo: ChatInfo,
        messageId: number,
        emoji: TelegramEmoji,
        action: IAction
    ) {
        this.chatInfo = chatInfo;
        this.messageId = messageId;
        this.emoji = emoji;
        this.traceId = traceId;
        this.action = action;
    }
}
