import { describe, test, expect, mock } from 'bun:test';
import { MessageContextInternal } from '../../../src/entities/context/messageContext';
import { ActionStateBase } from '../../../src/entities/states/actionStateBase';
import { TypedEventEmitter } from '../../../src/types/events';
import { TextMessage } from '../../../src/dtos/responses/textMessage';
import { ImageMessage } from '../../../src/dtos/responses/imageMessage';
import { VideoMessage } from '../../../src/dtos/responses/videoMessage';
import { Reaction } from '../../../src/dtos/responses/reaction';
import { ActionKey } from '../../../src/types/action';
import { ChatInfo } from '../../../src/dtos/chatInfo';
import { TraceId } from '../../../src/types/trace';
import { MessageInfo } from '../../../src/dtos/messageInfo';
import { UserInfo } from '../../../src/dtos/userInfo';
import { MessageType } from '../../../src/types/messageTypes';
import { Seconds } from '../../../src/types/timeValues';
import { CommandAction } from '../../../src/entities/actions/commandAction';
import { Message, UserFromGetMe } from '@telegraf/types';
import {
    createMockStorage,
    createMockScheduler
} from '../../services/actionProcessors/processorTestHelpers';

function createMockCommandAction(): CommandAction<ActionStateBase> {
    return {
        key: 'command:test-action' as ActionKey,
        name: 'test-action',
        stateConstructor: () => new ActionStateBase(),
        exec: mock(() => Promise.resolve([])),
        triggers: [],
        handler: mock(() => Promise.resolve()),
        condition: () => true,
        ratelimitSemaphores: new Map(),
        maxAllowedSimultaniousExecutions: 1,
        readmeFactory: () => ''
    } as unknown as CommandAction<ActionStateBase>;
}

function createMessageContext(
    messageText: string = 'test message'
): MessageContextInternal<ActionStateBase> {
    const storage = createMockStorage();
    const scheduler = createMockScheduler();
    const eventEmitter = new TypedEventEmitter();

    const ctx = new MessageContextInternal<ActionStateBase>(
        storage,
        scheduler,
        eventEmitter
    );
    ctx.isInitialized = true;
    ctx.action = createMockCommandAction();
    ctx.chatInfo = new ChatInfo(12345, 'Test Chat', []);
    ctx.traceId = 'trace-123' as TraceId;
    ctx.botName = 'TestBot';
    ctx.messageInfo = new MessageInfo(
        100,
        messageText,
        MessageType.Text,
        {} as Message
    );
    ctx.userInfo = new UserInfo(999, 'TestUser');
    ctx.botInfo = {
        id: 111,
        is_bot: true,
        first_name: 'Bot',
        username: 'testbot',
        can_join_groups: true,
        can_read_all_group_messages: false,
        supports_inline_queries: false,
        can_connect_to_business: false,
        has_main_web_app: false
    } as UserFromGetMe;

    return ctx;
}

describe('MessageContextInternal', () => {
    describe('properties', () => {
        test('should have startCooldown default to true', () => {
            const ctx = createMessageContext();

            expect(ctx.startCooldown).toBe(true);
        });

        test('should have customCooldown as undefined by default', () => {
            const ctx = createMessageContext();

            expect(ctx.customCooldown).toBeUndefined();
        });

        test('should have empty matchResults by default', () => {
            const ctx = createMessageContext();

            expect(ctx.matchResults).toEqual([]);
        });
    });

    describe('skipCooldown', () => {
        test('should set startCooldown to false', () => {
            const ctx = createMessageContext();

            ctx.skipCooldown();

            expect(ctx.startCooldown).toBe(false);
        });
    });

    describe('startCustomCooldown', () => {
        test('should set startCooldown to true', () => {
            const ctx = createMessageContext();
            ctx.startCooldown = false;

            ctx.startCustomCooldown(60 as Seconds);

            expect(ctx.startCooldown).toBe(true);
        });

        test('should set customCooldown value', () => {
            const ctx = createMessageContext();
            const cooldown = 120 as Seconds;

            ctx.startCustomCooldown(cooldown);

            expect(ctx.customCooldown).toBe(cooldown);
        });
    });

    describe('reply.withText', () => {
        test('should add TextMessage to responses', () => {
            const ctx = createMessageContext();

            ctx.reply.withText('Hello!');

            expect(ctx.responses.length).toBe(1);
            expect(ctx.responses[0]).toBeInstanceOf(TextMessage);
        });

        test('should set reply info with message id', () => {
            const ctx = createMessageContext();

            ctx.reply.withText('Reply');

            const response = ctx.responses[0] as TextMessage;
            expect(response.replyInfo?.id).toBe(ctx.messageInfo.id);
        });

        test('should not include quote by default', () => {
            const ctx = createMessageContext();

            ctx.reply.withText('Reply');

            const response = ctx.responses[0] as TextMessage;
            expect(response.replyInfo?.quote).toBeUndefined();
        });

        test('should return capture controller', () => {
            const ctx = createMessageContext();

            const controller = ctx.reply.withText('Reply');

            expect(controller.captureReplies).toBeDefined();
        });
    });

    describe('reply.withImage', () => {
        test('should add ImageMessage to responses', () => {
            const ctx = createMessageContext();

            ctx.reply.withImage('test-image');

            expect(ctx.responses.length).toBe(1);
            expect(ctx.responses[0]).toBeInstanceOf(ImageMessage);
        });

        test('should set reply info with message id', () => {
            const ctx = createMessageContext();

            ctx.reply.withImage('test');

            const response = ctx.responses[0] as ImageMessage;
            expect(response.replyInfo?.id).toBe(ctx.messageInfo.id);
        });
    });

    describe('reply.withVideo', () => {
        test('should add VideoMessage to responses', () => {
            const ctx = createMessageContext();

            ctx.reply.withVideo('test-video');

            expect(ctx.responses.length).toBe(1);
            expect(ctx.responses[0]).toBeInstanceOf(VideoMessage);
        });

        test('should set reply info with message id', () => {
            const ctx = createMessageContext();

            ctx.reply.withVideo('test');

            const response = ctx.responses[0] as VideoMessage;
            expect(response.replyInfo?.id).toBe(ctx.messageInfo.id);
        });
    });

    describe('reply.withReaction', () => {
        test('should add Reaction to responses', () => {
            const ctx = createMessageContext();

            ctx.reply.withReaction('👍');

            expect(ctx.responses.length).toBe(1);
            expect(ctx.responses[0]).toBeInstanceOf(Reaction);
        });

        test('should set correct emoji', () => {
            const ctx = createMessageContext();

            ctx.reply.withReaction('❤');

            const response = ctx.responses[0] as Reaction;
            expect(response.emoji).toBe('❤');
        });

        test('should set correct message id', () => {
            const ctx = createMessageContext();

            ctx.reply.withReaction('👍');

            const response = ctx.responses[0] as Reaction;
            expect(response.messageId).toBe(ctx.messageInfo.id);
        });
    });

    describe('reply.andQuote.withText', () => {
        test('should add TextMessage to responses', () => {
            const ctx = createMessageContext('original message');

            ctx.reply.andQuote.withText('Quoted reply');

            expect(ctx.responses.length).toBe(1);
            expect(ctx.responses[0]).toBeInstanceOf(TextMessage);
        });

        test('should include quote from message text when no match results', () => {
            const ctx = createMessageContext('original message');

            ctx.reply.andQuote.withText('Quoted reply');

            const response = ctx.responses[0] as TextMessage;
            expect(response.replyInfo?.quote).toBe('original message');
        });

        test('should include quote from match results when available', () => {
            const ctx = createMessageContext('test 123 value');
            ctx.matchResults = [
                ['test 123', '123'] as unknown as RegExpMatchArray
            ];

            ctx.reply.andQuote.withText('Quoted reply');

            const response = ctx.responses[0] as TextMessage;
            expect(response.replyInfo?.quote).toBe('123');
        });

        test('should use custom quote string when provided', () => {
            const ctx = createMessageContext('original message');

            ctx.reply.andQuote.withText('Reply', 'custom quote');

            const response = ctx.responses[0] as TextMessage;
            expect(response.replyInfo?.quote).toBe('custom quote');
        });
    });

    describe('reply.andQuote.withImage', () => {
        test('should add ImageMessage with quote', () => {
            const ctx = createMessageContext('original message');

            ctx.reply.andQuote.withImage('test-image');

            const response = ctx.responses[0] as ImageMessage;
            expect(response.replyInfo?.quote).toBe('original message');
        });

        test('should use custom quote when provided', () => {
            const ctx = createMessageContext('original message');

            ctx.reply.andQuote.withImage('test-image', 'custom quote');

            const response = ctx.responses[0] as ImageMessage;
            expect(response.replyInfo?.quote).toBe('custom quote');
        });
    });

    describe('reply.andQuote.withVideo', () => {
        test('should add VideoMessage with quote', () => {
            const ctx = createMessageContext('original message');

            ctx.reply.andQuote.withVideo('test-video');

            const response = ctx.responses[0] as VideoMessage;
            expect(response.replyInfo?.quote).toBe('original message');
        });

        test('should use custom quote when provided', () => {
            const ctx = createMessageContext('original message');

            ctx.reply.andQuote.withVideo('test-video', 'custom quote');

            const response = ctx.responses[0] as VideoMessage;
            expect(response.replyInfo?.quote).toBe('custom quote');
        });
    });

    describe('inherited send methods', () => {
        test('send.text should work from parent class', () => {
            const ctx = createMessageContext();

            ctx.send.text('Standalone message');

            expect(ctx.responses.length).toBe(1);
            expect(ctx.responses[0]).toBeInstanceOf(TextMessage);

            const response = ctx.responses[0] as TextMessage;
            expect(response.replyInfo).toBeUndefined();
        });

        test('send.image should work from parent class', () => {
            const ctx = createMessageContext();

            ctx.send.image('standalone-image');

            expect(ctx.responses.length).toBe(1);
            expect(ctx.responses[0]).toBeInstanceOf(ImageMessage);
        });

        test('send.video should work from parent class', () => {
            const ctx = createMessageContext();

            ctx.send.video('standalone-video');

            expect(ctx.responses.length).toBe(1);
            expect(ctx.responses[0]).toBeInstanceOf(VideoMessage);
        });
    });

    describe('combined operations', () => {
        test('should support mixing send and reply operations', () => {
            const ctx = createMessageContext();

            ctx.reply.withText('Reply first');
            ctx.send.text('Then send');
            ctx.reply.withReaction('👍');

            expect(ctx.responses.length).toBe(3);
        });

        test('should maintain order of all operations', () => {
            const ctx = createMessageContext();

            ctx.send.text('1');
            ctx.reply.withText('2');
            ctx.send.image('3');
            ctx.reply.andQuote.withText('4');

            expect(ctx.responses.length).toBe(4);
        });
    });
});
