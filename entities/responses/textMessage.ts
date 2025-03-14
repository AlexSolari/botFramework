import { BotResponseTypes, IReplyMessage } from '../../types/response';

export class TextMessage implements IReplyMessage<string> {
    kind = BotResponseTypes.text;

    content: string;
    chatId: number;
    replyId: number | undefined;
    traceId: string | number;
    disableWebPreview: boolean;
    shouldPin: boolean;
    sourceActionKey: string;

    constructor(
        text: string,
        chatId: number,
        replyId: number | undefined,
        traceId: string | number,
        disableWebPreview: boolean,
        pinned: boolean,
        sourceActionKey: string
    ) {
        this.content = text;
        this.chatId = chatId;
        this.replyId = replyId;
        this.traceId = traceId;
        this.disableWebPreview = disableWebPreview;
        this.shouldPin = pinned;
        this.sourceActionKey = sourceActionKey;
    }
}
