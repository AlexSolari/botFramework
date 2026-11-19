import { BotResponseTypes, IChatResponse } from '../../types/response';
import { IAction } from '../../types/action';
import { ChatInfo } from '../chatInfo';
import { TraceId } from '../../types/trace';

export class PinResponse implements IChatResponse {
    readonly kind = BotResponseTypes.pin;
    readonly createdAt = Temporal.Now.instant().epochMilliseconds;

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
