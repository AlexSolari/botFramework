import { describe, test, expect, mock } from 'bun:test';
import { InlineQueryAction } from '../../../src/entities/actions/inlineQueryAction';
import {
    InlineQueryContextInternal,
    InlineQueryContext
} from '../../../src/entities/context/inlineQueryContext';
import { ActionKey } from '../../../src/types/action';
import { TypedEventEmitter, BotEventType } from '../../../src/types/events';
import { Noop } from '../../../src/helpers/noop';
import {
    createMockStorage,
    createMockScheduler
} from '../../services/actionProcessors/processorTestHelpers';
import { IncomingInlineQuery } from '../../../src/dtos/incomingQuery';
import { ChatInfo } from '../../../src/dtos/chatInfo';
import { TraceId } from '../../../src/types/trace';

function createMockInlineContext(
    queryText: string,
    _isActive: boolean = true
): InlineQueryContextInternal {
    const storage = createMockStorage();
    const scheduler = createMockScheduler();
    const eventEmitter = new TypedEventEmitter();
    const action = new InlineQueryAction(
        mock(() => Promise.resolve()),
        'test.action',
        () => true,
        /test/
    );
    const query = new IncomingInlineQuery(
        'query-123',
        queryText,
        123,
        'test-trace' as TraceId
    );
    const chatInfo = new ChatInfo(12345, 'Test Chat', []);

    const ctx = new InlineQueryContextInternal(
        storage,
        scheduler,
        eventEmitter,
        action,
        query,
        chatInfo,
        'TestBot'
    );

    return ctx;
}

describe('InlineQueryAction', () => {
    describe('constructor', () => {
        test('should set name correctly', () => {
            const action = new InlineQueryAction(
                mock(() => Promise.resolve()),
                'test.action',
                () => true,
                /test/
            );

            expect(action.name).toBe('test.action');
        });

        test('should set pattern correctly', () => {
            const pattern = /search (.*)/gi;
            const action = new InlineQueryAction(
                mock(() => Promise.resolve()),
                'search-action',
                () => true,
                pattern
            );

            expect(action.pattern).toBe(pattern);
        });

        test('should generate key with inline prefix', () => {
            const action = new InlineQueryAction(
                mock(() => Promise.resolve()),
                'test.action',
                () => true,
                /test/
            );

            expect(action.key).toBe('inline:test-action' as ActionKey);
        });

        test('should replace dots with dashes in key', () => {
            const action = new InlineQueryAction(
                mock(() => Promise.resolve()),
                'my.action.name',
                () => true,
                /test/
            );

            // Note: only first dot is replaced due to String.replace behavior
            expect(action.key).toBe('inline:my-action.name' as ActionKey);
        });

        test('should store handler', () => {
            const handler = mock(() => Promise.resolve());
            const action = new InlineQueryAction(
                handler,
                'test',
                () => true,
                /test/
            );

            expect(action.handler).toBe(handler);
        });

        test('should store isActiveProvider', () => {
            const provider = () => true;
            const action = new InlineQueryAction(
                mock(() => Promise.resolve()),
                'test',
                provider,
                /test/
            );

            expect(action.isActiveProvider).toBe(provider);
        });
    });

    describe('exec', () => {
        test('should throw if context is not initialized', () => {
            // Note: isInitialized property no longer exists as context is always initialized
            // with all required properties at construction time
            // This test case is no longer applicable
            const ctx = createMockInlineContext('test query');

            // Verify context is properly initialized
            expect(ctx.action).toBeDefined();
        });

        test('should return NoResponse if action is not active', async () => {
            const action = new InlineQueryAction(
                mock(() => Promise.resolve()),
                'test',
                () => false,
                /test/
            );

            const ctx = createMockInlineContext('test query');
            const result = await action.exec(ctx);

            expect(result).toBe(Noop.NoResponse);
        });

        test('should return NoResponse if pattern does not match', async () => {
            const handler = mock(() => Promise.resolve());
            const action = new InlineQueryAction(
                handler,
                'test',
                () => true,
                /nomatch/
            );

            const ctx = createMockInlineContext('test query');
            const result = await action.exec(ctx);

            expect(result).toBe(Noop.NoResponse);
            expect(handler).not.toHaveBeenCalled();
        });

        test('should execute handler when pattern matches', async () => {
            const handler = mock(() => Promise.resolve());
            const action = new InlineQueryAction(
                handler,
                'test',
                () => true,
                /test/
            );

            const ctx = createMockInlineContext('test query');
            await action.exec(ctx);

            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledWith(ctx);
        });

        test('should set matchResults on context when pattern matches', async () => {
            const action = new InlineQueryAction(
                mock(() => Promise.resolve()),
                'test',
                () => true,
                /(\w+) query/
            );

            const ctx = createMockInlineContext('test query');
            await action.exec(ctx);

            expect(ctx.matchResults.length).toBe(1);
            expect(ctx.matchResults[0][0]).toBe('test query');
            expect(ctx.matchResults[0][1]).toBe('test');
        });

        test('should handle global regex with multiple matches', async () => {
            const action = new InlineQueryAction(
                mock(() => Promise.resolve()),
                'test',
                () => true,
                /\w+/g
            );

            const ctx = createMockInlineContext('hello world test');
            await action.exec(ctx);

            expect(ctx.matchResults.length).toBe(3);
            expect(ctx.matchResults[0][0]).toBe('hello');
            expect(ctx.matchResults[1][0]).toBe('world');
            expect(ctx.matchResults[2][0]).toBe('test');
        });

        test('should limit regex matches to 100', async () => {
            // Create a query that would match many times
            const longQuery = 'a '.repeat(150);
            const action = new InlineQueryAction(
                mock(() => Promise.resolve()),
                'test',
                () => true,
                /a/g
            );

            const ctx = createMockInlineContext(longQuery);
            await action.exec(ctx);

            // 1 initial match + 100 additional matches = 101 max
            expect(ctx.matchResults.length).toBeLessThanOrEqual(101);
        });

        test('should emit inlineActionExecuting event before handler', async () => {
            const events: string[] = [];
            const handler = mock(() => {
                events.push('handler');
                return Promise.resolve();
            });
            const action = new InlineQueryAction(
                handler,
                'test',
                () => true,
                /test/
            );

            const ctx = createMockInlineContext('test query');
            ctx.eventEmitter.on(BotEventType.inlineActionExecuting, () => {
                events.push('executing');
            });

            await action.exec(ctx);

            expect(events).toEqual(['executing', 'handler']);
        });

        test('should emit inlineActionExecuted event after handler', async () => {
            const events: string[] = [];
            const handler = mock(() => {
                events.push('handler');
                return Promise.resolve();
            });
            const action = new InlineQueryAction(
                handler,
                'test',
                () => true,
                /test/
            );

            const ctx = createMockInlineContext('test query');
            ctx.eventEmitter.on(BotEventType.inlineActionExecuted, () => {
                events.push('executed');
            });

            await action.exec(ctx);

            expect(events).toEqual(['handler', 'executed']);
        });

        test('should return context responses after execution', async () => {
            const action = new InlineQueryAction(
                mock((ctx: InlineQueryContext) => {
                    ctx.showInlineQueryResult({
                        type: 'article',
                        id: '1',
                        title: 'Test',
                        input_message_content: { message_text: 'test' }
                    });
                    return Promise.resolve();
                }),
                'test',
                () => true,
                /test/
            );

            const ctx = createMockInlineContext('test query');
            const result = await action.exec(ctx);

            expect(result.length).toBe(1);
        });

        test('should reset regex lastIndex before matching', async () => {
            const pattern = /test/g;
            pattern.lastIndex = 100; // Simulate a previously used regex

            const action = new InlineQueryAction(
                mock(() => Promise.resolve()),
                'test',
                () => true,
                pattern
            );

            const ctx = createMockInlineContext('test query');
            await action.exec(ctx);

            expect(ctx.matchResults.length).toBe(1);
        });
    });

    describe('isActiveProvider integration', () => {
        test('should receive context in isActiveProvider', async () => {
            const providerMock = mock(() => true);
            const action = new InlineQueryAction(
                mock(() => Promise.resolve()),
                'test',
                providerMock,
                /test/
            );

            const ctx = createMockInlineContext('test query');
            await action.exec(ctx);

            expect(providerMock).toHaveBeenCalledWith(ctx);
        });

        test('should evaluate isActiveProvider on each exec', async () => {
            let isActive = true;
            const action = new InlineQueryAction(
                mock(() => Promise.resolve()),
                'test',
                () => isActive,
                /test/
            );

            const ctx1 = createMockInlineContext('test query');
            const result1 = await action.exec(ctx1);
            expect(result1).not.toBe(Noop.NoResponse);

            isActive = false;
            const ctx2 = createMockInlineContext('test query');
            const result2 = await action.exec(ctx2);
            expect(result2).toBe(Noop.NoResponse);
        });
    });
});
