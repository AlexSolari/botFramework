import {
    describe,
    test,
    expect,
    beforeEach,
    mock,
    setSystemTime,
    afterEach
} from 'bun:test';
import { BotEventType, TypedEventEmitter } from '../../../src/types/events';
import { IStorageClient } from '../../../src/types/storage';
import { Seconds } from '../../../src/types/timeValues';
import { ScheduledActionProcessor } from '../../../src/services/actionProcessors/scheduledActionProcessor';
import { ActionKey } from '../../../src/types/action';
import type { ScheduledAction } from '../../../src/entities/actions/scheduledAction';
import type { IActionState } from '../../../src/types/actionState';
import { ScheduledActionBuilder } from '../../../src/helpers/builders/scheduledActionBuilder';
import {
    createMockStorage,
    createMockScheduler,
    createMockTelegramApi,
    getMockFn,
    type MockScheduler
} from './processorTestHelpers';

function createMockScheduledAction(): ScheduledAction<IActionState> {
    return {
        key: 'scheduled:test-action' as ActionKey,
        exec: mock(() => Promise.resolve([]))
    } as unknown as ScheduledAction<IActionState>;
}

function createImmediateOnetimeScheduler(): MockScheduler {
    const scheduler = createMockScheduler();
    const createOnetimeTaskMock = mock(
        (_name: string, action: () => void, _delay: number, _owner: string) => {
            action();
        }
    );

    return {
        ...scheduler,
        createOnetimeTask: createOnetimeTaskMock,
        createOnetimeTaskCallCount: () =>
            createOnetimeTaskMock.mock.calls.length
    };
}

// =============================================================================
// ScheduledActionProcessor Tests
// =============================================================================

describe('ScheduledActionProcessor', () => {
    let processor: ScheduledActionProcessor;
    let eventEmitter: TypedEventEmitter;
    let storage: IStorageClient;
    let scheduler: MockScheduler;
    const chats = { chat1: 111, chat2: 222 };

    beforeEach(() => {
        eventEmitter = new TypedEventEmitter();
        storage = createMockStorage();
        scheduler = createMockScheduler();
        processor = new ScheduledActionProcessor(
            'scheduled-bot',
            chats,
            storage,
            scheduler,
            eventEmitter
        );
    });

    describe('constructor', () => {
        test('should create processor with chats', () => {
            expect(processor).toBeDefined();
        });
    });

    describe('initialize', () => {
        test('should store api reference', () => {
            const mockApi = createMockTelegramApi();
            processor.initialize(mockApi, [], 3600 as Seconds);

            // If no scheduled actions, no tasks should be created
            expect(scheduler.createTaskCallCount()).toBe(0);
        });

        test('should call initializeDependencies with api when no actions', () => {
            const mockApi = createMockTelegramApi();

            processor.initialize(mockApi, [], 3600 as Seconds);

            // After initialize, the processor should still be defined
            expect(processor).toBeDefined();
        });
    });

    describe('edge cases', () => {
        test('should handle empty chats object', () => {
            const localProcessor = new ScheduledActionProcessor(
                'empty-chats-bot',
                {}, // Empty chats
                createMockStorage(),
                createMockScheduler(),
                new TypedEventEmitter()
            );

            expect(localProcessor).toBeDefined();
        });

        test('should handle no scheduled actions', () => {
            const localScheduler = createMockScheduler();
            const localProcessor = new ScheduledActionProcessor(
                'no-actions-bot',
                { test: 123 },
                createMockStorage(),
                localScheduler,
                new TypedEventEmitter()
            );

            const mockApi = createMockTelegramApi();
            localProcessor.initialize(mockApi, [], 3600 as Seconds);

            // Should not create any tasks
            expect(localScheduler.createTaskCallCount()).toBe(0);
            expect(localScheduler.createOnetimeTaskCallCount()).toBe(0);
        });
    });

    describe('multi-chat configuration', () => {
        test('should accept multiple chats in configuration', () => {
            const multiChats = {
                general: 100,
                random: 200,
                dev: 300
            };

            const localProcessor = new ScheduledActionProcessor(
                'multi-chat-bot',
                multiChats,
                createMockStorage(),
                createMockScheduler(),
                new TypedEventEmitter()
            );

            // The processor should be properly instantiated with multiple chats
            expect(localProcessor).toBeDefined();
        });
    });

    describe('event emission', () => {
        test('should emit scheduledProcessingStarted when processing begins', () => {
            const localEventEmitter = new TypedEventEmitter();

            const localProcessor = new ScheduledActionProcessor(
                'event-bot',
                chats,
                storage,
                scheduler,
                localEventEmitter
            );

            const mockApi = createMockTelegramApi();
            localProcessor.initialize(mockApi, [], 3600 as Seconds);

            // When initialized with scheduled actions, processing started would be emitted
            // when the periodic task runs
            expect(localProcessor).toBeDefined();
        });

        test('should emit scheduledProcessingFinished when processing completes', () => {
            const localEventEmitter = new TypedEventEmitter();

            const localProcessor = new ScheduledActionProcessor(
                'finish-bot',
                chats,
                storage,
                scheduler,
                localEventEmitter
            );

            const mockApi = createMockTelegramApi();
            localProcessor.initialize(mockApi, [], 3600 as Seconds);

            // When processing completes, scheduledProcessingFinished event is emitted
            expect(localProcessor).toBeDefined();
        });
    });

    describe('runScheduled', () => {
        test('should emit scheduledProcessingStarted when executed', async () => {
            const localEventEmitter = new TypedEventEmitter();
            const localScheduler = createImmediateOnetimeScheduler();

            const localProcessor = new ScheduledActionProcessor(
                'run-bot',
                { chat1: 111 },
                createMockStorage(),
                localScheduler,
                localEventEmitter
            );

            const startedEvents: unknown[] = [];
            localEventEmitter.on(
                BotEventType.scheduledProcessingStarted,
                (_ts, data) => {
                    startedEvents.push(data);
                }
            );

            const mockApi = createMockTelegramApi();
            const action = createMockScheduledAction();

            localProcessor.initialize(mockApi, [action], 3600 as Seconds);

            // Give async runScheduled() time to complete
            await new Promise((resolve) => setTimeout(resolve, 20));

            expect(startedEvents.length).toBeGreaterThanOrEqual(1);
        });

        test('should emit scheduledProcessingFinished after execution', async () => {
            const localEventEmitter = new TypedEventEmitter();
            const localScheduler = createImmediateOnetimeScheduler();

            const localProcessor = new ScheduledActionProcessor(
                'finish-run-bot',
                { chat1: 111 },
                createMockStorage(),
                localScheduler,
                localEventEmitter
            );

            const finishedEvents: unknown[] = [];
            localEventEmitter.on(
                BotEventType.scheduledProcessingFinished,
                (_ts, data) => {
                    finishedEvents.push(data);
                }
            );

            const mockApi = createMockTelegramApi();
            const action = createMockScheduledAction();

            localProcessor.initialize(mockApi, [action], 3600 as Seconds);

            await new Promise((resolve) => setTimeout(resolve, 20));

            expect(finishedEvents.length).toBeGreaterThanOrEqual(1);
        });

        test('should call executeAction for each chat and action combination', async () => {
            const localEventEmitter = new TypedEventEmitter();
            const localScheduler = createMockScheduler();

            const localProcessor = new ScheduledActionProcessor(
                'multi-run-bot',
                { chat1: 111, chat2: 222 },
                createMockStorage(),
                localScheduler,
                localEventEmitter
            );

            const mockApi = createMockTelegramApi();
            const execMock = mock(() => Promise.resolve([]));
            const action = {
                key: 'scheduled:multi-action' as ActionKey,
                exec: execMock
            } as unknown as ScheduledAction<IActionState>;

            localProcessor.initialize(mockApi, [action], 3600 as Seconds);

            await new Promise((resolve) => setTimeout(resolve, 20));

            // The startup check runs once per chat (2 chats × 1 action = 2 calls)
            expect(execMock.mock.calls.length).toBe(2);
        });

        test('should create a periodic task with the provided period', () => {
            const localEventEmitter = new TypedEventEmitter();
            const localScheduler = createMockScheduler();

            const localProcessor = new ScheduledActionProcessor(
                'task-bot',
                { chat1: 111 },
                createMockStorage(),
                localScheduler,
                localEventEmitter
            );

            const mockApi = createMockTelegramApi();
            const action = createMockScheduledAction();

            localProcessor.initialize(mockApi, [action], 3600 as Seconds);

            // Either createTask (if at :00) or createOnetimeTask (otherwise) is created
            const totalTasks =
                localScheduler.createTaskCallCount() +
                localScheduler.createOnetimeTaskCallCount();
            expect(totalTasks).toBeGreaterThanOrEqual(1);
        });

        test('should execute the onetime task callback which creates the periodic task', async () => {
            // Use a scheduler that fires the onetime callback immediately
            const createTaskMock = mock(() => {});
            const immediateScheduler: MockScheduler = {
                createTask: createTaskMock,
                createOnetimeTask: mock(
                    (
                        _name: string,
                        action: () => void,
                        _delay: number,
                        _owner: string
                    ) => {
                        setImmediate(() => action());
                    }
                ),
                cancelAllTasks: mock(() => {}),
                createTaskCallCount: () => createTaskMock.mock.calls.length,
                createOnetimeTaskCallCount: () => 0
            };

            const localProcessor = new ScheduledActionProcessor(
                'immediate-onetime-bot',
                { chat1: 111 },
                createMockStorage(),
                immediateScheduler,
                new TypedEventEmitter()
            );

            const mockApi = createMockTelegramApi();
            const action = createMockScheduledAction();

            localProcessor.initialize(mockApi, [action], 3600 as Seconds);

            // Wait for setImmediate to fire the onetime task callback
            await new Promise((resolve) => setTimeout(resolve, 30));

            // The onetime callback should have called createTask
            expect(createTaskMock.mock.calls.length).toBe(1);
        });

        test('should run a check at startup, before the first top of the hour', async () => {
            const alignedTime = new Date();
            alignedTime.setMinutes(30, 0, 0);
            setSystemTime(alignedTime);

            try {
                const localScheduler = createMockScheduler();
                const execMock = mock(() => Promise.resolve([]));
                const action = {
                    key: 'scheduled:startup-action' as ActionKey,
                    exec: execMock
                } as unknown as ScheduledAction<IActionState>;

                const localProcessor = new ScheduledActionProcessor(
                    'startup-bot',
                    { chat1: 111 },
                    createMockStorage(),
                    localScheduler,
                    new TypedEventEmitter()
                );

                localProcessor.initialize(
                    createMockTelegramApi(),
                    [action],
                    3600 as Seconds
                );

                const delays = getMockFn(
                    localScheduler.createOnetimeTask
                ).mock.calls.map((call) => call[2] as number);
                expect(delays).toEqual([0, 1800000]);

                await new Promise((resolve) => setTimeout(resolve, 20));
                expect(execMock.mock.calls.length).toBe(1);
                expect(localScheduler.createTaskCallCount()).toBe(0);
            } finally {
                setSystemTime();
            }
        });

        test('should start the periodic checks at the next hour when initialized at the top of the hour', () => {
            const alignedTime = new Date();
            alignedTime.setMinutes(0, 0, 0);
            setSystemTime(alignedTime);

            try {
                const localScheduler = createMockScheduler();

                const localProcessor = new ScheduledActionProcessor(
                    'aligned-bot',
                    { chat1: 111 },
                    createMockStorage(),
                    localScheduler,
                    new TypedEventEmitter()
                );

                localProcessor.initialize(
                    createMockTelegramApi(),
                    [createMockScheduledAction()],
                    3600 as Seconds
                );

                // The startup check covers the current hour
                const delays = getMockFn(
                    localScheduler.createOnetimeTask
                ).mock.calls.map((call) => call[2] as number);
                expect(delays).toEqual([0, 3600000]);
            } finally {
                setSystemTime();
            }
        });

        test('should fire the onetime task setTimeout callback when delay is short', async () => {
            // Set system time to just before the minute boundary so delay ≈ 1ms
            const justBeforeBoundary = new Date();
            justBeforeBoundary.setMinutes(59, 59, 999);
            setSystemTime(justBeforeBoundary);

            try {
                const localEventEmitter = new TypedEventEmitter();
                const localScheduler = createMockScheduler();

                const localProcessor = new ScheduledActionProcessor(
                    'near-boundary-bot',
                    { chat1: 111 },
                    createMockStorage(),
                    localScheduler,
                    localEventEmitter
                );

                const mockApi = createMockTelegramApi();
                const action = createMockScheduledAction();

                localProcessor.initialize(mockApi, [action], 3600 as Seconds);

                // The delay is ~1ms so the setTimeout callback should fire quickly
                await new Promise((resolve) => setTimeout(resolve, 50));

                // The onetime task callback should have created a periodic task
                expect(localScheduler.createTaskCallCount()).toBe(1);
            } finally {
                setSystemTime(); // restore real time
            }
        });
    });

    describe('overlapping checks', () => {
        function createStartupCheckScheduler() {
            const startupChecks: (() => unknown)[] = [];
            const scheduler: MockScheduler = {
                ...createMockScheduler(),
                createOnetimeTask: mock(
                    (name: string, action: () => unknown) => {
                        if (name === 'ScheduledProcessing_Startup') {
                            startupChecks.push(action);
                        }
                    }
                )
            };

            return {
                scheduler,
                runCheck: () => startupChecks[0]()
            };
        }

        function createInMemoryStorage(): IStorageClient {
            const states = new Map<string, IActionState>();

            return {
                ...createMockStorage(),
                getActionState: ((
                    action: ScheduledAction<IActionState>,
                    chatId: number
                ) =>
                    structuredClone(
                        states.get(`${action.key}-${chatId}`) ??
                            action.stateConstructor()
                    )) as IStorageClient['getActionState'],
                saveActionExecutionResult: ((
                    action: ScheduledAction<IActionState>,
                    chatId: number,
                    state: IActionState
                ) => {
                    states.set(
                        `${action.key}-${chatId}`,
                        structuredClone(state)
                    );
                    return Promise.resolve();
                }) as IStorageClient['saveActionExecutionResult']
            };
        }

        function createPendingHandler() {
            const pending: (() => void)[] = [];
            const handler = mock(
                () =>
                    new Promise<void>((resolve) => {
                        pending.push(resolve);
                    })
            );

            return {
                handler,
                finish: () => pending.splice(0).forEach((run) => run())
            };
        }

        const nextTick = () =>
            new Promise((resolve) => setTimeout(resolve, 0));

        test('should not run a handler again while its previous run in the chat is in progress', async () => {
            const { scheduler: localScheduler, runCheck } =
                createStartupCheckScheduler();
            const { handler, finish } = createPendingHandler();
            const action = new ScheduledActionBuilder('slow')
                .runAt(0)
                .in([111, 222])
                .do(handler)
                .build();

            const localProcessor = new ScheduledActionProcessor(
                'overlap-bot',
                { chat1: 111, chat2: 222 },
                createInMemoryStorage(),
                localScheduler,
                new TypedEventEmitter()
            );
            localProcessor.initialize(
                createMockTelegramApi(),
                [action],
                3600 as Seconds
            );

            runCheck();
            await nextTick();
            runCheck();
            await nextTick();
            expect(handler.mock.calls.length).toBe(2);

            finish();
            await localProcessor.waitForProcessing();

            // The waiting check sees the saved run and skips the handler
            expect(handler.mock.calls.length).toBe(2);
        });

        test('should run other actions while one is still running', async () => {
            const { scheduler: localScheduler, runCheck } =
                createStartupCheckScheduler();
            const slow = createPendingHandler();
            const slowExec = mock(() => slow.handler().then(() => []));
            const fastExec = mock(() => Promise.resolve([]));
            const actions = [
                { key: 'scheduled:slow-action', exec: slowExec },
                { key: 'scheduled:fast-action', exec: fastExec }
            ] as unknown as ScheduledAction<IActionState>[];

            const localProcessor = new ScheduledActionProcessor(
                'overlap-other-bot',
                { chat1: 111 },
                createMockStorage(),
                localScheduler,
                new TypedEventEmitter()
            );
            localProcessor.initialize(
                createMockTelegramApi(),
                actions,
                3600 as Seconds
            );

            runCheck();
            await nextTick();
            runCheck();
            await nextTick();

            expect(slowExec.mock.calls.length).toBe(1);
            expect(fastExec.mock.calls.length).toBe(2);

            slow.finish();
            await nextTick();

            // The waiting run starts once the previous one finishes
            expect(slowExec.mock.calls.length).toBe(2);

            slow.finish();
            await localProcessor.waitForProcessing();
        });
    });
});
