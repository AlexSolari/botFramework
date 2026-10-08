import { ChatHistoryMessage } from '../dtos/chatHistoryMessage';
import { IncomingMessage } from '../dtos/incomingMessage';
import { MESSAGE_HISTORY_LENGTH_LIMIT } from '../helpers/constants';
import { getOrCreateIfNotExists } from '../helpers/mapUtils';

export class ChatHistory {
    private static readonly fallbackFactory: () => ChatHistoryMessage[] =
        () => [];

    private readonly messages = new Map<number, ChatHistoryMessage[]>();

    getFor(chatId: number) {
        return getOrCreateIfNotExists(
            this.messages,
            chatId,
            ChatHistory.fallbackFactory
        );
    }

    add(msg: IncomingMessage) {
        const chatHistoryArray = this.getFor(msg.chatInfo.id);

        if (chatHistoryArray.length >= MESSAGE_HISTORY_LENGTH_LIMIT)
            chatHistoryArray.splice(
                0,
                chatHistoryArray.length - MESSAGE_HISTORY_LENGTH_LIMIT + 1
            );

        chatHistoryArray.push(
            new ChatHistoryMessage(
                msg.messageId,
                msg.from,
                msg.text,
                msg.type,
                msg.traceId,
                msg.replyToMessageId,
                msg.updateObject.date
            )
        );
    }
}
