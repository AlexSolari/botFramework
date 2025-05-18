import { ChatInfo } from '../dtos/chatInfo';
import { DelayResponse } from '../dtos/responses/delay';
import { ImageMessage } from '../dtos/responses/imageMessage';
import { Reaction } from '../dtos/responses/reaction';
import { TextMessage } from '../dtos/responses/textMessage';
import { UnpinResponse } from '../dtos/responses/unpin';
import { VideoMessage } from '../dtos/responses/videoMessage';
import { IActionState } from './actionState';
import { IActionWithState } from './actionWithState';
import { TraceId } from './trace';

export const BotResponseTypes = {
    unpin: 'unpin',
    text: 'text',
    image: 'image',
    video: 'video',
    react: 'react',
    delay: 'delay'
} as const;

export type BotResponse =
    | UnpinResponse
    | Reaction
    | TextMessage
    | VideoMessage
    | DelayResponse
    | ImageMessage;

export interface IChatResponse {
    readonly kind: keyof typeof BotResponseTypes;
    readonly chatInfo: ChatInfo;
    readonly traceId: TraceId;
    readonly createdAt: number;

    readonly action: IActionWithState<IActionState>;
}

export interface IReplyMessage<TType> extends IChatResponse {
    readonly content: TType;
    readonly replyId: number | undefined;
    readonly disableWebPreview: boolean;
    readonly shouldPin: boolean;
}
