import { BotResponseTypes, IChatResponse } from '../../types/response';
import { IActionWithState } from '../../types/actionWithState';

export class UnpinResponse implements IChatResponse {
    kind = BotResponseTypes.unpin;

    messageId: number;
    chatId: number;
    traceId: number | string;
    action: IActionWithState;

    constructor(
        messageId: number,
        chatId: number,
        traceId: number | string,
        action: IActionWithState
    ) {
        this.messageId = messageId;
        this.chatId = chatId;
        this.traceId = traceId;
        this.action = action;
    }
}
