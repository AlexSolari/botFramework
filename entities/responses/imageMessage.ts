import { InputFile } from 'telegraf/types';
import { BotResponseTypes, IReplyMessage } from '../../types/response';
import { MessageSendingOptions } from '../../types/messageSendingOptions';

export class ImageMessage implements IReplyMessage<InputFile> {
    kind = BotResponseTypes.image;

    content: InputFile;
    chatId: number;
    replyId: number | undefined;
    traceId: string | number;
    disableWebPreview = false;
    shouldPin: boolean;
    sourceActionKey: string;

    constructor(
        image: InputFile,
        chatId: number,
        replyId: number | undefined,
        traceId: number | string,
        sourceActionKey: string,
        options?: MessageSendingOptions
    ) {
        this.content = image;
        this.chatId = chatId;
        this.replyId = replyId;
        this.traceId = traceId;
        this.shouldPin = options?.pin ?? false;
        this.sourceActionKey = sourceActionKey;
    }
}
