import { ChatInfo } from '../dtos/chatInfo';
import { DelayResponse } from '../dtos/responses/delay';
import { ImageMessage } from '../dtos/responses/imageMessage';
import { InlineQueryResponse } from '../dtos/responses/inlineQueryResponse';
import { Reaction } from '../dtos/responses/reaction';
import { TextMessage } from '../dtos/responses/textMessage';
import { UnpinResponse } from '../dtos/responses/unpin';
import { VideoMessage } from '../dtos/responses/videoMessage';
import { IReplyCapture } from './capture';
import { ReplyInfo } from '../dtos/replyInfo';
import { TraceId } from './trace';
import { IAction } from './action';

export const BotResponseTypes = {
    unpin: 'unpin',
    text: 'text',
    image: 'image',
    video: 'video',
    react: 'react',
    delay: 'delay',
    inlineQuery: 'inlineQuery'
} as const;

export type BotResponse =
    | UnpinResponse
    | Reaction
    | TextMessage
    | VideoMessage
    | DelayResponse
    | InlineQueryResponse
    | ImageMessage;

export interface IChatResponse {
    readonly kind: keyof typeof BotResponseTypes;
    readonly chatInfo: ChatInfo;
    readonly traceId: TraceId;
    readonly createdAt: number;

    readonly action: IAction;
}

export interface IReplyResponse extends IChatResponse {
    readonly captures: IReplyCapture[];
    readonly replyInfo: ReplyInfo | undefined;
    readonly disableWebPreview: boolean;
    readonly shouldPin: boolean;
}

export interface IReplyResponseWithContent<TType> extends IReplyResponse {
    readonly content: TType;
}
