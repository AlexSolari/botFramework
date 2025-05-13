import { IActionState } from '../../types/actionState';
import { IActionWithState } from '../../types/actionWithState';
import { BotResponseTypes, IChatResponse } from '../../types/response';
import { Milliseconds } from '../../types/timeValues';

export class DelayResponse implements IChatResponse {
    kind = BotResponseTypes.delay;

    chatId: number;
    traceId: number | string;
    delay: Milliseconds;
    action: IActionWithState<IActionState>;

    constructor(
        delay: Milliseconds,
        chatId: number,
        traceId: number | string,
        action: IActionWithState<IActionState>
    ) {
        this.chatId = chatId;
        this.delay = delay;
        this.traceId = traceId;
        this.action = action;
    }
}
