import { IActionState } from '../../types/actionState';
import { IActionWithState } from '../../types/statefulAction';
import { BotResponseTypes, IChatResponse } from '../../types/response';
import { Milliseconds } from '../../types/timeValues';
import { TraceId } from '../../types/trace';
import { ChatInfo } from '../chatInfo';

export class DelayResponse implements IChatResponse {
    readonly kind = BotResponseTypes.delay;
    readonly createdAt = Date.now();

    readonly chatInfo: ChatInfo;
    readonly traceId: TraceId;
    readonly delay: Milliseconds;
    readonly action: IActionWithState<IActionState>;

    constructor(
        delay: Milliseconds,
        chatInfo: ChatInfo,
        traceId: TraceId,
        action: IActionWithState<IActionState>
    ) {
        this.chatInfo = chatInfo;
        this.delay = delay;
        this.traceId = traceId;
        this.action = action;
    }
}
