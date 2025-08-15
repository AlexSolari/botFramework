import { randomInt } from 'crypto';
import { MessageType, MessageTypeValue } from '../types/messageTypes';
import { ChatInfo } from './chatInfo';
import { createTrace } from '../helpers/traceFactory';
import { TraceId } from '../types/trace';
import { ChatHistoryMessage } from './chatHistoryMessage';
import { TelegramMessage, TelegramUser } from '../types/externalAliases';

export class IncomingMessage {
    readonly messageId: number;
    readonly chatInfo: ChatInfo;
    readonly from: TelegramUser | undefined;
    readonly text: string;
    readonly type: MessageTypeValue;
    readonly traceId: TraceId;
    readonly replyToMessageId: number | undefined;

    readonly updateObject: TelegramMessage;

    private detectMessageType(message: TelegramMessage) {
        if ('forward_origin' in message) return MessageType.Forward;
        if ('text' in message) return MessageType.Text;
        if ('video' in message) return MessageType.Video;
        if ('photo' in message) return MessageType.Photo;
        if ('sticker' in message) return MessageType.Sticker;
        if ('animation' in message) return MessageType.Animation;
        if ('voice' in message) return MessageType.Voice;
        if ('audio' in message) return MessageType.Audio;
        if ('document' in message) return MessageType.Document;
        if ('left_chat_member' in message) return MessageType.LeftChatMember;
        if ('new_chat_member' in message) return MessageType.NewChatMember;
        if ('poll' in message) return MessageType.Poll;
        if ('location' in message) return MessageType.Location;

        return MessageType.Unknown;
    }

    constructor(
        ctxMessage: TelegramMessage,
        botName: string,
        history: ChatHistoryMessage[]
    ) {
        this.traceId = createTrace(
            this,
            botName,
            randomInt(10000, 99999).toString()
        );
        this.messageId = ctxMessage.message_id;
        this.replyToMessageId =
            'reply_to_message' in ctxMessage
                ? ctxMessage.reply_to_message?.message_id
                : undefined;
        this.from = ctxMessage.from;
        this.text = this.getMessageText(ctxMessage);
        this.chatInfo = new ChatInfo(
            ctxMessage.chat.id,
            'title' in ctxMessage.chat
                ? `${ctxMessage.chat.title} ${ctxMessage.chat.id}`
                : 'DM',
            history
        );
        this.type = this.detectMessageType(ctxMessage);
        this.updateObject = ctxMessage;
    }

    private getMessageText(ctxMessage: TelegramMessage) {
        if ('text' in ctxMessage) return ctxMessage.text;

        return 'caption' in ctxMessage ? ctxMessage.caption ?? '' : '';
    }
}
