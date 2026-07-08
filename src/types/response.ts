import { ChatInfo } from '../dtos/chatInfo';
import { DelayResponse } from '../dtos/responses/delay';
import { ImageMessage } from '../dtos/responses/imageMessage';
import { InlineQueryResponse } from '../dtos/responses/inlineQueryResponse';
import { Reaction } from '../dtos/responses/reaction';
import { TextMessage } from '../dtos/responses/textMessage';
import { UnpinResponse } from '../dtos/responses/unpin';
import { VideoMessage } from '../dtos/responses/videoMessage';
import { ReplyInfo } from '../dtos/replyInfo';
import { TraceId } from './trace';
import { IAction } from './action';
import { PostSendOperation } from './postSendOperations';
import { PinResponse } from '../dtos/responses/pin';
import { DeleteMessageResponse } from '../dtos/responses/deleteMessage';

export const BotResponseTypes = {
    pin: 'pin',
    unpin: 'unpin',
    text: 'text',
    image: 'image',
    video: 'video',
    react: 'react',
    delay: 'delay',
    inlineQuery: 'inlineQuery',
    deleteMessage: 'deleteMessage'
} as const;

export type BotResponse =
    | UnpinResponse
    | Reaction
    | TextMessage
    | VideoMessage
    | DelayResponse
    | InlineQueryResponse
    | ImageMessage
    | PinResponse
    | DeleteMessageResponse;

export interface IChatResponse {
    readonly kind: keyof typeof BotResponseTypes;
    readonly chatInfo: ChatInfo;
    readonly traceId: TraceId;
    readonly createdAt: number;

    readonly action: IAction;
}

export interface IReplyResponse extends IChatResponse {
    readonly postSendOperations: PostSendOperation[];
    readonly replyInfo: ReplyInfo | undefined;
    readonly disableWebPreview: boolean;

    get quotelessReply(): IReplyResponse;
}

export interface IReplyResponseWithContent<TType> extends IReplyResponse {
    readonly content: TType;
}
