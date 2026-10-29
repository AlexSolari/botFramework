import { describe, test, expect } from 'bun:test';
import { IncomingMessage } from '../../src/dtos/incomingMessage';
import {
    MessageType,
    MessageTypeValue
} from '../../src/types/messageTypes';
import type { Message } from '../../src/types/botApi.generated';

function incoming(fields: object) {
    return new IncomingMessage(
        {
            message_id: 7,
            date: 0,
            chat: { id: 100, type: 'group', title: 'Group' },
            ...fields
        } as Message,
        'TestBot',
        []
    );
}

describe('IncomingMessage', () => {
    describe('type', () => {
        const cases: [string, object, MessageTypeValue][] = [
            ['forward', { forward_origin: {}, text: 'hi' }, MessageType.Forward],
            ['text', { text: 'hi' }, MessageType.Text],
            ['video', { video: {} }, MessageType.Video],
            ['photo', { photo: [] }, MessageType.Photo],
            ['sticker', { sticker: {} }, MessageType.Sticker],
            ['animation', { animation: {} }, MessageType.Animation],
            ['voice', { voice: {} }, MessageType.Voice],
            ['audio', { audio: {} }, MessageType.Audio],
            ['document', { document: {} }, MessageType.Document],
            ['member leaving', { left_chat_member: {} }, MessageType.LeftChatMember],
            ['member joining', { new_chat_member: {} }, MessageType.NewChatMember],
            ['poll', { poll: {} }, MessageType.Poll],
            ['location', { location: {} }, MessageType.Location],
            ['anything else', { dice: {} }, MessageType.Unknown]
        ];

        test.each(cases)('should detect a %s message', (_, fields, type) => {
            expect(incoming(fields).type).toBe(type);
        });
    });

    test('should use the caption as text when there is no text', () => {
        expect(incoming({ photo: [], caption: 'look' }).text).toBe('look');
        expect(incoming({ sticker: {} }).text).toBe('');
    });

    test('should keep the id of the replied message', () => {
        expect(
            incoming({ text: 'hi', reply_to_message: { message_id: 3 } })
                .replyToMessageId
        ).toBe(3);
        expect(incoming({ text: 'hi' }).replyToMessageId).toBeUndefined();
    });

    test('should name group chats by title and id, and private chats DM', () => {
        expect(incoming({ text: 'hi' }).chatInfo.name).toBe('Group 100');
        expect(
            incoming({ text: 'hi', chat: { id: 5, type: 'private' } }).chatInfo
                .name
        ).toBe('DM');
    });
});
