import { TextMessageSendingOptions } from '../../types/messageSendingOptions';
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
        sourceActionKey: string,
        options?: TextMessageSendingOptions
    ) {
        this.content = text;
        this.chatId = chatId;
        this.replyId = replyId;
        this.traceId = traceId;
        this.disableWebPreview = options?.disableWebPreview ?? false;
        this.shouldPin = options?.pin ?? false;
        this.sourceActionKey = sourceActionKey;
    }
}
