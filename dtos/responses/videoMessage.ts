import { InputFile } from 'telegraf/types';
import { BotResponseTypes, IReplyMessage } from '../../types/response';
import { MessageSendingOptions } from '../../types/messageSendingOptions';
import { IActionWithState } from '../../types/actionWithState';
import { IActionState } from '../../types/actionState';
import { ChatInfo } from '../chatInfo';
import { TraceId } from '../../types/trace';

export class VideoMessage implements IReplyMessage<InputFile> {
    readonly kind = BotResponseTypes.video;

    readonly content: InputFile;
    readonly chatInfo: ChatInfo;
    readonly replyId: number | undefined;
    readonly traceId: TraceId;
    readonly disableWebPreview = false;
    readonly shouldPin: boolean;
    readonly action: IActionWithState<IActionState>;

    constructor(
        video: InputFile,
        chatInfo: ChatInfo,
        replyId: number | undefined,
        traceId: TraceId,
        action: IActionWithState<IActionState>,
        options?: MessageSendingOptions
    ) {
        this.content = video;
        this.chatInfo = chatInfo;
        this.replyId = replyId;
        this.traceId = traceId;
        this.shouldPin = options?.pin ?? false;
        this.action = action;
    }
}
