import { describe, test, expect } from 'bun:test';
import { ChatHistoryMessage } from '../../src/dtos/chatHistoryMessage';
import { MessageType } from '../../src/types/messageTypes';
import { TraceId } from '../../src/types/trace';
import type { TelegramUser } from '../../src/types/externalAliases';

describe('ChatHistoryMessage', () => {
    describe('constructor', () => {
        test('should store message id', () => {
            const msg = new ChatHistoryMessage(
                42,
                undefined,
                'hello',
                MessageType.Text,
                'trace:123' as TraceId,
                undefined,
                1000
            );

            expect(msg.id).toBe(42);
        });

        test('should store from user when provided', () => {
            const user = {
                id: 1,
                is_bot: false,
                first_name: 'Alice'
            } as TelegramUser;

            const msg = new ChatHistoryMessage(
                1,
                user,
                '',
                MessageType.Text,
                'trace:1' as TraceId,
                undefined,
                0
            );

            expect(msg.from).toBe(user);
        });

        test('should store undefined from when not provided', () => {
            const msg = new ChatHistoryMessage(
                1,
                undefined,
                '',
                MessageType.Text,
                'trace:1' as TraceId,
                undefined,
                0
            );

            expect(msg.from).toBeUndefined();
        });

        test('should store text', () => {
            const msg = new ChatHistoryMessage(
                1,
                undefined,
                'hello world',
                MessageType.Text,
                'trace:1' as TraceId,
                undefined,
                0
            );

            expect(msg.text).toBe('hello world');
        });

        test('should store message type', () => {
            const msg = new ChatHistoryMessage(
                1,
                undefined,
                '',
                MessageType.Photo,
                'trace:1' as TraceId,
                undefined,
                0
            );

            expect(msg.type).toBe(MessageType.Photo);
        });

        test('should store traceId', () => {
            const traceId = 'trace:abc' as TraceId;

            const msg = new ChatHistoryMessage(
                1,
                undefined,
                '',
                MessageType.Text,
                traceId,
                undefined,
                0
            );

            expect(msg.traceId).toBe(traceId);
        });

        test('should store replyToId when provided', () => {
            const msg = new ChatHistoryMessage(
                1,
                undefined,
                '',
                MessageType.Text,
                'trace:1' as TraceId,
                99,
                0
            );

            expect(msg.replyToId).toBe(99);
        });

        test('should store undefined replyToId when not provided', () => {
            const msg = new ChatHistoryMessage(
                1,
                undefined,
                '',
                MessageType.Text,
                'trace:1' as TraceId,
                undefined,
                0
            );

            expect(msg.replyToId).toBeUndefined();
        });

        test('should store date as unix timestamp', () => {
            const msg = new ChatHistoryMessage(
                1,
                undefined,
                '',
                MessageType.Text,
                'trace:1' as TraceId,
                undefined,
                1700000000
            );

            expect(msg.date).toBe(1700000000);
        });
    });
});
