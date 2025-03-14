import { ImageMessage } from '../entities/responses/imageMessage';
import { Reaction } from '../entities/responses/reaction';
import { TextMessage } from '../entities/responses/textMessage';
import { UnpinResponse } from '../entities/responses/unpin';
import { VideoMessage } from '../entities/responses/videoMessage';

export const BotResponseTypes = {
    unpin: 'unpin',
    text: 'text',
    image: 'image',
    video: 'video',
    react: 'react'
} as const;

export type BotResponse =
    | UnpinResponse
    | Reaction
    | TextMessage
    | VideoMessage
    | ImageMessage;

export interface IChatResponse {
    kind: keyof typeof BotResponseTypes;
    chatId: number;
    traceId: number | string;
    sourceActionKey: string;
}

export interface IReplyMessage<TType> extends IChatResponse {
    content: TType;
    replyId: number | undefined;
    disableWebPreview: boolean;
    shouldPin: boolean;
}
