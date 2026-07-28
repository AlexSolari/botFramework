import { describe, test, expect, mock } from 'bun:test';
import { ReplyContextInternal } from '../../../src/entities/context/replyContext';
import { ReplyCaptureAction } from '../../../src/entities/actions/replyCaptureAction';
import { ActionStateBase } from '../../../src/entities/states/actionStateBase';
import { TypedEventEmitter } from '../../../src/types/events';
import { TextMessage } from '../../../src/dtos/responses/textMessage';
import { ImageMessage } from '../../../src/dtos/responses/imageMessage';
import { VideoMessage } from '../../../src/dtos/responses/videoMessage';
import { Reaction } from '../../../src/dtos/responses/reaction';
import { ActionKey, IAction } from '../../../src/types/action';
import { IncomingMessage } from '../../../src/dtos/incomingMessage';
import { BotResponseTypes } from '../../../src/types/response';
import type { BotInfo } from '../../../src/types/externalAliases';
import { Message } from '@telegraf/types';
import {
    createMockStorage,
    createMockScheduler
} from '../../services/actionProcessors/processorTestHelpers';

function createMockParentAction(): IAction {
    return {
        key: 'command:parent' as ActionKey,
        exec: mock(() => Promise.resolve([]))
    };
}

function createMockBotInfo(): BotInfo {
    return {
        id: 111,
        is_bot: true,
        first_name: 'TestBot',
        username: 'testbot',
        can_join_groups: true,
        can_read_all_group_messages: false,
        supports_inline_queries: false,
        can_connect_to_business: false
    } as unknown as BotInfo;
}

function createReplyContext(
    options: {
        messageText?: string;
        fromId?: number;
        fromFirstName?: string;
        fromLastName?: string;
        fromUsername?: string;
        replyToMessageId?: number;
        triggers?: (string | RegExp)[];
    } = {}
): ReplyContextInternal<ActionStateBase> {
    const storage = createMockStorage();
    const scheduler = createMockScheduler();
    const eventEmitter = new TypedEventEmitter();
    const parentAction = createMockParentAction();

    const telegramMessage: Message = {
        message_id: 200,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 99999, type: 'private' as const },
        from: {
            id: options.fromId ?? 123,
            is_bot: false,
            first_name: options.fromFirstName ?? 'John',
            last_name: options.fromLastName,
            username: options.fromUsername
        },
        text: options.messageText ?? 'test reply',
        ...(options.replyToMessageId !== undefined && {
            reply_to_message: {
                message_id: options.replyToMessageId
            } as Message
        })
    } as Message;

    const incomingMessage = new IncomingMessage(telegramMessage, 'TestBot', []);

    const abortController = new AbortController();
    const action = new ReplyCaptureAction<ActionStateBase>(
        100,
        parentAction,
        mock(() => Promise.resolve()),
        options.triggers ?? ['test reply'],
        abortController
    );

    return new ReplyContextInternal<ActionStateBase>(
        storage,
        scheduler,
        eventEmitter,
        action,
        incomingMessage,
        'TestBot',
        createMockBotInfo()
    );
}

describe('ReplyContextInternal', () => {
    describe('constructor', () => {
        test('should set replyMessageId from incoming message', () => {
            const ctx = createReplyContext({ replyToMessageId: 55 });

            expect(ctx.replyMessageId).toBe(55);
        });

        test('should set replyMessageId to undefined when no reply', () => {
            const ctx = createReplyContext();

            expect(ctx.replyMessageId).toBeUndefined();
        });

        test('should build userInfo with first and last name', () => {
            const ctx = createReplyContext({
                fromFirstName: 'Alice',
                fromLastName: 'Smith'
            });

            expect(ctx.userInfo.name).toBe('Alice Smith');
        });

        test('should build userInfo with first name only', () => {
            const ctx = createReplyContext({ fromFirstName: 'Bob' });

            expect(ctx.userInfo.name).toBe('Bob');
        });

        test('should build userInfo with username when provided', () => {
            const ctx = createReplyContext({ fromUsername: 'alice_bot' });

            expect(ctx.userInfo.usertag).toBe('@alice_bot');
        });

        test('should build userInfo with Unknown user when no username', () => {
            const ctx = createReplyContext({ fromUsername: undefined });

            expect(ctx.userInfo.usertag).toBe('Unknown user');
        });

        test('should set messageInfo with message text', () => {
            const ctx = createReplyContext({ messageText: 'hello reply' });

            expect(ctx.messageInfo.text).toBe('hello reply');
        });

        test('should set botInfo', () => {
            const ctx = createReplyContext();

            expect(ctx.botInfo).toBeDefined();
            expect(ctx.botInfo.is_bot).toBe(true);
        });

        test('should have empty matchResults by default', () => {
            const ctx = createReplyContext();

            expect(ctx.matchResults).toEqual([]);
        });

        test('should have empty responses by default', () => {
            const ctx = createReplyContext();

            expect(ctx.responses).toEqual([]);
        });
    });

    describe('reply.withText', () => {
        test('should add a TextMessage to responses', () => {
            const ctx = createReplyContext();

            ctx.reply.withText('Hello!');

            expect(ctx.responses.length).toBe(1);
            expect(ctx.responses[0]).toBeInstanceOf(TextMessage);
        });

        test('should set text content', () => {
            const ctx = createReplyContext();

            ctx.reply.withText('Reply text');

            const response = ctx.responses[0] as TextMessage;
            expect(response.content).toBe('Reply text');
        });

        test('should set replyInfo with the triggering message id', () => {
            const ctx = createReplyContext();

            ctx.reply.withText('Reply');

            const response = ctx.responses[0] as TextMessage;
            expect(response.replyInfo).toBeDefined();
            expect(response.replyInfo!.id).toBe(200);
        });

        test('should not include quote by default', () => {
            const ctx = createReplyContext({ messageText: 'quoted text' });

            ctx.reply.withText('Reply');

            const response = ctx.responses[0] as TextMessage;
            expect(response.replyInfo!.quote).toBeUndefined();
        });

        test('should return capture controller', () => {
            const ctx = createReplyContext();

            const controller = ctx.reply.withText('Hello');

            expect(controller).toBeDefined();
        });
    });

    describe('reply.withImage', () => {
        test('should add an ImageMessage to responses', () => {
            const ctx = createReplyContext();

            ctx.reply.withImage('test-image');

            expect(ctx.responses.length).toBe(1);
            expect(ctx.responses[0]).toBeInstanceOf(ImageMessage);
        });

        test('should set image source with .png extension', () => {
            const ctx = createReplyContext();

            ctx.reply.withImage('my-photo');

            const response = ctx.responses[0] as ImageMessage;
            expect((response.content as { source: string }).source).toContain(
                'my-photo.png'
            );
        });

        test('should set replyInfo with the triggering message id', () => {
            const ctx = createReplyContext();

            ctx.reply.withImage('photo');

            const response = ctx.responses[0] as ImageMessage;
            expect(response.replyInfo).toBeDefined();
            expect(response.replyInfo!.id).toBe(200);
        });

        test('should return capture controller', () => {
            const ctx = createReplyContext();

            const controller = ctx.reply.withImage('photo');

            expect(controller).toBeDefined();
        });
    });

    describe('reply.withVideo', () => {
        test('should add a VideoMessage to responses', () => {
            const ctx = createReplyContext();

            ctx.reply.withVideo('test-video');

            expect(ctx.responses.length).toBe(1);
            expect(ctx.responses[0]).toBeInstanceOf(VideoMessage);
        });

        test('should set video source with .mp4 extension', () => {
            const ctx = createReplyContext();

            ctx.reply.withVideo('my-video');

            const response = ctx.responses[0] as VideoMessage;
            expect((response.content as { source: string }).source).toContain(
                'my-video.mp4'
            );
        });

        test('should set replyInfo with the triggering message id', () => {
            const ctx = createReplyContext();

            ctx.reply.withVideo('video');

            const response = ctx.responses[0] as VideoMessage;
            expect(response.replyInfo).toBeDefined();
            expect(response.replyInfo!.id).toBe(200);
        });

        test('should return capture controller', () => {
            const ctx = createReplyContext();

            const controller = ctx.reply.withVideo('video');

            expect(controller).toBeDefined();
        });
    });

    describe('reply.withReaction', () => {
        test('should add a Reaction to responses', () => {
            const ctx = createReplyContext();

            ctx.reply.withReaction('👍');

            expect(ctx.responses.length).toBe(1);
            expect(ctx.responses[0].kind).toBe(BotResponseTypes.react);
        });

        test('should set the correct emoji', () => {
            const ctx = createReplyContext();

            ctx.reply.withReaction('❤️');

            const response = ctx.responses[0] as Reaction;
            expect(response.emoji).toBe('❤️');
        });

        test('should set the correct message id', () => {
            const ctx = createReplyContext();

            ctx.reply.withReaction('👍');

            const response = ctx.responses[0] as Reaction;
            expect(response.messageId).toBe(200);
        });
    });

    describe('reply.andQuote.withText', () => {
        test('should add a TextMessage with quote', () => {
            const ctx = createReplyContext({ messageText: 'quote this' });

            ctx.reply.andQuote.withText('Reply with quote');

            const response = ctx.responses[0] as TextMessage;
            expect(response).toBeInstanceOf(TextMessage);
            expect(response.replyInfo).toBeDefined();
        });

        test('should include message text as quote when no match results', () => {
            const ctx = createReplyContext({ messageText: 'quote this text' });

            ctx.reply.andQuote.withText('Reply');

            const response = ctx.responses[0] as TextMessage;
            expect(response.replyInfo!.quote).toBe('quote this text');
        });

        test('should use custom quote string when provided', () => {
            const ctx = createReplyContext({ messageText: 'some text' });

            ctx.reply.andQuote.withText('Reply', 'my custom quote');

            const response = ctx.responses[0] as TextMessage;
            expect(response.replyInfo!.quote).toBe('my custom quote');
        });

        test('should return capture controller', () => {
            const ctx = createReplyContext();

            const controller = ctx.reply.andQuote.withText('Reply');

            expect(controller).toBeDefined();
        });
    });

    describe('reply.andQuote.withImage', () => {
        test('should add an ImageMessage with quote', () => {
            const ctx = createReplyContext({ messageText: 'quoted' });

            ctx.reply.andQuote.withImage('photo');

            const response = ctx.responses[0] as ImageMessage;
            expect(response).toBeInstanceOf(ImageMessage);
            expect(response.replyInfo).toBeDefined();
            expect(response.replyInfo!.quote).toBe('quoted');
        });

        test('should use custom quote when provided', () => {
            const ctx = createReplyContext({ messageText: 'text' });

            ctx.reply.andQuote.withImage('photo', 'custom quote');

            const response = ctx.responses[0] as ImageMessage;
            expect(response.replyInfo!.quote).toBe('custom quote');
        });

        test('should return capture controller', () => {
            const ctx = createReplyContext();

            const controller = ctx.reply.andQuote.withImage('photo');

            expect(controller).toBeDefined();
        });
    });

    describe('reply.andQuote.withVideo', () => {
        test('should add a VideoMessage with quote', () => {
            const ctx = createReplyContext({ messageText: 'quoted' });

            ctx.reply.andQuote.withVideo('video');

            const response = ctx.responses[0] as VideoMessage;
            expect(response).toBeInstanceOf(VideoMessage);
            expect(response.replyInfo).toBeDefined();
            expect(response.replyInfo!.quote).toBe('quoted');
        });

        test('should use custom quote when provided', () => {
            const ctx = createReplyContext({ messageText: 'text' });

            ctx.reply.andQuote.withVideo('video', 'custom quote');

            const response = ctx.responses[0] as VideoMessage;
            expect(response.replyInfo!.quote).toBe('custom quote');
        });

        test('should return capture controller', () => {
            const ctx = createReplyContext();

            const controller = ctx.reply.andQuote.withVideo('video');

            expect(controller).toBeDefined();
        });
    });

    describe('action handler', () => {
        test('handler function is invocable', async () => {
            const ctx = createReplyContext();
            // Call the action's handler directly to cover the mock function body
            await ctx.action.handler(
                ctx as unknown as Parameters<typeof ctx.action.handler>[0]
            );
            expect(ctx.action.handler).toBeDefined();
        });
    });

    describe('stopCapture', () => {
        test('should abort the action abort controller', () => {
            const storage = createMockStorage();
            const scheduler = createMockScheduler();
            const eventEmitter = new TypedEventEmitter();
            const parentAction = createMockParentAction();
            const abortController = new AbortController();
            let aborted = false;
            abortController.signal.addEventListener('abort', () => {
                aborted = true;
            });

            const telegramMessage: Message = {
                message_id: 1,
                date: 0,
                chat: { id: 1, type: 'private' as const },
                from: { id: 1, is_bot: false, first_name: 'Test' },
                text: 'test'
            } as Message;

            const incomingMessage = new IncomingMessage(
                telegramMessage,
                'TestBot',
                []
            );

            const action = new ReplyCaptureAction<ActionStateBase>(
                1,
                parentAction,
                mock(() => Promise.resolve()),
                ['test'],
                abortController
            );

            const ctx = new ReplyContextInternal<ActionStateBase>(
                storage,
                scheduler,
                eventEmitter,
                action,
                incomingMessage,
                'TestBot',
                createMockBotInfo()
            );

            ctx.stopCapture();

            expect(aborted).toBe(true);
        });
    });
});
