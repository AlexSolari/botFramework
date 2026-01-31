import { describe, test, expect, mock } from 'bun:test';
import { ChatContextInternal } from '../../../src/entities/context/chatContext';
import { ActionStateBase } from '../../../src/entities/states/actionStateBase';
import { TypedEventEmitter } from '../../../src/types/events';
import { TextMessage } from '../../../src/dtos/responses/textMessage';
import { ImageMessage } from '../../../src/dtos/responses/imageMessage';
import { VideoMessage } from '../../../src/dtos/responses/videoMessage';
import { UnpinResponse } from '../../../src/dtos/responses/unpin';
import { DelayResponse } from '../../../src/dtos/responses/delay';
import { Milliseconds } from '../../../src/types/timeValues';
import { ActionKey } from '../../../src/types/action';
import { ChatInfo } from '../../../src/dtos/chatInfo';
import { TraceId } from '../../../src/types/trace';
import { ScheduledAction } from '../../../src/entities/actions/scheduledAction';
import { createMockScheduler } from '../../services/actionProcessors/processorTestHelpers';
import { IStorageClient } from '../../../src/types/storage';

// Create a mock storage with configurable load response
function createMockStorage(
    loadResponse: Record<number, ActionStateBase> = {}
): IStorageClient {
    return {
        load: mock(() => Promise.resolve(loadResponse)),
        close: mock(() => Promise.resolve()),
        getActionState: mock(() =>
            Promise.resolve({ lastExecutedDate: 0, pinnedMessages: [] })
        ),
        saveActionExecutionResult: mock(() => Promise.resolve()),
        updateStateFor: mock(() => Promise.resolve())
    } as unknown as IStorageClient;
}

function createMockAction(): ScheduledAction<ActionStateBase> {
    // Create a minimal mock that satisfies ScheduledAction interface
    return {
        key: 'scheduled:test-action' as ActionKey,
        name: 'test-action',
        stateConstructor: () => new ActionStateBase(),
        exec: mock(() => Promise.resolve([])),
        // These properties are required by ScheduledAction but we mock them
        timeinHoursProvider: () => 12,
        activeProvider: () => true,
        chatsWhitelistProvider: () => [],
        cachedState: new Map(),
        cachedStateFactories: new Map(),
        handler: mock(() => Promise.resolve())
    } as unknown as ScheduledAction<ActionStateBase>;
}

function createChatContext(): ChatContextInternal<
    ActionStateBase,
    ScheduledAction<ActionStateBase>
> {
    const storage = createMockStorage();
    const scheduler = createMockScheduler();
    const eventEmitter = new TypedEventEmitter();
    const action = createMockAction();
    const chatInfo = new ChatInfo(12345, 'Test Chat', []);

    const ctx = new ChatContextInternal<
        ActionStateBase,
        ScheduledAction<ActionStateBase>
    >(
        storage,
        scheduler,
        eventEmitter,
        action,
        chatInfo,
        'trace-123' as TraceId,
        'TestBot'
    );

    return ctx;
}

describe('ChatContextInternal', () => {
    describe('constructor', () => {
        test('should set storage', () => {
            const ctx = createChatContext();

            expect(ctx.storage).toBeDefined();
        });

        test('should set scheduler', () => {
            const ctx = createChatContext();

            expect(ctx.scheduler).toBeDefined();
        });

        test('should set eventEmitter', () => {
            const ctx = createChatContext();

            expect(ctx.eventEmitter).toBeInstanceOf(TypedEventEmitter);
        });

        test('should have isInitialized as false by default', () => {
            // Note: isInitialized property no longer exists as it was removed from public API
            // All required properties are now set at construction time
            const storage = createMockStorage();
            const scheduler = createMockScheduler();
            const eventEmitter = new TypedEventEmitter();
            const action = createMockAction();
            const chatInfo = new ChatInfo(12345, 'Test Chat', []);

            const ctx = new ChatContextInternal<ActionStateBase>(
                storage,
                scheduler,
                eventEmitter,
                action,
                chatInfo,
                'trace-123' as TraceId,
                'TestBot'
            );

            // Verify context is properly initialized with all properties
            expect(ctx.action).toBeDefined();
            expect(ctx.chatInfo).toBeDefined();
        });

        test('should have empty responses by default', () => {
            const ctx = createChatContext();

            expect(ctx.responses).toEqual([]);
        });
    });

    describe('send.text', () => {
        test('should add TextMessage to responses', () => {
            const ctx = createChatContext();

            ctx.send.text('Hello, world!');

            expect(ctx.responses.length).toBe(1);
            expect(ctx.responses[0]).toBeInstanceOf(TextMessage);
        });

        test('should set correct text content', () => {
            const ctx = createChatContext();

            ctx.send.text('Test message');

            const response = ctx.responses[0] as TextMessage;
            expect(response.content).toBe('Test message');
        });

        test('should set chatInfo on response', () => {
            const ctx = createChatContext();

            ctx.send.text('Test');

            const response = ctx.responses[0] as TextMessage;
            expect(response.chatInfo).toBe(ctx.chatInfo);
        });

        test('should set traceId on response', () => {
            const ctx = createChatContext();

            ctx.send.text('Test');

            const response = ctx.responses[0] as TextMessage;
            expect(response.traceId).toBe(ctx.traceId);
        });

        test('should set action on response', () => {
            const ctx = createChatContext();

            ctx.send.text('Test');

            const response = ctx.responses[0] as TextMessage;
            expect(response.action).toBe(ctx.action);
        });

        test('should support sending options', () => {
            const ctx = createChatContext();

            ctx.send.text('Test', { pin: true });

            const response = ctx.responses[0] as TextMessage;
            expect(response.shouldPin).toBe(true);
        });

        test('should return capture controller', () => {
            const ctx = createChatContext();

            const controller = ctx.send.text('Test');

            expect(controller.captureReplies).toBeDefined();
        });

        test('should add multiple text messages', () => {
            const ctx = createChatContext();

            ctx.send.text('First');
            ctx.send.text('Second');
            ctx.send.text('Third');

            expect(ctx.responses.length).toBe(3);
        });
    });

    describe('send.image', () => {
        test('should add ImageMessage to responses', () => {
            const ctx = createChatContext();

            ctx.send.image('test-image');

            expect(ctx.responses.length).toBe(1);
            expect(ctx.responses[0]).toBeInstanceOf(ImageMessage);
        });

        test('should set correct image source path', () => {
            const ctx = createChatContext();

            ctx.send.image('my-image');

            const response = ctx.responses[0] as ImageMessage;
            expect(response.content.source).toContain('my-image.png');
        });

        test('should return capture controller', () => {
            const ctx = createChatContext();

            const controller = ctx.send.image('test');

            expect(controller.captureReplies).toBeDefined();
        });

        test('should support sending options', () => {
            const ctx = createChatContext();

            ctx.send.image('test', { pin: true });

            const response = ctx.responses[0] as ImageMessage;
            expect(response.shouldPin).toBe(true);
        });
    });

    describe('send.video', () => {
        test('should add VideoMessage to responses', () => {
            const ctx = createChatContext();

            ctx.send.video('test-video');

            expect(ctx.responses.length).toBe(1);
            expect(ctx.responses[0]).toBeInstanceOf(VideoMessage);
        });

        test('should set correct video source path', () => {
            const ctx = createChatContext();

            ctx.send.video('my-video');

            const response = ctx.responses[0] as VideoMessage;
            expect(response.content.source).toContain('my-video.mp4');
        });

        test('should return capture controller', () => {
            const ctx = createChatContext();

            const controller = ctx.send.video('test');

            expect(controller.captureReplies).toBeDefined();
        });
    });

    describe('unpinMessage', () => {
        test('should add UnpinResponse to responses', () => {
            const ctx = createChatContext();

            ctx.unpinMessage(123);

            expect(ctx.responses.length).toBe(1);
            expect(ctx.responses[0]).toBeInstanceOf(UnpinResponse);
        });

        test('should set correct message id', () => {
            const ctx = createChatContext();

            ctx.unpinMessage(456);

            const response = ctx.responses[0] as UnpinResponse;
            expect(response.messageId).toBe(456);
        });
    });

    describe('wait', () => {
        test('should add DelayResponse to responses', () => {
            const ctx = createChatContext();

            ctx.wait(1000 as Milliseconds);

            expect(ctx.responses.length).toBe(1);
            expect(ctx.responses[0]).toBeInstanceOf(DelayResponse);
        });

        test('should set correct delay duration', () => {
            const delay = 5000 as Milliseconds;
            const ctx = createChatContext();

            ctx.wait(delay);

            const response = ctx.responses[0] as DelayResponse;
            expect(response.delay).toBe(delay);
        });
    });

    describe('responses ordering', () => {
        test('should maintain order of different response types', () => {
            const ctx = createChatContext();

            ctx.send.text('Hello');
            ctx.wait(100 as Milliseconds);
            ctx.send.image('test');
            ctx.send.video('clip');
            ctx.unpinMessage(1);

            expect(ctx.responses.length).toBe(5);
            expect(ctx.responses[0]).toBeInstanceOf(TextMessage);
            expect(ctx.responses[1]).toBeInstanceOf(DelayResponse);
            expect(ctx.responses[2]).toBeInstanceOf(ImageMessage);
            expect(ctx.responses[3]).toBeInstanceOf(VideoMessage);
            expect(ctx.responses[4]).toBeInstanceOf(UnpinResponse);
        });
    });

    describe('capture controller', () => {
        test('captureReplies should add capture to response', () => {
            const ctx = createChatContext();

            const controller = ctx.send.text('Choose an option');
            controller.captureReplies(['yes', 'no'], async () => {});

            const response = ctx.responses[0] as TextMessage;
            expect(response.captures.length).toBe(1);
        });

        test('captureReplies should set triggers', () => {
            const ctx = createChatContext();
            const triggers = ['yes', 'no', /maybe/];

            const controller = ctx.send.text('Choose');
            controller.captureReplies(triggers, async () => {});

            const response = ctx.responses[0] as TextMessage;
            expect(response.captures[0].trigger).toBe(triggers);
        });

        test('captureReplies should set handler', () => {
            const ctx = createChatContext();
            const handler = async () => {};

            const controller = ctx.send.text('Choose');
            controller.captureReplies(['yes'], handler);

            const response = ctx.responses[0] as TextMessage;
            expect(response.captures[0].handler).toBe(handler);
        });

        test('captureReplies should create default AbortController if not provided', () => {
            const ctx = createChatContext();

            const controller = ctx.send.text('Choose');
            controller.captureReplies(['yes'], async () => {});

            const response = ctx.responses[0] as TextMessage;
            expect(response.captures[0].abortController).toBeInstanceOf(
                AbortController
            );
        });

        test('captureReplies should use provided AbortController', () => {
            const ctx = createChatContext();
            const abortController = new AbortController();

            const controller = ctx.send.text('Choose');
            controller.captureReplies(['yes'], async () => {}, abortController);

            const response = ctx.responses[0] as TextMessage;
            expect(response.captures[0].abortController).toBe(abortController);
        });

        test('captureReplies should set action reference', () => {
            const ctx = createChatContext();

            const controller = ctx.send.text('Choose');
            controller.captureReplies(['yes'], async () => {});

            const response = ctx.responses[0] as TextMessage;
            expect(response.captures[0].action).toBe(ctx.action);
        });
    });

    describe('actionKey getter', () => {
        test('should return action key', () => {
            const ctx = createChatContext();

            expect(ctx.actionKey).toBe('scheduled:test-action' as ActionKey);
        });
    });

    describe('loadStateOf', () => {
        test('should call storage.load with the action', () => {
            const loadMock = mock(() => Promise.resolve({}));
            const storage: IStorageClient = {
                load: loadMock,
                close: mock(() => Promise.resolve()),
                getActionState: mock(() =>
                    Promise.resolve({ lastExecutedDate: 0, pinnedMessages: [] })
                ),
                saveActionExecutionResult: mock(() => Promise.resolve()),
                updateStateFor: mock(() => Promise.resolve())
            } as unknown as IStorageClient;

            const scheduler = createMockScheduler();
            const eventEmitter = new TypedEventEmitter();
            const action = createMockAction();
            const chatInfo = new ChatInfo(12345, 'Test Chat', []);

            const ctx = new ChatContextInternal<
                ActionStateBase,
                ScheduledAction<ActionStateBase>
            >(
                storage,
                scheduler,
                eventEmitter,
                action,
                chatInfo,
                'trace-123' as TraceId,
                'TestBot'
            );

            const baseAction = createMockAction();
            const otherAction = Object.assign(
                Object.create(Object.getPrototypeOf(baseAction) as object),
                baseAction,
                {
                    key: 'scheduled:other-action' as ActionKey
                }
            ) as ScheduledAction<ActionStateBase>;

            ctx.loadStateOf(otherAction);

            expect(loadMock).toHaveBeenCalledWith(otherAction);
        });

        test('should return state for current chat if it exists', () => {
            const existingState = new ActionStateBase();
            existingState.lastExecutedDate = 12345;

            const storage: IStorageClient = {
                load: mock(() => ({ 12345: existingState })),
                close: mock(() => Promise.resolve()),
                getActionState: mock(() => ({
                    lastExecutedDate: 0,
                    pinnedMessages: []
                })),
                saveActionExecutionResult: mock(() => Promise.resolve()),
                updateStateFor: mock(() => Promise.resolve())
            } as unknown as IStorageClient;

            const scheduler = createMockScheduler();
            const eventEmitter = new TypedEventEmitter();
            const action = createMockAction();
            const chatInfo = new ChatInfo(12345, 'Test Chat', []);

            const ctx = new ChatContextInternal<
                ActionStateBase,
                ScheduledAction<ActionStateBase>
            >(
                storage,
                scheduler,
                eventEmitter,
                action,
                chatInfo,
                'trace-123' as TraceId,
                'TestBot'
            );

            const otherAction = createMockAction();
            const result = ctx.loadStateOf(otherAction);

            expect(result.lastExecutedDate).toBe(12345);
        });

        test('should return new state from constructor if no state exists', () => {
            const storage: IStorageClient = {
                load: mock(() => Promise.resolve({})),
                close: mock(() => Promise.resolve()),
                getActionState: mock(() =>
                    Promise.resolve({ lastExecutedDate: 0, pinnedMessages: [] })
                ),
                saveActionExecutionResult: mock(() => Promise.resolve()),
                updateStateFor: mock(() => Promise.resolve())
            } as unknown as IStorageClient;

            const scheduler = createMockScheduler();
            const eventEmitter = new TypedEventEmitter();
            const action = createMockAction();
            const chatInfo = new ChatInfo(12345, 'Test Chat', []);

            const ctx = new ChatContextInternal<
                ActionStateBase,
                ScheduledAction<ActionStateBase>
            >(
                storage,
                scheduler,
                eventEmitter,
                action,
                chatInfo,
                'trace-123' as TraceId,
                'TestBot'
            );

            const otherAction = createMockAction();
            const result = ctx.loadStateOf(otherAction);

            expect(result.lastExecutedDate).toBe(0);
            expect(result.pinnedMessages).toEqual([]);
        });

        test('should return frozen state', () => {
            const existingState = new ActionStateBase();

            const storage: IStorageClient = {
                load: mock(() => Promise.resolve({ 12345: existingState })),
                close: mock(() => Promise.resolve()),
                getActionState: mock(() =>
                    Promise.resolve({ lastExecutedDate: 0, pinnedMessages: [] })
                ),
                saveActionExecutionResult: mock(() => Promise.resolve()),
                updateStateFor: mock(() => Promise.resolve())
            } as unknown as IStorageClient;

            const scheduler = createMockScheduler();
            const eventEmitter = new TypedEventEmitter();
            const action = createMockAction();
            const chatInfo = new ChatInfo(12345, 'Test Chat', []);

            const ctx = new ChatContextInternal<
                ActionStateBase,
                ScheduledAction<ActionStateBase>
            >(
                storage,
                scheduler,
                eventEmitter,
                action,
                chatInfo,
                'trace-123' as TraceId,
                'TestBot'
            );

            const otherAction = createMockAction();
            const result = ctx.loadStateOf(otherAction);

            expect(Object.isFrozen(result)).toBe(true);
        });
    });

    describe('updateStateOf', () => {
        test('should call storage.updateStateFor', async () => {
            const updateStateForMock = mock(() => Promise.resolve());
            const storage: IStorageClient = {
                load: mock(() => Promise.resolve({})),
                close: mock(() => Promise.resolve()),
                getActionState: mock(() =>
                    Promise.resolve({ lastExecutedDate: 0, pinnedMessages: [] })
                ),
                saveActionExecutionResult: mock(() => Promise.resolve()),
                updateStateFor: updateStateForMock
            } as unknown as IStorageClient;

            const scheduler = createMockScheduler();
            const eventEmitter = new TypedEventEmitter();
            const action = createMockAction();
            const chatInfo = new ChatInfo(12345, 'Test Chat', []);

            const ctx = new ChatContextInternal<
                ActionStateBase,
                ScheduledAction<ActionStateBase>
            >(
                storage,
                scheduler,
                eventEmitter,
                action,
                chatInfo,
                'trace-123' as TraceId,
                'TestBot'
            );

            const otherAction = createMockAction();
            const mutation = (_state: ActionStateBase): Promise<void> => {
                return Promise.resolve();
            };

            await ctx.updateStateOf(otherAction, mutation);

            expect(updateStateForMock).toHaveBeenCalledWith(
                otherAction,
                ctx.chatInfo.id,
                mutation
            );
        });
    });
});
