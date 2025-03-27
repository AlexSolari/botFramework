import { InputFile } from 'telegraf/types';
import { BotResponseTypes, IReplyMessage } from '../../types/response';
import { MessageSendingOptions } from '../../types/messageSendingOptions';
import { IActionWithState } from '../../types/actionWithState';

export class ImageMessage implements IReplyMessage<InputFile> {
    kind = BotResponseTypes.image;

    content: InputFile;
    chatId: number;
    replyId: number | undefined;
    traceId: string | number;
    disableWebPreview = false;
    shouldPin: boolean;
    action: IActionWithState;

    constructor(
        image: InputFile,
        chatId: number,
        replyId: number | undefined,
        traceId: number | string,
        action: IActionWithState,
        options?: MessageSendingOptions
    ) {
        this.content = image;
        this.chatId = chatId;
        this.replyId = replyId;
        this.traceId = traceId;
        this.shouldPin = options?.pin ?? false;
        this.action = action;
    }
}
