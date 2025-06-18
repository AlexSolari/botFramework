import { TextMessageSendingOptions } from '../../types/messageSendingOptions';
import { BotResponseTypes, IReplyResponse } from '../../types/response';
import { IActionWithState } from '../../types/statefulAction';
import { IActionState } from '../../types/actionState';
import { ChatInfo } from '../chatInfo';
import { TraceId } from '../../types/trace';
import { ReplyInfo } from '../../types/replyInfo';

export class TextMessage implements IReplyResponse<string> {
    readonly kind = BotResponseTypes.text;
    readonly createdAt = Date.now();

    readonly content: string;
    readonly chatInfo: ChatInfo;
    readonly replyInfo: ReplyInfo | undefined;
    readonly traceId: TraceId;
    readonly disableWebPreview: boolean;
    readonly shouldPin: boolean;
    readonly action: IActionWithState<IActionState>;

    constructor(
        text: string,
        chatInfo: ChatInfo,
        traceId: TraceId,
        action: IActionWithState<IActionState>,
        replyInfo?: ReplyInfo,
        options?: TextMessageSendingOptions
    ) {
        this.content = text;
        this.chatInfo = chatInfo;
        this.replyInfo = replyInfo;
        this.traceId = traceId;
        this.disableWebPreview = options?.disableWebPreview ?? false;
        this.shouldPin = options?.pin ?? false;
        this.action = action;
    }
}
