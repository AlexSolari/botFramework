import { IActionState } from '../../types/actionState';
import { IActionWithState } from '../../types/actionWithState';
import { BotResponseTypes, IChatResponse } from '../../types/response';
import { Milliseconds } from '../../types/timeValues';
import { ChatInfo } from '../chatInfo';

export class DelayResponse implements IChatResponse {
    readonly kind = BotResponseTypes.delay;

    readonly chatInfo: ChatInfo;
    readonly traceId: number | string;
    readonly delay: Milliseconds;
    readonly action: IActionWithState<IActionState>;

    constructor(
        delay: Milliseconds,
        chatInfo: ChatInfo,
        traceId: number | string,
        action: IActionWithState<IActionState>
    ) {
        this.chatInfo = chatInfo;
        this.delay = delay;
        this.traceId = traceId;
        this.action = action;
    }
}
