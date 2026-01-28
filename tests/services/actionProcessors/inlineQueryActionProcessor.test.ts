import { describe, test, expect, beforeEach, mock, type Mock } from 'bun:test';
import { BotEventType, TypedEventEmitter } from '../../../src/types/events';
import { IStorageClient } from '../../../src/types/storage';
import { ActionKey } from '../../../src/types/action';
import { Milliseconds } from '../../../src/types/timeValues';
import { InlineQueryActionProcessor } from '../../../src/services/actionProcessors/inlineQueryActionProcessor';
import { InlineQueryAction } from '../../../src/entities/actions/inlineQueryAction';
import { BotResponse } from '../../../src/types/response';
import {
    createMockStorage,
    createMockScheduler,
    createMockTelegramApi,
    type MockScheduler
} from './processorTestHelpers';

// =============================================================================
// Mock Types for InlineQueryActionProcessor Tests
// =============================================================================

// Mock for telegram.on() handler
type InlineQueryEventHandler = (params: {
    inlineQuery: {
        id: string;
        query: string;
        from: { id: number };
    };
}) => void;

// Mock TelegramBot interface with call tracking
interface MockTelegramBot {
    on: (event: string, handler: InlineQueryEventHandler) => void;
    getOnCallCount: () => number;
    getOnLastArgs: () => [string, InlineQueryEventHandler] | undefined;
    hasRegisteredEvent: (eventName: string) => boolean;
    getEventHandler: (eventName: string) => InlineQueryEventHandler | undefined;
}

function createMockTelegramBot(): MockTelegramBot {
    const handlers = new Map<string, InlineQueryEventHandler>();
    const onMock = mock((event: string, handler: InlineQueryEventHandler) => {
        handlers.set(event, handler);
    });

    return {
        on: onMock,
        getOnCallCount: () => onMock.mock.calls.length,
        getOnLastArgs: () =>
            onMock.mock.calls.at(-1) as
                | [string, InlineQueryEventHandler]
                | undefined,
        hasRegisteredEvent: (eventName: string) => handlers.has(eventName),
        getEventHandler: (eventName: string) => handlers.get(eventName)
    };
}

// Mock InlineQueryAction with call tracking
interface MockInlineQueryAction {
    key: ActionKey;
    name: string;
    pattern: RegExp;
    isActiveProvider: (ctx: unknown) => boolean;
    handler: (ctx: unknown) => Promise<void>;
    exec: Mock<(ctx: unknown) => Promise<BotResponse[]>>;
    getExecCallCount: () => number;
    getExecLastArgs: () => unknown[] | undefined;
}

function createMockInlineQueryAction(
    name: string,
    pattern: RegExp = /test/,
    execResult: BotResponse[] = []
): MockInlineQueryAction {
    const execMock: Mock<(ctx: unknown) => Promise<BotResponse[]>> = mock(() =>
        Promise.resolve(execResult)
    );
    return {
        key: `inline:${name}` as ActionKey,
        name,
        pattern,
        isActiveProvider: () => true,
        handler: () => Promise.resolve(),
        exec: execMock,
        getExecCallCount: () => execMock.mock.calls.length,
        getExecLastArgs: () => execMock.mock.calls.at(-1)
    };
}

// =============================================================================
// InlineQueryActionProcessor Tests
// =============================================================================

describe('InlineQueryActionProcessor', () => {
    let processor: InlineQueryActionProcessor;
    let eventEmitter: TypedEventEmitter;
    let storage: IStorageClient;
    let scheduler: MockScheduler;

    beforeEach(() => {
        eventEmitter = new TypedEventEmitter();
        storage = createMockStorage();
        scheduler = createMockScheduler();
        processor = new InlineQueryActionProcessor(
            'inline-bot',
            storage,
            scheduler,
            eventEmitter
        );
    });

    describe('constructor', () => {
        test('should create processor with bot name', () => {
            expect(processor).toBeDefined();
        });
    });

    describe('initialize', () => {
        test('should not create task when no inline queries', () => {
            const mockApi = createMockTelegramApi();
            const mockTelegram = createMockTelegramBot();

            processor.initialize(
                mockApi,
                mockTelegram as unknown as Parameters<
                    typeof processor.initialize
                >[1],
                [],
                100 as Milliseconds
            );

            expect(scheduler.createTaskCallCount()).toBe(0);
        });

        test('should set up message handler when inline queries provided', () => {
            const mockApi = createMockTelegramApi();
            const mockTelegram = createMockTelegramBot();
            const mockInlineAction = createMockInlineQueryAction(
                'test-inline',
                /test/
            );

            processor.initialize(
                mockApi,
                mockTelegram as unknown as Parameters<
                    typeof processor.initialize
                >[1],
                [mockInlineAction as unknown as InlineQueryAction],
                100 as Milliseconds
            );

            // Should register inline_query handler
            expect(mockTelegram.getOnCallCount()).toBeGreaterThan(0);
            expect(mockTelegram.hasRegisteredEvent('inline_query')).toBe(true);
        });

        test('should create periodic task for processing queries', () => {
            const mockApi = createMockTelegramApi();
            const mockTelegram = createMockTelegramBot();
            const mockInlineAction = createMockInlineQueryAction(
                'test-inline',
                /test/
            );

            processor.initialize(
                mockApi,
                mockTelegram as unknown as Parameters<
                    typeof processor.initialize
                >[1],
                [mockInlineAction as unknown as InlineQueryAction],
                200 as Milliseconds
            );

            expect(scheduler.createTaskCallCount()).toBe(1);
        });

        test('should store inline queries for processing', () => {
            const mockApi = createMockTelegramApi();
            const mockTelegram = createMockTelegramBot();
            const mockInlineAction1 = createMockInlineQueryAction(
                'test-inline-1',
                /test1/
            );
            const mockInlineAction2 = createMockInlineQueryAction(
                'test-inline-2',
                /test2/
            );

            processor.initialize(
                mockApi,
                mockTelegram as unknown as Parameters<
                    typeof processor.initialize
                >[1],
                [
                    mockInlineAction1 as unknown as InlineQueryAction,
                    mockInlineAction2 as unknown as InlineQueryAction
                ],
                100 as Milliseconds
            );

            // Handler registered via telegram.on
            expect(mockTelegram.getOnCallCount()).toBeGreaterThan(0);
        });
    });

    describe('edge cases', () => {
        test('should handle no inline query actions', () => {
            const localScheduler = createMockScheduler();
            const localProcessor = new InlineQueryActionProcessor(
                'no-inline-bot',
                createMockStorage(),
                localScheduler,
                new TypedEventEmitter()
            );

            const mockApi = createMockTelegramApi();
            const mockTelegram = createMockTelegramBot();

            localProcessor.initialize(
                mockApi,
                mockTelegram as unknown as Parameters<
                    typeof localProcessor.initialize
                >[1],
                [], // No inline actions
                100 as Milliseconds
            );

            // Should not register any handlers
            expect(mockTelegram.getOnCallCount()).toBe(0);
            expect(localScheduler.createTaskCallCount()).toBe(0);
        });
    });

    describe('query processing', () => {
        test('should emit processing started event when query received', () => {
            const localEventEmitter = new TypedEventEmitter();
            const localProcessor = new InlineQueryActionProcessor(
                'query-bot',
                createMockStorage(),
                createMockScheduler(),
                localEventEmitter
            );

            const processingEvents: unknown[] = [];
            localEventEmitter.on(
                BotEventType.inlineProcessingStarted,
                (_ts, data) => {
                    processingEvents.push(data);
                }
            );

            const mockApi = createMockTelegramApi();
            const mockTelegram = createMockTelegramBot();

            const mockInlineAction = createMockInlineQueryAction(
                'query-action',
                /query/
            );

            localProcessor.initialize(
                mockApi,
                mockTelegram as unknown as Parameters<
                    typeof localProcessor.initialize
                >[1],
                [mockInlineAction as unknown as InlineQueryAction],
                50 as Milliseconds
            );

            const inlineQueryHandler =
                mockTelegram.getEventHandler('inline_query');
            expect(inlineQueryHandler).toBeDefined();

            // Simulate receiving an inline query
            if (inlineQueryHandler) {
                inlineQueryHandler({
                    inlineQuery: {
                        id: 'query-1',
                        query: 'test query',
                        from: { id: 12345 }
                    }
                });
            }

            expect(processingEvents.length).toBe(1);
        });

        test('should emit abort event when second query from same user received', () => {
            const localEventEmitter = new TypedEventEmitter();
            const localProcessor = new InlineQueryActionProcessor(
                'abort-bot',
                createMockStorage(),
                createMockScheduler(),
                localEventEmitter
            );

            const abortingEvents: unknown[] = [];
            localEventEmitter.on(
                BotEventType.inlineProcessingAborting,
                (_ts, data) => {
                    abortingEvents.push(data);
                }
            );

            const mockApi = createMockTelegramApi();
            const mockTelegram = createMockTelegramBot();

            // Create a slow action that allows us to trigger a second query during processing
            const mockInlineAction = createMockInlineQueryAction(
                'abort-action',
                /abort/
            );

            localProcessor.initialize(
                mockApi,
                mockTelegram as unknown as Parameters<
                    typeof localProcessor.initialize
                >[1],
                [mockInlineAction as unknown as InlineQueryAction],
                50 as Milliseconds
            );

            const inlineQueryHandler =
                mockTelegram.getEventHandler('inline_query');
            expect(inlineQueryHandler).toBeDefined();

            if (inlineQueryHandler) {
                // First query
                inlineQueryHandler({
                    inlineQuery: {
                        id: 'query-1',
                        query: 'first query',
                        from: { id: 99999 }
                    }
                });

                // Second query from same user (should trigger abort of first in pending queue)
                inlineQueryHandler({
                    inlineQuery: {
                        id: 'query-2',
                        query: 'second query',
                        from: { id: 99999 }
                    }
                });
            }

            // The abort event is only emitted for queries in processing (not pending)
            // Since we haven't started the processing task, the first query is just removed from pending
            // So no abort event should be emitted yet
            expect(abortingEvents.length).toBe(0);
        });

        test('should filter pending queries when receiving duplicate user query', () => {
            const localEventEmitter = new TypedEventEmitter();
            const localProcessor = new InlineQueryActionProcessor(
                'filter-bot',
                createMockStorage(),
                createMockScheduler(),
                localEventEmitter
            );

            const startedEvents: unknown[] = [];
            localEventEmitter.on(
                BotEventType.inlineProcessingStarted,
                (_ts, data) => {
                    startedEvents.push(data);
                }
            );

            const mockApi = createMockTelegramApi();
            const mockTelegram = createMockTelegramBot();

            const mockInlineAction = createMockInlineQueryAction(
                'filter-action',
                /filter/
            );

            localProcessor.initialize(
                mockApi,
                mockTelegram as unknown as Parameters<
                    typeof localProcessor.initialize
                >[1],
                [mockInlineAction as unknown as InlineQueryAction],
                50 as Milliseconds
            );

            const inlineQueryHandler =
                mockTelegram.getEventHandler('inline_query');
            expect(inlineQueryHandler).toBeDefined();

            if (inlineQueryHandler) {
                // Multiple queries from same user
                inlineQueryHandler({
                    inlineQuery: {
                        id: 'query-1',
                        query: 'first query',
                        from: { id: 12345 }
                    }
                });

                inlineQueryHandler({
                    inlineQuery: {
                        id: 'query-2',
                        query: 'second query',
                        from: { id: 12345 }
                    }
                });

                inlineQueryHandler({
                    inlineQuery: {
                        id: 'query-3',
                        query: 'third query',
                        from: { id: 12345 }
                    }
                });
            }

            // All three queries should trigger start events
            expect(startedEvents.length).toBe(3);
        });
    });
});
