import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { BotEventType, TypedEventEmitter } from '../../../src/types/events';
import { IScheduler } from '../../../src/types/scheduler';
import { IStorageClient } from '../../../src/types/storage';
import { TraceId } from '../../../src/types/trace';
import { CommandActionProcessor } from '../../../src/services/actionProcessors/commandActionProcessor';
import { ChatInfo } from '../../../src/dtos/chatInfo';
import {
    createMockStorage,
    createMockScheduler,
    createMockAction,
    createMockTelegramApi,
    createMockChatInfo
} from './processorTestHelpers';
import { ActionKey } from '../../../src/types/action';
import { MessageType } from '../../../src/types/messageTypes';
import type { CommandAction } from '../../../src/entities/actions/commandAction';
import type {
    BotInfo,
    TelegramMessage
} from '../../../src/types/externalAliases';
import type { CommandTrigger } from '../../../src/types/commandTrigger';
import { Message } from '@telegraf/types';

// ---- Mock helpers for initialize() tests ----

type MessageEventHandler = (params: {
    message: TelegramMessage;
}) => void | Promise<void>;

interface MockTelegramBot {
    on: (event: string, handler: MessageEventHandler) => void;
    getOnCallCount: () => number;
    hasRegisteredEvent: (eventName: string) => boolean;
    triggerMessage: (message: TelegramMessage) => Promise<void>;
}

function createMockTelegramBot(): MockTelegramBot {
    const handlers = new Map<string, MessageEventHandler>();
    const onMock = mock((event: string, handler: MessageEventHandler) => {
        handlers.set(event, handler);
    });

    return {
        on: onMock,
        getOnCallCount: () => onMock.mock.calls.length,
        hasRegisteredEvent: (eventName: string) => handlers.has(eventName),
        triggerMessage: async (message: TelegramMessage) => {
            const handler = handlers.get('message');
            if (handler) await handler({ message });
        }
    };
}

function createMockCommandAction(
    triggers: CommandTrigger[] = ['/test']
): CommandAction<never> {
    return {
        key: 'command:test' as ActionKey,
        exec: mock(() => Promise.resolve([])),
        triggers
    } as unknown as CommandAction<never>;
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

function createTelegramMessage(
    text = '/test',
    chatId = 12345
): TelegramMessage {
    return {
        message_id: 42,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'private' as const },
        from: { id: 1, is_bot: false, first_name: 'User' },
        text
    } as unknown as Message;
}

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

    describe('initialize', () => {
        test('should not register telegram handler when no commands provided', () => {
            const mockApi = createMockTelegramApi();
            const mockTelegram = createMockTelegramBot();

            processor.initialize(
                mockApi,
                mockTelegram as unknown as Parameters<
                    typeof processor.initialize
                >[1],
                [],
                createMockBotInfo()
            );

            expect(mockTelegram.getOnCallCount()).toBe(0);
        });

        test('should register telegram message handler when commands provided', () => {
            const mockApi = createMockTelegramApi();
            const mockTelegram = createMockTelegramBot();
            const command = createMockCommandAction(['/hello']);

            processor.initialize(
                mockApi,
                mockTelegram as unknown as Parameters<
                    typeof processor.initialize
                >[1],
                [command],
                createMockBotInfo()
            );

            expect(mockTelegram.hasRegisteredEvent('message')).toBe(true);
        });

        test('should emit messageRecieved event when a message is received', async () => {
            const mockApi = createMockTelegramApi();
            const mockTelegram = createMockTelegramBot();
            const command = createMockCommandAction(['/test']);

            const receivedEvents: unknown[] = [];
            eventEmitter.on(BotEventType.messageRecieved, (_ts, data) => {
                receivedEvents.push(data);
            });

            processor.initialize(
                mockApi,
                mockTelegram as unknown as Parameters<
                    typeof processor.initialize
                >[1],
                [command],
                createMockBotInfo()
            );

            await mockTelegram.triggerMessage(createTelegramMessage('/test'));
            await new Promise((resolve) => setTimeout(resolve, 20));

            expect(receivedEvents.length).toBe(1);
        });

        test('should emit messageProcessingStarted and messageProcessingFinished', async () => {
            const mockApi = createMockTelegramApi();
            const mockTelegram = createMockTelegramBot();
            const command = createMockCommandAction(['/test']);

            const startedEvents: unknown[] = [];
            const finishedEvents: unknown[] = [];
            eventEmitter.on(
                BotEventType.messageProcessingStarted,
                (_ts, data) => {
                    startedEvents.push(data);
                }
            );
            eventEmitter.on(
                BotEventType.messageProcessingFinished,
                (_ts, data) => {
                    finishedEvents.push(data);
                }
            );

            processor.initialize(
                mockApi,
                mockTelegram as unknown as Parameters<
                    typeof processor.initialize
                >[1],
                [command],
                createMockBotInfo()
            );

            await mockTelegram.triggerMessage(createTelegramMessage('/test'));
            await new Promise((resolve) => setTimeout(resolve, 20));

            expect(startedEvents.length).toBe(1);
            expect(finishedEvents.length).toBe(1);
        });

        test('should not process message when filter returns false', async () => {
            const mockApi = createMockTelegramApi();
            const mockTelegram = createMockTelegramBot();
            const command = createMockCommandAction(['/test']);

            processor.initialize(
                mockApi,
                mockTelegram as unknown as Parameters<
                    typeof processor.initialize
                >[1],
                [command],
                createMockBotInfo(),
                () => false
            );

            await mockTelegram.triggerMessage(createTelegramMessage('/test'));
            await new Promise((resolve) => setTimeout(resolve, 20));

            // Filter returned false: no responses should have been enqueued
            expect(mockApi.getEnqueueCallCount()).toBe(0);
        });

        test('should process message when filter returns true', async () => {
            const mockApi = createMockTelegramApi();
            const mockTelegram = createMockTelegramBot();
            const command = createMockCommandAction(['/test']);

            const receivedEvents: unknown[] = [];
            eventEmitter.on(BotEventType.messageRecieved, (_ts, data) => {
                receivedEvents.push(data);
            });

            processor.initialize(
                mockApi,
                mockTelegram as unknown as Parameters<
                    typeof processor.initialize
                >[1],
                [command],
                createMockBotInfo(),
                () => true
            );

            await mockTelegram.triggerMessage(createTelegramMessage('/test'));
            await new Promise((resolve) => setTimeout(resolve, 20));

            expect(receivedEvents.length).toBe(1);
        });

        test('should categorize Any trigger commands for all message types', () => {
            const mockApi = createMockTelegramApi();
            const mockTelegram = createMockTelegramBot();
            const command = createMockCommandAction([MessageType.Any]);

            const startedEvents: unknown[] = [];
            eventEmitter.on(
                BotEventType.messageProcessingStarted,
                (_ts, data) => {
                    startedEvents.push(data);
                }
            );

            processor.initialize(
                mockApi,
                mockTelegram as unknown as Parameters<
                    typeof processor.initialize
                >[1],
                [command],
                createMockBotInfo()
            );

            expect(mockTelegram.hasRegisteredEvent('message')).toBe(true);
        });

        test('should call processReply for captures registered before message arrives', async () => {
            const mockApi = createMockTelegramApi();
            const mockTelegram = createMockTelegramBot();
            const command = createMockCommandAction(['/start']);
            const botInfo = createMockBotInfo();

            processor.initialize(
                mockApi,
                mockTelegram as unknown as Parameters<
                    typeof processor.initialize
                >[1],
                [command],
                botInfo
            );

            // Register a capture for chatId 12345 with parentMessageId = 42
            const chatInfo = new ChatInfo(12345, 'Test Chat', []);
            const captureHandlerMock = mock(() => Promise.resolve());
            processor.captureRegistrationCallback(
                {
                    action: createMockAction('parent-action'),
                    handler: captureHandlerMock,
                    trigger: ['reply text'],
                    abortController: new AbortController()
                },
                42,
                chatInfo,
                'trace:capture' as TraceId
            );

            // Trigger a message that is a reply to message 42 with matching text
            const replyMessage = {
                message_id: 100,
                date: Math.floor(Date.now() / 1000),
                chat: { id: 12345, type: 'private' as const },
                from: { id: 1, is_bot: false, first_name: 'User' },
                text: 'reply text',
                reply_to_message: { message_id: 42 } // marks it as a reply to message 42
            } as unknown as TelegramMessage;

            await mockTelegram.triggerMessage(replyMessage);
            await new Promise((resolve) => setTimeout(resolve, 50));

            // The capture handler should have been invoked via processReply
            expect(captureHandlerMock.mock.calls.length).toBe(1);
        });

        test('should process captures registered before message arrives', async () => {
            const mockApi = createMockTelegramApi();
            const mockTelegram = createMockTelegramBot();
            const command = createMockCommandAction(['/start']);

            const captureHandlerFn = mock(() => Promise.resolve());
            const abortController = new AbortController();
            const captureAction = createMockAction('captured-action');

            const captureEvents: unknown[] = [];
            eventEmitter.on(
                BotEventType.commandActionCaptureStarted,
                (_ts, data) => {
                    captureEvents.push(data);
                }
            );

            processor.initialize(
                mockApi,
                mockTelegram as unknown as Parameters<
                    typeof processor.initialize
                >[1],
                [command],
                createMockBotInfo()
            );
            processor.initializeDependencies(mockApi);

            // Register a capture
            const chatInfo = createMockChatInfo();
            const traceId = 'trace:test' as TraceId;
            processor.captureRegistrationCallback(
                {
                    action: captureAction,
                    handler: captureHandlerFn,
                    trigger: ['reply text'],
                    abortController
                },
                42,
                chatInfo,
                traceId
            );

            expect(captureEvents.length).toBe(1);
        });
    });
});
