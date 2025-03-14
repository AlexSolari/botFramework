import { BotResponseTypes, IChatResponse } from '../../types/response';

export class UnpinResponse implements IChatResponse {
    kind = BotResponseTypes.unpin;

    messageId: number;
    chatId: number;
    traceId: number | string;
    sourceActionKey: string;

    constructor(
        messageId: number,
        chatId: number,
        traceId: number | string,
        sourceActionKey: string
    ) {
        this.messageId = messageId;
        this.chatId = chatId;
        this.traceId = traceId;
        this.sourceActionKey = sourceActionKey;
    }
}
