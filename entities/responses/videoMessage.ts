import { InputFile } from 'telegraf/types';
import { BotResponseTypes, IReplyMessage } from '../../types/response';
import { MessageSendingOptions } from '../../types/messageSendingOptions';
import { IActionWithState } from '../../types/actionWithState';

export class VideoMessage implements IReplyMessage<InputFile> {
    kind = BotResponseTypes.video;

    content: InputFile;
    chatId: number;
    replyId: number | undefined;
    traceId: string | number;
    disableWebPreview = false;
    shouldPin: boolean;
    action: IActionWithState;

    constructor(
        video: InputFile,
        chatId: number,
        replyId: number | undefined,
        traceId: number | string,
        action: IActionWithState,
        options?: MessageSendingOptions
    ) {
        this.content = video;
        this.chatId = chatId;
        this.replyId = replyId;
        this.traceId = traceId;
        this.shouldPin = options?.pin ?? false;
        this.action = action;
    }
}
