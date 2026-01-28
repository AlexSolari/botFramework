import { describe, test, expect, mock } from 'bun:test';
import { ReplyCaptureAction } from '../../../src/entities/actions/replyCaptureAction';
import { ReplyContextInternal } from '../../../src/entities/context/replyContext';
import { ActionKey, IAction } from '../../../src/types/action';
import { TypedEventEmitter, BotEventType } from '../../../src/types/events';
import { Noop } from '../../../src/helpers/noop';
import { ActionStateBase } from '../../../src/entities/states/actionStateBase';
import { MessageInfo } from '../../../src/dtos/messageInfo';
import { MessageType, MessageTypeValue } from '../../../src/types/messageTypes';
import { UserInfo } from '../../../src/dtos/userInfo';
import { Message } from '@telegraf/types';
import {
    createMockStorage,
    createMockScheduler
} from '../../services/actionProcessors/processorTestHelpers';

function createMockParentAction(): IAction {
    return {
        key: 'command:parent-action' as ActionKey,
        exec: mock(() => Promise.resolve([]))
    };
}

function createMockReplyContext(
    replyMessageId: number | undefined,
    messageText: string,
    messageType: MessageTypeValue = MessageType.Text
): ReplyContextInternal<ActionStateBase> {
    const storage = createMockStorage();
    const scheduler = createMockScheduler();
    const eventEmitter = new TypedEventEmitter();

    const ctx = new ReplyContextInternal<ActionStateBase>(
        storage,
        scheduler,
        eventEmitter
    );
    ctx.isInitialized = true;
    ctx.replyMessageId = replyMessageId;
    ctx.messageInfo = new MessageInfo(
        100,
        messageText,
        messageType,
        {} as Message
    );
    ctx.userInfo = new UserInfo(123, 'TestUser');

    return ctx;
}

describe('ReplyCaptureAction', () => {
    describe('constructor', () => {
        test('should set parentMessageId', () => {
            const action = new ReplyCaptureAction(
                123,
                createMockParentAction(),
                mock(() => Promise.resolve()),
                ['yes'],
                new AbortController()
            );

            expect(action.parentMessageId).toBe(123);
        });

        test('should set triggers', () => {
            const triggers = ['yes', 'no', /maybe/];
            const action = new ReplyCaptureAction(
                123,
                createMockParentAction(),
                mock(() => Promise.resolve()),
                triggers,
                new AbortController()
            );

            expect(action.triggers).toBe(triggers);
        });

        test('should set handler', () => {
            const handler = mock(() => Promise.resolve());
            const action = new ReplyCaptureAction(
                123,
                createMockParentAction(),
                handler,
                ['yes'],
                new AbortController()
            );

            expect(action.handler).toBe(handler);
        });

        test('should set abortController', () => {
            const abortController = new AbortController();
            const action = new ReplyCaptureAction(
                123,
                createMockParentAction(),
                mock(() => Promise.resolve()),
                ['yes'],
                abortController
            );

            expect(action.abortController).toBe(abortController);
        });

        test('should generate key with capture prefix and parent action key', () => {
            const parentAction = createMockParentAction();
            const action = new ReplyCaptureAction(
                123,
                parentAction,
                mock(() => Promise.resolve()),
                ['yes'],
                new AbortController()
            );

            expect(
                action.key.startsWith('capture:command:parent-action:')
            ).toBe(true);
        });

        test('should generate unique keys for different instances', () => {
            const parentAction = createMockParentAction();

            const action1 = new ReplyCaptureAction(
                123,
                parentAction,
                mock(() => Promise.resolve()),
                ['yes'],
                new AbortController()
            );

            const action2 = new ReplyCaptureAction(
                123,
                parentAction,
                mock(() => Promise.resolve()),
                ['yes'],
                new AbortController()
            );

            expect(action1.key).not.toBe(action2.key);
        });
    });

    describe('exec', () => {
        test('should throw if context is not initialized', () => {
            const action = new ReplyCaptureAction(
                123,
                createMockParentAction(),
                mock(() => Promise.resolve()),
                ['yes'],
                new AbortController()
            );

            const ctx = createMockReplyContext(123, 'yes');
            ctx.isInitialized = false;

            expect(() => action.exec(ctx)).toThrow(
                'is not initialized or already consumed'
            );
        });

        test('should return NoResponse if reply is not to parent message', async () => {
            const action = new ReplyCaptureAction(
                123,
                createMockParentAction(),
                mock(() => Promise.resolve()),
                ['yes'],
                new AbortController()
            );

            const ctx = createMockReplyContext(999, 'yes'); // Different message id
            const result = await action.exec(ctx);

            expect(result).toBe(Noop.NoResponse);
        });

        test('should return NoResponse if reply message id is undefined', async () => {
            const action = new ReplyCaptureAction(
                123,
                createMockParentAction(),
                mock(() => Promise.resolve()),
                ['yes'],
                new AbortController()
            );

            const ctx = createMockReplyContext(undefined, 'yes');
            const result = await action.exec(ctx);

            expect(result).toBe(Noop.NoResponse);
        });

        test('should return NoResponse if no trigger matches', async () => {
            const handler = mock(() => Promise.resolve());
            const action = new ReplyCaptureAction(
                123,
                createMockParentAction(),
                handler,
                ['yes', 'no'],
                new AbortController()
            );

            const ctx = createMockReplyContext(123, 'maybe');
            const result = await action.exec(ctx);

            expect(result).toBe(Noop.NoResponse);
            expect(handler).not.toHaveBeenCalled();
        });

        test('should execute handler when string trigger matches (case-insensitive)', async () => {
            const handler = mock(() => Promise.resolve());
            const action = new ReplyCaptureAction(
                123,
                createMockParentAction(),
                handler,
                ['YES'],
                new AbortController()
            );

            const ctx = createMockReplyContext(123, 'yes');
            await action.exec(ctx);

            expect(handler).toHaveBeenCalledTimes(1);
        });

        test('should execute handler when regex trigger matches', async () => {
            const handler = mock(() => Promise.resolve());
            const action = new ReplyCaptureAction(
                123,
                createMockParentAction(),
                handler,
                [/\d+/],
                new AbortController()
            );

            const ctx = createMockReplyContext(123, 'order 42');
            await action.exec(ctx);

            expect(handler).toHaveBeenCalledTimes(1);
        });

        test('should execute handler when MessageType trigger matches', async () => {
            const handler = mock(() => Promise.resolve());
            const action = new ReplyCaptureAction(
                123,
                createMockParentAction(),
                handler,
                [MessageType.Photo],
                new AbortController()
            );

            const ctx = createMockReplyContext(123, '', MessageType.Photo);
            await action.exec(ctx);

            expect(handler).toHaveBeenCalledTimes(1);
        });

        test('should set matchResults on context for regex trigger', async () => {
            const action = new ReplyCaptureAction(
                123,
                createMockParentAction(),
                mock(() => Promise.resolve()),
                [/order (\d+)/],
                new AbortController()
            );

            const ctx = createMockReplyContext(123, 'order 42');
            await action.exec(ctx);

            expect(ctx.matchResults.length).toBe(1);
            expect(ctx.matchResults[0][0]).toBe('order 42');
            expect(ctx.matchResults[0][1]).toBe('42');
        });

        test('should handle global regex with multiple matches', async () => {
            const action = new ReplyCaptureAction(
                123,
                createMockParentAction(),
                mock(() => Promise.resolve()),
                [/\d+/g],
                new AbortController()
            );

            const ctx = createMockReplyContext(123, '1 2 3 4 5');
            await action.exec(ctx);

            expect(ctx.matchResults.length).toBe(5);
        });

        test('should emit replyActionExecuting event before handler', async () => {
            const events: string[] = [];
            const handler = mock(() => {
                events.push('handler');
                return Promise.resolve();
            });
            const action = new ReplyCaptureAction(
                123,
                createMockParentAction(),
                handler,
                ['yes'],
                new AbortController()
            );

            const ctx = createMockReplyContext(123, 'yes');
            ctx.eventEmitter.on(BotEventType.replyActionExecuting, () => {
                events.push('executing');
            });

            await action.exec(ctx);

            expect(events).toEqual(['executing', 'handler']);
        });

        test('should emit replyActionExecuted event after handler', async () => {
            const events: string[] = [];
            const handler = mock(() => {
                events.push('handler');
                return Promise.resolve();
            });
            const action = new ReplyCaptureAction(
                123,
                createMockParentAction(),
                handler,
                ['yes'],
                new AbortController()
            );

            const ctx = createMockReplyContext(123, 'yes');
            ctx.eventEmitter.on(BotEventType.replyActionExecuted, () => {
                events.push('executed');
            });

            await action.exec(ctx);

            expect(events).toEqual(['handler', 'executed']);
        });

        test('should return context responses after execution', async () => {
            const action = new ReplyCaptureAction(
                123,
                createMockParentAction(),
                mock(() => Promise.resolve()),
                ['yes'],
                new AbortController()
            );

            const ctx = createMockReplyContext(123, 'yes');
            const result = await action.exec(ctx);

            expect(result).toBe(ctx.responses);
        });

        test('should try all triggers until one matches', async () => {
            const handler = mock(() => Promise.resolve());
            const action = new ReplyCaptureAction(
                123,
                createMockParentAction(),
                handler,
                ['no', 'maybe', 'yes'],
                new AbortController()
            );

            const ctx = createMockReplyContext(123, 'yes');
            await action.exec(ctx);

            expect(handler).toHaveBeenCalledTimes(1);
        });

        test('should use mergeWith to combine trigger results', async () => {
            // Test that multiple matching triggers get their results merged
            const action = new ReplyCaptureAction(
                123,
                createMockParentAction(),
                mock(() => Promise.resolve()),
                [/(\w+)/, /(\d+)/],
                new AbortController()
            );

            const ctx = createMockReplyContext(123, 'test 123');
            await action.exec(ctx);

            // Both regexes should match and results should be merged
            expect(ctx.matchResults.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('trigger matching', () => {
        test('should match string trigger exactly (case-insensitive)', async () => {
            const handler = mock(() => Promise.resolve());
            const action = new ReplyCaptureAction(
                123,
                createMockParentAction(),
                handler,
                ['Hello World'],
                new AbortController()
            );

            const ctx = createMockReplyContext(123, 'hello world');
            await action.exec(ctx);

            expect(handler).toHaveBeenCalled();
        });

        test('should not match partial string trigger', async () => {
            const handler = mock(() => Promise.resolve());
            const action = new ReplyCaptureAction(
                123,
                createMockParentAction(),
                handler,
                ['yes'],
                new AbortController()
            );

            const ctx = createMockReplyContext(123, 'yes please');
            await action.exec(ctx);

            expect(handler).not.toHaveBeenCalled();
        });

        test('should reset regex lastIndex before matching', async () => {
            const pattern = /test/g;
            pattern.lastIndex = 100;

            const handler = mock(() => Promise.resolve());
            const action = new ReplyCaptureAction(
                123,
                createMockParentAction(),
                handler,
                [pattern],
                new AbortController()
            );

            const ctx = createMockReplyContext(123, 'test message');
            await action.exec(ctx);

            expect(handler).toHaveBeenCalled();
        });

        test('should limit regex matches to 100', async () => {
            const longText = 'a '.repeat(150);
            const action = new ReplyCaptureAction(
                123,
                createMockParentAction(),
                mock(() => Promise.resolve()),
                [/a/g],
                new AbortController()
            );

            const ctx = createMockReplyContext(123, longText);
            await action.exec(ctx);

            expect(ctx.matchResults.length).toBeLessThanOrEqual(101);
        });
    });
});
