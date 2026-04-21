import {
    BotResponseTypes,
    IReplyResponseWithContent
} from '../../types/response';
import { IAction } from '../../types/action';
import { ChatInfo } from '../chatInfo';
import { TraceId } from '../../types/trace';
import { ReplyInfo } from '../replyInfo';
import { IReplyCapture } from '../../types/capture';
import { InputFile } from '../../types/inputFile';

export class VideoMessage implements IReplyResponseWithContent<InputFile> {
    readonly kind = BotResponseTypes.video;
    readonly createdAt = Date.now();
    readonly captures: IReplyCapture[] = [];

    readonly content: InputFile;
    readonly chatInfo: ChatInfo;
    readonly replyInfo: ReplyInfo | undefined;
    readonly traceId: TraceId;
    readonly disableWebPreview = false;
    readonly action: IAction;

    constructor(
        video: InputFile,
        chatInfo: ChatInfo,
        traceId: TraceId,
        action: IAction,
        replyInfo?: ReplyInfo
    ) {
        this.content = video;
        this.chatInfo = chatInfo;
        this.replyInfo = replyInfo;
        this.traceId = traceId;
        this.action = action;
    }

    get quotelessReply() {
        return new VideoMessage(
            this.content,
            this.chatInfo,
            this.traceId,
            this.action,
            undefined
        );
    }
}
