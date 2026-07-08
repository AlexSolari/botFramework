import { IAction } from '../../types/action';
import { BotResponseTypes, IChatResponse } from '../../types/response';
import { TraceId } from '../../types/trace';
import { ChatInfo } from '../chatInfo';

export class DeleteMessageResponse implements IChatResponse {
    readonly kind = BotResponseTypes.deleteMessage;
    readonly createdAt = Date.now();

    readonly messageId: number;
    readonly chatInfo: ChatInfo;
    readonly traceId: TraceId;
    readonly action: IAction;

    constructor(
        messageId: number,
        chatInfo: ChatInfo,
        traceId: TraceId,
        action: IAction
    ) {
        this.messageId = messageId;
        this.chatInfo = chatInfo;
        this.traceId = traceId;
        this.action = action;
    }
}
