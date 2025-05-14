import { Message, Update, User } from 'telegraf/types';
import { randomInt } from 'crypto';
import { MessageType, MessageTypeValue } from '../types/messageTypes';
import { ChatInfo } from './chatInfo';

export class IncomingMessage {
    message_id: number;
    chatInfo: ChatInfo;
    from: User | undefined;
    text: string;
    type: MessageTypeValue;
    traceId = randomInt(10000, 99999);

    private detectMessageType(
        message: Update.New & (Update.NonChannel & Message)
    ) {
        if ('text' in message) return MessageType.Text;
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

    constructor(ctxMessage: Update.New & (Update.NonChannel & Message)) {
        this.message_id = ctxMessage.message_id;
        this.from = ctxMessage.from;
        this.text = 'text' in ctxMessage ? ctxMessage.text : '';
        this.chatInfo = new ChatInfo(
            ctxMessage.chat.id,
            'title' in ctxMessage.chat
                ? ctxMessage.chat.title + ' ' + ctxMessage.chat.id
                : 'DM'
        );
        this.type = this.detectMessageType(ctxMessage);
    }
}
