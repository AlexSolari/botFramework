import { BotResponseTypes, IChatResponse } from '../../types/response';
import { IAction } from '../../types/action';
import { ChatInfo } from '../chatInfo';
import { TraceId } from '../../types/trace';
import { ReactionTypeEmoji } from '../../types/botApi.generated';

export class Reaction implements IChatResponse {
    readonly kind = BotResponseTypes.react;
    readonly createdAt = Date.now();

    readonly chatInfo: ChatInfo;
    readonly messageId: number;
    readonly traceId: TraceId;
    readonly emoji: ReactionTypeEmoji['emoji'];
    readonly action: IAction;

    constructor(
        traceId: TraceId,
        chatInfo: ChatInfo,
        messageId: number,
        emoji: ReactionTypeEmoji['emoji'],
        action: IAction
    ) {
        this.chatInfo = chatInfo;
        this.messageId = messageId;
        this.emoji = emoji;
        this.traceId = traceId;
        this.action = action;
    }
}
