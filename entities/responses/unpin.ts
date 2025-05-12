import { BotResponseTypes, IChatResponse } from '../../types/response';
import { IActionWithState } from '../../types/actionWithState';
import { IActionState } from '../../types/actionState';

export class UnpinResponse implements IChatResponse {
    kind = BotResponseTypes.unpin;

    messageId: number;
    chatId: number;
    traceId: number | string;
    action: IActionWithState<IActionState>;

    constructor(
        messageId: number,
        chatId: number,
        traceId: number | string,
        action: IActionWithState<IActionState>
    ) {
        this.messageId = messageId;
        this.chatId = chatId;
        this.traceId = traceId;
        this.action = action;
    }
}
