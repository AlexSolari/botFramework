import { TextMessageSendingOptions } from '../../types/messageSendingOptions';
import { BotResponseTypes, IReplyMessage } from '../../types/response';
import { IActionWithState } from '../../types/statefulAction';
import { IActionState } from '../../types/actionState';
import { ChatInfo } from '../chatInfo';
import { TraceId } from '../../types/trace';

export class TextMessage implements IReplyMessage<string> {
    readonly kind = BotResponseTypes.text;
    readonly createdAt = Date.now();

    readonly content: string;
    readonly chatInfo: ChatInfo;
    readonly replyId: number | undefined;
    readonly traceId: TraceId;
    readonly disableWebPreview: boolean;
    readonly shouldPin: boolean;
    readonly action: IActionWithState<IActionState>;

    constructor(
        text: string,
        chatInfo: ChatInfo,
        replyId: number | undefined,
        traceId: TraceId,
        action: IActionWithState<IActionState>,
        options?: TextMessageSendingOptions
    ) {
        this.content = text;
        this.chatInfo = chatInfo;
        this.replyId = replyId;
        this.traceId = traceId;
        this.disableWebPreview = options?.disableWebPreview ?? false;
        this.shouldPin = options?.pin ?? false;
        this.action = action;
    }
}
