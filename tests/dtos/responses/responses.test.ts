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
import { PostSendOperation } from '../../../src/types/postSendOperations';
import { Milliseconds } from '../../../src/types/timeValues';

function createMockAction(): IAction {
    return {
        key: 'test:action' as ActionKey
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

        test('should preserve content and sending options', () => {
            const chatInfo = createMockChatInfo();
            const traceId = createMockTraceId();
            const action = createMockAction();
            const keyboard = [[{ text: 'Button', callback_data: 'data' }]];

            const msg = new TextMessage(
                'message',
                chatInfo,
                traceId,
                action,
                new ReplyInfo(1, undefined),
                { disableWebPreview: true, keyboard }
            );

            const quoteless = msg.messageWithoutReplyInfo;

            expect(quoteless.content).toBe('message');
            expect(quoteless.disableWebPreview).toBe(true);
            expect(quoteless.keyboard).toBe(keyboard);
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

describe.each([
    {
        name: 'TextMessage',
        create: (replyInfo: ReplyInfo) =>
            new TextMessage(
                'text',
                createMockChatInfo(),
                createMockTraceId(),
                createMockAction(),
                replyInfo
            )
    },
    {
        name: 'ImageMessage',
        create: (replyInfo: ReplyInfo) =>
            new ImageMessage(
                { source: './test.png' },
                createMockChatInfo(),
                createMockTraceId(),
                createMockAction(),
                replyInfo
            )
    },
    {
        name: 'VideoMessage',
        create: (replyInfo: ReplyInfo) =>
            new VideoMessage(
                { source: './test.mp4' },
                createMockChatInfo(),
                createMockTraceId(),
                createMockAction(),
                replyInfo
            )
    }
])('$name messageWithoutReplyInfo', ({ create }) => {
    test('should preserve post-send operations', () => {
        const msg = create(new ReplyInfo(1, 'quote'));
        const operations: PostSendOperation[] = [
            { kind: 'pin' },
            { kind: 'deleteAfterTimeout', timeout: 1000 as Milliseconds }
        ];
        msg.postSendOperations.push(...operations);

        const quoteless = msg.messageWithoutReplyInfo;

        expect(quoteless.postSendOperations).toEqual(operations);
        expect(quoteless.postSendOperations).not.toBe(msg.postSendOperations);
    });
});
