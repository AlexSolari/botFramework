import { describe, test, expect, beforeEach } from 'bun:test';
import { BotEventType, TypedEventEmitter } from '../../../src/types/events';
import { IScheduler } from '../../../src/types/scheduler';
import { IStorageClient } from '../../../src/types/storage';
import { TraceId } from '../../../src/types/trace';
import { CommandActionProcessor } from '../../../src/services/actionProcessors/commandActionProcessor';
import {
    createMockStorage,
    createMockScheduler,
    createMockAction,
    createMockTelegramApi,
    createMockChatInfo
} from './processorTestHelpers';

function createMockTraceId(): TraceId {
    return 'test:trace-id' as TraceId;
}

// =============================================================================
// CommandActionProcessor Tests
// =============================================================================

describe('CommandActionProcessor', () => {
    let processor: CommandActionProcessor;
    let eventEmitter: TypedEventEmitter;
    let storage: IStorageClient;
    let scheduler: IScheduler;

    beforeEach(() => {
        eventEmitter = new TypedEventEmitter();
        storage = createMockStorage();
        scheduler = createMockScheduler();
        processor = new CommandActionProcessor(
            'command-bot',
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

    describe('captureRegistrationCallback', () => {
        test('should emit captureStarted event', () => {
            const mockApi = createMockTelegramApi();
            processor.initializeDependencies(mockApi);

            const captureEvents: unknown[] = [];
            eventEmitter.on(
                BotEventType.commandActionCaptureStarted,
                (_ts, data) => {
                    captureEvents.push(data);
                }
            );

            const chatInfo = createMockChatInfo();
            const traceId = createMockTraceId();
            const abortController = new AbortController();
            const mockCapture = {
                action: createMockAction('parent-action'),
                handler: async () => {},
                trigger: [],
                abortController
            };

            processor.captureRegistrationCallback(
                mockCapture,
                123,
                chatInfo,
                traceId
            );

            expect(captureEvents.length).toBe(1);
            expect(captureEvents[0]).toEqual({
                parentMessageId: 123,
                chatInfo,
                traceId
            });
        });

        test('should emit captureAborted event when abort controller aborts', async () => {
            const mockApi = createMockTelegramApi();
            processor.initializeDependencies(mockApi);

            const abortEvents: unknown[] = [];
            eventEmitter.on(
                BotEventType.commandActionCaptureAborted,
                (_ts, data) => {
                    abortEvents.push(data);
                }
            );

            const chatInfo = createMockChatInfo();
            const traceId = createMockTraceId();
            const abortController = new AbortController();
            const mockCapture = {
                action: createMockAction('parent-action'),
                handler: async () => {},
                trigger: [],
                abortController
            };

            processor.captureRegistrationCallback(
                mockCapture,
                456,
                chatInfo,
                traceId
            );

            // Abort the controller
            abortController.abort();

            // Wait for event listener to fire
            await new Promise((resolve) => setImmediate(resolve));

            expect(abortEvents.length).toBe(1);
            expect(abortEvents[0]).toEqual({
                parentMessageId: 456,
                chatInfo,
                traceId
            });
        });

        test('should register multiple captures', () => {
            const mockApi = createMockTelegramApi();
            processor.initializeDependencies(mockApi);

            const captureEvents: unknown[] = [];
            eventEmitter.on(
                BotEventType.commandActionCaptureStarted,
                (_ts, data) => {
                    captureEvents.push(data);
                }
            );

            const chatInfo = createMockChatInfo();
            const traceId = createMockTraceId();

            for (let i = 0; i < 3; i++) {
                const mockCapture = {
                    action: createMockAction(`parent-action-${i}`),
                    handler: async () => {},
                    trigger: [],
                    abortController: new AbortController()
                };
                processor.captureRegistrationCallback(
                    mockCapture,
                    100 + i,
                    chatInfo,
                    traceId
                );
            }

            expect(captureEvents.length).toBe(3);
        });
    });

    describe('capture lifecycle', () => {
        test('should handle capture registration and abort lifecycle', async () => {
            const localEventEmitter = new TypedEventEmitter();
            const localProcessor = new CommandActionProcessor(
                'capture-bot',
                createMockStorage(),
                createMockScheduler(),
                localEventEmitter
            );

            const mockApi = createMockTelegramApi();
            localProcessor.initializeDependencies(mockApi);

            const startEvents: unknown[] = [];
            const abortEvents: unknown[] = [];

            localEventEmitter.on(
                BotEventType.commandActionCaptureStarted,
                (_ts, data) => {
                    startEvents.push(data);
                }
            );
            localEventEmitter.on(
                BotEventType.commandActionCaptureAborted,
                (_ts, data) => {
                    abortEvents.push(data);
                }
            );

            const chatInfo = createMockChatInfo();
            const traceId = createMockTraceId();
            const abortController = new AbortController();
            const mockCapture = {
                action: createMockAction('lifecycle-action'),
                handler: async () => {},
                trigger: [],
                abortController
            };

            // Register capture
            localProcessor.captureRegistrationCallback(
                mockCapture,
                789,
                chatInfo,
                traceId
            );
            expect(startEvents.length).toBe(1);
            expect(abortEvents.length).toBe(0);

            // Abort capture
            abortController.abort();
            await new Promise((resolve) => setImmediate(resolve));

            expect(abortEvents.length).toBe(1);
            expect(abortEvents[0]).toEqual({
                parentMessageId: 789,
                chatInfo,
                traceId
            });
        });

        test('should handle abort on already removed capture', async () => {
            const localEventEmitter = new TypedEventEmitter();
            const localProcessor = new CommandActionProcessor(
                'double-abort-bot',
                createMockStorage(),
                createMockScheduler(),
                localEventEmitter
            );

            const mockApi = createMockTelegramApi();
            localProcessor.initializeDependencies(mockApi);

            const abortEvents: unknown[] = [];
            localEventEmitter.on(
                BotEventType.commandActionCaptureAborted,
                (_ts, data) => {
                    abortEvents.push(data);
                }
            );

            const chatInfo = createMockChatInfo();
            const traceId = createMockTraceId();
            const abortController = new AbortController();
            const mockCapture = {
                action: createMockAction('double-abort-action'),
                handler: async () => {},
                trigger: [],
                abortController
            };

            localProcessor.captureRegistrationCallback(
                mockCapture,
                111,
                chatInfo,
                traceId
            );

            // Abort twice - should only emit once
            abortController.abort();
            await new Promise((resolve) => setImmediate(resolve));

            // AbortController can only abort once
            expect(abortEvents.length).toBe(1);
        });
    });
});
