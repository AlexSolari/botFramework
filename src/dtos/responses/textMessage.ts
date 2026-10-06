import { TextMessageSendingOptions } from '../../types/messageSendingOptions';
import {
    BotResponseTypes,
    IReplyResponseWithContent
} from '../../types/response';
import { IAction } from '../../types/action';
import { ChatInfo } from '../chatInfo';
import { TraceId } from '../../types/trace';
import { ReplyInfo } from '../replyInfo';
import { PostSendOperation } from '../../types/postSendOperations';
import { InlineKeyboardButton } from '../../types/botApi.generated';

export class TextMessage implements IReplyResponseWithContent<string> {
    readonly kind = BotResponseTypes.text;
    readonly createdAt = Date.now();
    readonly postSendOperations: PostSendOperation[] = [];

    readonly content: string;
    readonly chatInfo: ChatInfo;
    readonly replyInfo: ReplyInfo | undefined;
    readonly traceId: TraceId;
    readonly disableWebPreview: boolean;
    readonly action: IAction;
    readonly keyboard?: InlineKeyboardButton[][];

    constructor(
        text: string,
        chatInfo: ChatInfo,
        traceId: TraceId,
        action: IAction,
        replyInfo?: ReplyInfo,
        options?: TextMessageSendingOptions
    ) {
        this.content = text;
        this.chatInfo = chatInfo;
        this.replyInfo = replyInfo;
        this.traceId = traceId;
        this.disableWebPreview = options?.disableWebPreview ?? false;
        this.action = action;
        this.keyboard = options?.keyboard;
    }

    get messageWithoutReplyInfo() {
        const message = new TextMessage(
            this.content,
            this.chatInfo,
            this.traceId,
            this.action,
            undefined,
            {
                disableWebPreview: this.disableWebPreview,
                keyboard: this.keyboard
            }
        );
        message.postSendOperations.push(...this.postSendOperations);

        return message;
    }
}
