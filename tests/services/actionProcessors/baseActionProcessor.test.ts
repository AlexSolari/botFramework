import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { BotEventType, TypedEventEmitter } from '../../../src/types/events';
import { IScheduler } from '../../../src/types/scheduler';
import { IStorageClient } from '../../../src/types/storage';
import { ActionKey, IAction } from '../../../src/types/action';
import { BaseActionProcessor } from '../../../src/services/actionProcessors/baseProcessor';
import { BaseContextInternal } from '../../../src/entities/context/baseContext';
import { ChatInfo } from '../../../src/dtos/chatInfo';
import { TraceId } from '../../../src/types/trace';
import {
    createMockStorage,
    createMockScheduler,
    createMockAction,
    createMockTelegramApi,
    createMockChatInfo,
    createMockTraceId,
    createMockTextResponse,
    type MockTelegramApi
} from './processorTestHelpers';

// =============================================================================
// Concrete implementation for testing abstract BaseActionProcessor
// =============================================================================

// Helper for async delay
const delay = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

// A minimal mock context that satisfies BaseContextInternal interface
class MockBaseContext extends BaseContextInternal<IAction> {
    constructor(
        storage: IStorageClient,
        scheduler: IScheduler,
        eventEmitter: TypedEventEmitter
    ) {
        super(storage, scheduler, eventEmitter);
        this.isInitialized = true;
        this.chatInfo = new ChatInfo(12345, 'Test Chat', []);
        this.traceId = 'test-trace' as TraceId;
        this.botName = 'TestBot';
    }
}

class TestableBaseActionProcessor extends BaseActionProcessor {
    // Expose protected members for testing
    getStorage() {
        return this.storage;
    }
    getScheduler() {
        return this.scheduler;
    }
    getEventEmitter() {
        return this.eventEmitter;
    }
    getBotName() {
        return this.botName;
    }
    getApi() {
        return this.api;
    }

    // Public wrapper for executeAction
    testExecuteAction(
        action: IAction,
        ctx: MockBaseContext,
        errorHandler?: (error: Error, ctx: MockBaseContext) => void
    ) {
        return this.executeAction(action, ctx, errorHandler);
    }
}

// =============================================================================
// BaseActionProcessor Tests
// =============================================================================

describe('BaseActionProcessor', () => {
    let processor: TestableBaseActionProcessor;
    let eventEmitter: TypedEventEmitter;
    let storage: IStorageClient;
    let scheduler: IScheduler;

    beforeEach(() => {
        eventEmitter = new TypedEventEmitter();
        storage = createMockStorage();
        scheduler = createMockScheduler();
        processor = new TestableBaseActionProcessor(
            'test-bot',
            storage,
            scheduler,
            eventEmitter
        );
    });

    describe('constructor', () => {
        test('should store storage reference', () => {
            expect(processor.getStorage()).toBe(storage);
        });

        test('should store scheduler reference', () => {
            expect(processor.getScheduler()).toBe(scheduler);
        });

        test('should store eventEmitter reference', () => {
            expect(processor.getEventEmitter()).toBe(eventEmitter);
        });

        test('should store botName', () => {
            expect(processor.getBotName()).toBe('test-bot');
        });
    });

    describe('initializeDependencies', () => {
        test('should store api reference', () => {
            const mockApi = createMockTelegramApi();
            processor.initializeDependencies(mockApi);
            expect(processor.getApi()).toBe(mockApi);
        });
    });

    describe('executeAction', () => {
        let mockApi: MockTelegramApi;
        let mockContext: MockBaseContext;

        beforeEach(() => {
            mockApi = createMockTelegramApi();
            processor.initializeDependencies(mockApi);
            mockContext = new MockBaseContext(storage, scheduler, eventEmitter);
            mockContext.action = createMockAction('ctx-action');
        });

        test('should call action.exec with context', async () => {
            const action = createMockAction('test-action');

            await processor.testExecuteAction(action, mockContext);

            expect(action.getExecCallCount()).toBe(1);
            expect(action.getExecLastArgs()).toEqual([mockContext]);
        });

        test('should enqueue responses from action', async () => {
            const chatInfo = createMockChatInfo();
            const traceId = createMockTraceId();
            const action = createMockAction('test-action');
            const response = createMockTextResponse(chatInfo, traceId, action);
            action.exec = mock(() => Promise.resolve([response]));

            await processor.testExecuteAction(action, mockContext);

            expect(mockApi.getEnqueueCallCount()).toBe(1);
            expect(mockApi.getEnqueueLastArgs()).toEqual([response]);
        });

        test('should set isInitialized to false after execution', async () => {
            const action = createMockAction('test-action');

            await processor.testExecuteAction(action, mockContext);

            expect(mockContext.isInitialized).toBe(false);
        });

        test('should call custom error handler on error', async () => {
            const action = createMockAction('test-action');
            const testError = new Error('Test error');
            action.exec = mock(() => Promise.reject(testError));

            const errorHandler = mock(() => {
                /* no-op */
            });

            await processor.testExecuteAction(
                action,
                mockContext,
                errorHandler
            );

            expect(errorHandler).toHaveBeenCalledWith(testError, mockContext);
        });

        test('should emit error event when no custom handler provided', async () => {
            // BUG: defaultErrorHandler loses 'this' context when called via
            // (errorHandler ?? this.defaultErrorHandler)(error, ctx)
            // This test expects the correct behavior - fix by binding the method
            const action = createMockAction('test-action');
            const testError = new Error('Test error message');
            testError.name = 'TestError';
            action.exec = mock(() => Promise.reject(testError));

            const errorEvents: unknown[] = [];
            eventEmitter.on(BotEventType.error, (_ts, data) => {
                errorEvents.push(data);
            });

            // Suppress console.error for cleaner test output
            const originalConsoleError = console.error;
            console.error = () => {};

            await processor.testExecuteAction(action, mockContext);

            console.error = originalConsoleError;

            expect(errorEvents.length).toBe(1);
            expect(errorEvents[0]).toEqual({
                message: 'Test error message',
                name: 'TestError'
            });
        });

        test('should log error to console with default handler', async () => {
            // BUG: defaultErrorHandler loses 'this' context - needs binding fix
            const action = createMockAction('test-action');
            const testError = new Error('Console log test');
            action.exec = mock(() => Promise.reject(testError));

            const consoleErrors: unknown[] = [];
            const originalConsoleError = console.error;
            console.error = (...args: unknown[]) => {
                consoleErrors.push(args[0]);
            };

            await processor.testExecuteAction(action, mockContext);

            console.error = originalConsoleError;

            expect(consoleErrors.length).toBe(1);
            expect(consoleErrors[0]).toBe(testError);
        });
    });

    describe('error handling edge cases', () => {
        test('should handle async errors correctly with default handler', async () => {
            // BUG: defaultErrorHandler loses 'this' context - needs binding fix
            const localEventEmitter = new TypedEventEmitter();
            const localStorage = createMockStorage();
            const localScheduler = createMockScheduler();
            const localProcessor = new TestableBaseActionProcessor(
                'error-bot',
                localStorage,
                localScheduler,
                localEventEmitter
            );
            const mockApi = createMockTelegramApi();
            localProcessor.initializeDependencies(mockApi);

            const asyncError = new Error('Async failure');
            asyncError.name = 'AsyncError';

            const action: IAction = {
                key: 'error-action' as ActionKey,
                exec: mock(async () => {
                    await delay(10);
                    throw asyncError;
                })
            };

            const errorEvents: unknown[] = [];
            localEventEmitter.on(BotEventType.error, (_ts, data) => {
                errorEvents.push(data);
            });

            const originalConsoleError = console.error;
            console.error = () => {
                /* no-op */
            };

            const ctx = new MockBaseContext(
                localStorage,
                localScheduler,
                localEventEmitter
            );
            ctx.action = action;
            await localProcessor.testExecuteAction(action, ctx);

            console.error = originalConsoleError;

            expect(errorEvents.length).toBe(1);
            expect(errorEvents[0]).toEqual({
                message: 'Async failure',
                name: 'AsyncError'
            });
        });

        test('should handle empty response array', async () => {
            const localStorage = createMockStorage();
            const localScheduler = createMockScheduler();
            const localEventEmitter = new TypedEventEmitter();
            const localProcessor = new TestableBaseActionProcessor(
                'empty-bot',
                localStorage,
                localScheduler,
                localEventEmitter
            );
            const localMockApi = createMockTelegramApi();
            localProcessor.initializeDependencies(localMockApi);

            const action = createMockAction('empty-action', []);
            const ctx = new MockBaseContext(
                localStorage,
                localScheduler,
                localEventEmitter
            );
            ctx.action = action;

            await localProcessor.testExecuteAction(action, ctx);

            expect(localMockApi.getEnqueueCallCount()).toBe(1);
            expect(localMockApi.getEnqueueLastArgs()).toEqual([]);
        });

        test('should handle multiple responses', async () => {
            const localStorage = createMockStorage();
            const localScheduler = createMockScheduler();
            const localEventEmitter = new TypedEventEmitter();
            const localProcessor = new TestableBaseActionProcessor(
                'multi-response-bot',
                localStorage,
                localScheduler,
                localEventEmitter
            );
            const localMockApi = createMockTelegramApi();
            localProcessor.initializeDependencies(localMockApi);

            const chatInfo = createMockChatInfo();
            const traceId = createMockTraceId();
            const action = createMockAction('multi-action');

            const responses = [
                createMockTextResponse(chatInfo, traceId, action),
                createMockTextResponse(chatInfo, traceId, action),
                createMockTextResponse(chatInfo, traceId, action)
            ];
            action.exec = mock(() => Promise.resolve(responses));

            const ctx = new MockBaseContext(
                localStorage,
                localScheduler,
                localEventEmitter
            );
            ctx.action = action;
            await localProcessor.testExecuteAction(action, ctx);

            expect(localMockApi.getEnqueueCallCount()).toBe(1);
            expect(localMockApi.getEnqueueLastArgs()).toEqual(responses);
        });
    });
});
