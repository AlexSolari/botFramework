import { IReplyMessage } from '../../types/replyMessage';

export class TextMessage implements IReplyMessage<string> {
    content: string;
    chatId: number;
    replyId: number | undefined;
    traceId: string | number;
    disableWebPreview: boolean;

    constructor(
        text: string,
        chatId: number,
        replyId: number | undefined,
        traceId: string | number,
        disableWebPreview: boolean
    ) {
        this.content = text;
        this.chatId = chatId;
        this.replyId = replyId;
        this.traceId = traceId;
        this.disableWebPreview = disableWebPreview;
    }
}
