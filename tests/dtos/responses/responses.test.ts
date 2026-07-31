import { describe, test, expect } from 'bun:test';
import { PinResponse } from '../../../src/dtos/responses/pin';
import { ImageMessage } from '../../../src/dtos/responses/imageMessage';
import { TextMessage } from '../../../src/dtos/responses/textMessage';
import { VideoMessage } from '../../../src/dtos/responses/videoMessage';
import { ChatInfo } from '../../../src/dtos/chatInfo';
import { ReplyInfo } from '../../../src/dtos/replyInfo';
import { TraceId } from '../../../src/types/trace';
import { ActionKey, IAction } from '../../../src/types/action';
import { BotResponseTypes } from '../../../src/types/response';
import { mock } from 'bun:test';

function createMockAction(): IAction {
    return {
        key: 'test:action' as ActionKey,
        exec: mock(() => Promise.resolve([]))
    };
}

function createMockChatInfo(): ChatInfo {
    return new ChatInfo(12345, 'Test Chat', []);
}

function createMockTraceId(): TraceId {
    return 'trace:123' as TraceId;
}

describe('PinResponse', () => {
    describe('constructor', () => {
        test('should have kind pin', () => {
            const response = new PinResponse(
                42,
                createMockChatInfo(),
                createMockTraceId(),
                createMockAction()
            );

            expect(response.kind).toBe(BotResponseTypes.pin);
        });

        test('should store messageId', () => {
            const response = new PinResponse(
                99,
                createMockChatInfo(),
                createMockTraceId(),
                createMockAction()
            );

            expect(response.messageId).toBe(99);
        });

        test('should store chatInfo', () => {
            const chatInfo = createMockChatInfo();
            const response = new PinResponse(
                1,
                chatInfo,
                createMockTraceId(),
                createMockAction()
            );

            expect(response.chatInfo).toBe(chatInfo);
        });

        test('should store traceId', () => {
            const traceId = createMockTraceId();
            const response = new PinResponse(
                1,
                createMockChatInfo(),
                traceId,
                createMockAction()
            );

            expect(response.traceId).toBe(traceId);
        });

        test('should store action', () => {
            const action = createMockAction();
            const response = new PinResponse(
                1,
                createMockChatInfo(),
                createMockTraceId(),
                action
            );

            expect(response.action).toBe(action);
        });

        test('should record createdAt timestamp', () => {
            const before = Date.now();
            const response = new PinResponse(
                1,
                createMockChatInfo(),
                createMockTraceId(),
                createMockAction()
            );
            const after = Date.now();

            expect(response.createdAt).toBeGreaterThanOrEqual(before);
            expect(response.createdAt).toBeLessThanOrEqual(after);
        });
    });
});

describe('ImageMessage', () => {
    describe('messageWithoutReplyInfo', () => {
        test('should return a new ImageMessage without replyInfo', () => {
            const chatInfo = createMockChatInfo();
            const traceId = createMockTraceId();
            const action = createMockAction();
            const replyInfo = new ReplyInfo(100, 'quoted text');

            const msg = new ImageMessage(
                { source: './test.png' },
                chatInfo,
                traceId,
                action,
                replyInfo
            );

            const quoteless = msg.messageWithoutReplyInfo;

            expect(quoteless).toBeInstanceOf(ImageMessage);
            expect(quoteless.replyInfo).toBeUndefined();
        });

        test('should preserve content, chatInfo, traceId and action', () => {
            const chatInfo = createMockChatInfo();
            const traceId = createMockTraceId();
            const action = createMockAction();
            const content = { source: './test.png' };

            const msg = new ImageMessage(
                content,
                chatInfo,
                traceId,
                action,
                new ReplyInfo(1, undefined)
            );

            const quoteless = msg.messageWithoutReplyInfo;

            expect(quoteless.content).toEqual(content);
            expect(quoteless.chatInfo).toBe(chatInfo);
            expect(quoteless.traceId).toBe(traceId);
            expect(quoteless.action).toBe(action);
        });
    });
});

describe('TextMessage', () => {
    describe('messageWithoutReplyInfo', () => {
        test('should return a new TextMessage without replyInfo', () => {
            const chatInfo = createMockChatInfo();
            const traceId = createMockTraceId();
            const action = createMockAction();
            const replyInfo = new ReplyInfo(100, 'quoted text');

            const msg = new TextMessage(
                'Hello',
                chatInfo,
                traceId,
                action,
                replyInfo
            );

            const quoteless = msg.messageWithoutReplyInfo;

            expect(quoteless).toBeInstanceOf(TextMessage);
            expect(quoteless.replyInfo).toBeUndefined();
        });

        test('should preserve content and pin option', () => {
            const chatInfo = createMockChatInfo();
            const traceId = createMockTraceId();
            const action = createMockAction();

            const msg = new TextMessage(
                'pinned message',
                chatInfo,
                traceId,
                action,
                new ReplyInfo(1, undefined),
                { pin: true }
            );

            const quoteless = msg.messageWithoutReplyInfo;

            expect(quoteless.content).toBe('pinned message');
            expect(quoteless.shouldPin).toBe(true);
        });

        test('should preserve chatInfo, traceId and action', () => {
            const chatInfo = createMockChatInfo();
            const traceId = createMockTraceId();
            const action = createMockAction();

            const msg = new TextMessage(
                'text',
                chatInfo,
                traceId,
                action,
                new ReplyInfo(1, undefined)
            );

            const quoteless = msg.messageWithoutReplyInfo;

            expect(quoteless.chatInfo).toBe(chatInfo);
            expect(quoteless.traceId).toBe(traceId);
            expect(quoteless.action).toBe(action);
        });
    });
});

describe('VideoMessage', () => {
    describe('messageWithoutReplyInfo', () => {
        test('should return a new VideoMessage without replyInfo', () => {
            const chatInfo = createMockChatInfo();
            const traceId = createMockTraceId();
            const action = createMockAction();
            const replyInfo = new ReplyInfo(100, 'quoted text');

            const msg = new VideoMessage(
                { source: './test.mp4' },
                chatInfo,
                traceId,
                action,
                replyInfo
            );

            const quoteless = msg.messageWithoutReplyInfo;

            expect(quoteless).toBeInstanceOf(VideoMessage);
            expect(quoteless.replyInfo).toBeUndefined();
        });

        test('should preserve content, chatInfo, traceId and action', () => {
            const chatInfo = createMockChatInfo();
            const traceId = createMockTraceId();
            const action = createMockAction();
            const content = { source: './test.mp4' };

            const msg = new VideoMessage(
                content,
                chatInfo,
                traceId,
                action,
                new ReplyInfo(1, undefined)
            );

            const quoteless = msg.messageWithoutReplyInfo;

            expect(quoteless.content).toEqual(content);
            expect(quoteless.chatInfo).toBe(chatInfo);
            expect(quoteless.traceId).toBe(traceId);
            expect(quoteless.action).toBe(action);
        });
    });
});
