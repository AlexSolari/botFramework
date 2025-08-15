import { TelegramUser } from '../types/externalAliases';
import { MessageTypeValue } from '../types/messageTypes';
import { TraceId } from '../types/trace';

export class ChatHistoryMessage {
    constructor(
        readonly id: number,
        readonly from: TelegramUser | undefined,
        readonly text: string,
        readonly type: MessageTypeValue,
        readonly traceId: TraceId,
        readonly replyToId: number | undefined
    ) {}
}
