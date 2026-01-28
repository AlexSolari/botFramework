import { TelegramUser } from '../types/externalAliases';
import { MessageTypeValue } from '../types/messageTypes';
import { TraceId } from '../types/trace';

export class ChatHistoryMessage {
    constructor(
        /** The unique identifier for the message */
        readonly id: number,
        /** The user who sent the message */
        readonly from: TelegramUser | undefined,
        /** The content of the message */
        readonly text: string,
        /** The type of the message */
        readonly type: MessageTypeValue,
        /** The trace identifier for the message */
        readonly traceId: TraceId,
        /** The identifier for the message this message is replying to */
        readonly replyToId: number | undefined,
        /** The date the message was sent, represented as a Unix timestamp */
        readonly date: number
    ) {}
}
