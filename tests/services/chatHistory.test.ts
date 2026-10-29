import { describe, test, expect } from 'bun:test';
import { ChatHistory } from '../../src/services/chatHistory';
import { IncomingMessage } from '../../src/dtos/incomingMessage';
import { MESSAGE_HISTORY_LENGTH_LIMIT } from '../../src/helpers/constants';
import type { Message } from '../../src/types/botApi.generated';

function message(id: number, chatId = 100) {
    return new IncomingMessage(
        {
            message_id: id,
            date: 0,
            chat: { id: chatId, type: 'private' },
            text: `message ${id}`
        } as Message,
        'TestBot',
        []
    );
}

describe('ChatHistory', () => {
    test('should keep only the latest messages once the limit is reached', () => {
        const history = new ChatHistory();
        const total = MESSAGE_HISTORY_LENGTH_LIMIT + 5;

        for (let id = 1; id <= total; id++) {
            history.add(message(id));
        }

        const ids = history.getFor(100).map((x) => x.id);
        expect(ids).toHaveLength(MESSAGE_HISTORY_LENGTH_LIMIT);
        expect(ids[0]).toBe(6);
        expect(ids.at(-1)).toBe(total);
    });

    test('should keep the history of each chat separately', () => {
        const history = new ChatHistory();

        history.add(message(1, 100));
        history.add(message(2, 200));

        expect(history.getFor(100).map((x) => x.id)).toEqual([1]);
        expect(history.getFor(200).map((x) => x.id)).toEqual([2]);
        expect(history.getFor(300)).toEqual([]);
    });
});
