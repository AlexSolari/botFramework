import { InputFile } from 'telegraf/types';
import { IReplyMessage } from '../../types/replyMessage';

export class ImageMessage implements IReplyMessage<InputFile> {
    content: InputFile;
    chatId: number;
    replyId: number | undefined;
    traceId: string | number;
    disableWebPreview = false;

    constructor(
        image: InputFile,
        chatId: number,
        replyId: number | undefined,
        traceId: number | string
    ) {
        this.content = image;
        this.chatId = chatId;
        this.replyId = replyId;
        this.traceId = traceId;
    }
}
