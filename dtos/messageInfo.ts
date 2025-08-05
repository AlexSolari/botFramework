import { Message } from 'node-telegram-bot-api';
import { MessageTypeValue } from '../types/messageTypes';

export class MessageInfo {
    constructor(
        /** Id of a message that triggered this action. */
        readonly id: number,
        /** Text of a message that triggered this action. */
        readonly text: string,
        /** Type of message being received */
        readonly type: MessageTypeValue,
        /** Message object recieved from Telegram */
        readonly telegramUpdateObject: Message
    ) {}
}
