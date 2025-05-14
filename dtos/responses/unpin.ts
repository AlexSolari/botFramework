import { BotResponseTypes, IChatResponse } from '../../types/response';
import { IActionWithState } from '../../types/actionWithState';
import { IActionState } from '../../types/actionState';
import { ChatInfo } from '../chatInfo';

export class UnpinResponse implements IChatResponse {
    readonly kind = BotResponseTypes.unpin;

    readonly messageId: number;
    readonly chatInfo: ChatInfo;
    readonly traceId: number | string;
    readonly action: IActionWithState<IActionState>;

    constructor(
        messageId: number,
        chatInfo: ChatInfo,
        traceId: number | string,
        action: IActionWithState<IActionState>
    ) {
        this.messageId = messageId;
        this.chatInfo = chatInfo;
        this.traceId = traceId;
        this.action = action;
    }
}
