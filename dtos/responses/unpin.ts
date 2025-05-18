import { BotResponseTypes, IChatResponse } from '../../types/response';
import { IActionWithState } from '../../types/actionWithState';
import { IActionState } from '../../types/actionState';
import { ChatInfo } from '../chatInfo';
import { TraceId } from '../../types/trace';

export class UnpinResponse implements IChatResponse {
    readonly kind = BotResponseTypes.unpin;
    readonly createdAt = Date.now();

    readonly messageId: number;
    readonly chatInfo: ChatInfo;
    readonly traceId: TraceId;
    readonly action: IActionWithState<IActionState>;

    constructor(
        messageId: number,
        chatInfo: ChatInfo,
        traceId: TraceId,
        action: IActionWithState<IActionState>
    ) {
        this.messageId = messageId;
        this.chatInfo = chatInfo;
        this.traceId = traceId;
        this.action = action;
    }
}
