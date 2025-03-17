import { InputFile } from 'telegraf/types';
import { BotResponseTypes, IReplyMessage } from '../../types/response';
import { MessageSendingOptions } from '../../types/messageSendingOptions';

export class VideoMessage implements IReplyMessage<InputFile> {
    kind = BotResponseTypes.video;

    content: InputFile;
    chatId: number;
    replyId: number | undefined;
    traceId: string | number;
    disableWebPreview = false;
    shouldPin: boolean;
    sourceActionKey: string;

    constructor(
        video: InputFile,
        chatId: number,
        replyId: number | undefined,
        traceId: number | string,
        sourceActionKey: string,
        options?: MessageSendingOptions
    ) {
        this.content = video;
        this.chatId = chatId;
        this.replyId = replyId;
        this.traceId = traceId;
        this.shouldPin = options?.pin ?? false;
        this.sourceActionKey = sourceActionKey;
    }
}
