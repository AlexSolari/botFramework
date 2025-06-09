import { TelegramEmoji } from 'telegraf/types';
import { BotResponseTypes, IChatResponse } from '../../types/response';
import { IActionWithState } from '../../types/statefulAction';
import { IActionState } from '../../types/actionState';
import { ChatInfo } from '../chatInfo';
import { TraceId } from '../../types/trace';

export class Reaction implements IChatResponse {
    readonly kind = BotResponseTypes.react;
    readonly createdAt = Date.now();

    readonly chatInfo: ChatInfo;
    readonly messageId: number;
    readonly traceId: TraceId;
    readonly emoji: TelegramEmoji;
    readonly action: IActionWithState<IActionState>;

    constructor(
        traceId: TraceId,
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
