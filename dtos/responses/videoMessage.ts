import { InputFile } from 'telegraf/types';
import { BotResponseTypes, IReplyResponse } from '../../types/response';
import { MessageSendingOptions } from '../../types/messageSendingOptions';
import { IActionWithState } from '../../types/statefulAction';
import { IActionState } from '../../types/actionState';
import { ChatInfo } from '../chatInfo';
import { TraceId } from '../../types/trace';
import { ReplyInfo } from '../../types/replyInfo';

export class VideoMessage implements IReplyResponse<InputFile> {
    readonly kind = BotResponseTypes.video;
    readonly createdAt = Date.now();

    readonly content: InputFile;
    readonly chatInfo: ChatInfo;
    readonly replyInfo: ReplyInfo | undefined;
    readonly traceId: TraceId;
    readonly disableWebPreview = false;
    readonly shouldPin: boolean;
    readonly action: IActionWithState<IActionState>;

    constructor(
        video: InputFile,
        chatInfo: ChatInfo,
        traceId: TraceId,
        action: IActionWithState<IActionState>,
        replyInfo: ReplyInfo | undefined,
        options?: MessageSendingOptions
    ) {
        this.content = video;
        this.chatInfo = chatInfo;
        this.replyInfo = replyInfo;
        this.traceId = traceId;
        this.shouldPin = options?.pin ?? false;
        this.action = action;
    }
}
