import { TextMessageSendingOptions } from '../../types/messageSendingOptions';
import {
    BotResponseTypes,
    IReplyResponseWithContent
} from '../../types/response';
import { IAction } from '../../types/action';
import { ChatInfo } from '../chatInfo';
import { TraceId } from '../../types/trace';
import { ReplyInfo } from '../replyInfo';
import { IReplyCapture } from '../../types/capture';
import { TelegramInlineKeyboardButton } from '../../types/externalAliases';

export class TextMessage implements IReplyResponseWithContent<string> {
    readonly kind = BotResponseTypes.text;
    readonly createdAt = Date.now();
    readonly captures: IReplyCapture[] = [];

    readonly content: string;
    readonly chatInfo: ChatInfo;
    readonly replyInfo: ReplyInfo | undefined;
    readonly traceId: TraceId;
    readonly disableWebPreview: boolean;
    readonly shouldPin: boolean;
    readonly action: IAction;
    readonly keyboard?: TelegramInlineKeyboardButton[][];

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
        this.shouldPin = options?.pin ?? false;
        this.action = action;
        this.keyboard = options?.keyboard;
    }
}
