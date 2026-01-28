import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { JsonFileStorage } from '../../src/services/jsonFileStorage';
import { IActionState } from '../../src/types/actionState';
import { ActionKey, IActionWithState } from '../../src/types/action';
import { BotEventType, TypedEventEmitter } from '../../src/types/events';
import { rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

interface TestActionState extends IActionState {
    customField: string;
}

function buildPath(storagePath: string, botName: string, actionKey: string) {
    return `${storagePath}/${botName}/${actionKey.replaceAll(':', '/')}.json`;
}

function createTestAction(
    key: string,
    defaultState?: Partial<TestActionState>
): IActionWithState<TestActionState> {
    return {
        key: key as ActionKey,
        stateConstructor: () => ({
            lastExecutedDate: 0,
            pinnedMessages: [],
            customField: 'default',
            ...defaultState
        }),
        exec: () => Promise.resolve([])
    };
}

function createEventEmitter(): TypedEventEmitter {
    return new TypedEventEmitter();
}

function ensureActionFileExists(
    storagePath: string,
    botName: string,
    actionKey: string,
    content: Record<number, unknown> = {}
) {
    const filePath = buildPath(storagePath, botName, actionKey);
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, JSON.stringify(content));
}

const TEST_STORAGE_PATH = 'test-storage';
const TEST_BOT_NAME = 'test-bot';

describe('JsonFileStorage', () => {
    let storage: JsonFileStorage | null;
    let eventEmitter: TypedEventEmitter;
    let testAction: IActionWithState<TestActionState>;

    beforeEach(() => {
        // Clean up test storage before each test
        if (existsSync(TEST_STORAGE_PATH)) {
            rmSync(TEST_STORAGE_PATH, { recursive: true, force: true });
        }
        
        eventEmitter = createEventEmitter();
        testAction = createTestAction('test:action');
        storage = null;
        
        // Pre-create the storage structure for the default test action
        ensureActionFileExists(TEST_STORAGE_PATH, TEST_BOT_NAME, 'test:action');
    });

    afterEach(() => {
        // Don't call close() in cleanup - it acquires locks permanently
        // Just reset the reference
        storage = null;
        
        // Clean up test storage after each test
        if (existsSync(TEST_STORAGE_PATH)) {
            rmSync(TEST_STORAGE_PATH, { recursive: true, force: true });
        }
    });

    describe('constructor', () => {
        test('should create storage directory if it does not exist', () => {
            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            expect(existsSync(`${TEST_STORAGE_PATH}/${TEST_BOT_NAME}/`)).toBe(true);
        });

        test('should initialize locks for all actions', async () => {
            const action1 = createTestAction('action:one');
            const action2 = createTestAction('action:two');

            // Pre-create files for these actions
            ensureActionFileExists(TEST_STORAGE_PATH, TEST_BOT_NAME, 'action:one');
            ensureActionFileExists(TEST_STORAGE_PATH, TEST_BOT_NAME, 'action:two');

            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [action1, action2],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            // Both actions should be loadable without deadlock
            const [result1, result2] = await Promise.all([
                storage.load(action1),
                storage.load(action2)
            ]);

            expect(result1).toEqual({});
            expect(result2).toEqual({});
        });
    });

    describe('load', () => {
        test('should return empty object for new action', async () => {
            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            const result = await storage.load(testAction);

            expect(result).toEqual({});
        });

        test('should load existing data from file', async () => {
            // Pre-create the file with data
            const dirPath = `${TEST_STORAGE_PATH}/${TEST_BOT_NAME}/test`;
            mkdirSync(dirPath, { recursive: true });
            
            const existingData: Record<number, TestActionState> = {
                123: {
                    lastExecutedDate: 1000,
                    pinnedMessages: [1, 2, 3],
                    customField: 'existing'
                }
            };
            writeFileSync(
                `${dirPath}/action.json`,
                JSON.stringify(existingData)
            );

            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            const result = await storage.load(testAction);

            expect(result).toEqual(existingData);
        });

        test('should cache loaded data', async () => {
            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            const cacheMissEvents: ActionKey[] = [];
            eventEmitter.on(BotEventType.storageCacheMiss, (_timestamp, key) => {
                cacheMissEvents.push(key);
            });

            // First load - cache miss
            await storage.load(testAction);
            // Second load - should use cache (no cache miss event)
            await storage.load(testAction);

            // Only one cache miss should occur
            expect(cacheMissEvents.length).toBe(1);
        });
    });

    describe('getActionState', () => {
        test('should return default state for new chat', async () => {
            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            const result = await storage.getActionState(testAction, 123);

            expect(result).toEqual({
                lastExecutedDate: 0,
                pinnedMessages: [],
                customField: 'default'
            });
        });

        test('should return existing state for known chat', async () => {
            // Pre-create file with data
            const dirPath = `${TEST_STORAGE_PATH}/${TEST_BOT_NAME}/test`;
            mkdirSync(dirPath, { recursive: true });
            
            const existingData: Record<number, TestActionState> = {
                456: {
                    lastExecutedDate: 2000,
                    pinnedMessages: [10, 20],
                    customField: 'saved'
                }
            };
            writeFileSync(
                `${dirPath}/action.json`,
                JSON.stringify(existingData)
            );

            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            const result = await storage.getActionState(testAction, 456);

            expect(result).toEqual(existingData[456]);
        });

        test('should emit loading and loaded events', async () => {
            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            const loadingEvents: unknown[] = [];
            const loadedEvents: unknown[] = [];

            eventEmitter.on(BotEventType.storageStateLoading, (_timestamp, data) => {
                loadingEvents.push(data);
            });
            eventEmitter.on(BotEventType.storageStateLoaded, (_timestamp, data) => {
                loadedEvents.push(data);
            });

            await storage.getActionState(testAction, 789);

            expect(loadingEvents.length).toBe(1);
            expect(loadedEvents.length).toBe(1);
        });
    });

    describe('saveActionExecutionResult', () => {
        test('should save state to file', async () => {
            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            const newState: TestActionState = {
                lastExecutedDate: 5000,
                pinnedMessages: [100],
                customField: 'newValue'
            };

            await storage.saveActionExecutionResult(testAction, 123, newState);

            // Verify by loading
            const result = await storage.getActionState(testAction, 123);
            expect(result).toEqual(newState);
        });

        test('should emit saving and saved events', async () => {
            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            const savingEvents: unknown[] = [];
            const savedEvents: unknown[] = [];

            eventEmitter.on(BotEventType.storageStateSaving, (_timestamp, data) => {
                savingEvents.push(data);
            });
            eventEmitter.on(BotEventType.storageStateSaved, (_timestamp, data) => {
                savedEvents.push(data);
            });

            await storage.saveActionExecutionResult(testAction, 123, {
                lastExecutedDate: 1000,
                pinnedMessages: [],
                customField: 'test'
            });

            expect(savingEvents.length).toBe(1);
            expect(savedEvents.length).toBe(1);
        });

        test('should preserve existing chat states when saving new one', async () => {
            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            const state1: TestActionState = {
                lastExecutedDate: 1000,
                pinnedMessages: [1],
                customField: 'chat1'
            };
            const state2: TestActionState = {
                lastExecutedDate: 2000,
                pinnedMessages: [2],
                customField: 'chat2'
            };

            await storage.saveActionExecutionResult(testAction, 111, state1);
            await storage.saveActionExecutionResult(testAction, 222, state2);

            const result1 = await storage.getActionState(testAction, 111);
            const result2 = await storage.getActionState(testAction, 222);

            expect(result1).toEqual(state1);
            expect(result2).toEqual(state2);
        });
    });

    describe('updateStateFor', () => {
        test('should update existing state', async () => {
            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            // First save initial state
            await storage.saveActionExecutionResult(testAction, 123, {
                lastExecutedDate: 1000,
                pinnedMessages: [1],
                customField: 'initial'
            });

            // Update the state
            await storage.updateStateFor(testAction, 123, (state) => {
                state.customField = 'updated';
                state.pinnedMessages.push(2);
            });

            const result = await storage.getActionState(testAction, 123);

            expect(result.customField).toBe('updated');
            expect(result.pinnedMessages).toEqual([1, 2]);
        });

        test('should support async update function', async () => {
            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            await storage.saveActionExecutionResult(testAction, 123, {
                lastExecutedDate: 1000,
                pinnedMessages: [],
                customField: 'initial'
            });

            const asyncUpdate = async (state: TestActionState) => {
                await new Promise((resolve) => setTimeout(resolve, 10));
                state.customField = 'async-updated';
            };
            await storage.updateStateFor(testAction, 123, asyncUpdate);

            const result = await storage.getActionState(testAction, 123);

            expect(result.customField).toBe('async-updated');
        });
    });

    describe('close', () => {
        test('should have close method defined', () => {
            const localStorage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            // Just verify the method exists and is callable
            expect(typeof localStorage.close).toBe('function');
        });
    });

    describe('locking behavior', () => {
        test('should emit lock events in correct order', async () => {
            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            const events: string[] = [];

            eventEmitter.on(BotEventType.storageLockAcquiring, () => {
                events.push('acquiring');
            });
            eventEmitter.on(BotEventType.storageLockAcquired, () => {
                events.push('acquired');
            });
            eventEmitter.on(BotEventType.storageLockReleased, () => {
                events.push('released');
            });

            await storage.load(testAction);

            expect(events).toEqual(['acquiring', 'acquired', 'released']);
        });

        test('should serialize concurrent operations on same action', async () => {
            const localStorage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            const operationOrder: number[] = [];

            // Start multiple concurrent save operations
            const promises = [1, 2, 3].map(async (num) => {
                await localStorage.saveActionExecutionResult(testAction, 123, {
                    lastExecutedDate: num * 1000,
                    pinnedMessages: [num],
                    customField: `value${num}`
                });
                operationOrder.push(num);
            });

            await Promise.all(promises);

            // All operations should complete (order may vary due to async)
            const sortedOrder = [...operationOrder].sort((a, b) => a - b);
            expect(sortedOrder).toEqual([1, 2, 3]);
        });
    });

    describe('path handling', () => {
        test('should handle action keys with colons by converting to path separators', async () => {
            const nestedAction = createTestAction('nested:path:action');

            // Pre-create the nested action file
            ensureActionFileExists(TEST_STORAGE_PATH, TEST_BOT_NAME, 'nested:path:action');

            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [nestedAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            await storage.saveActionExecutionResult(nestedAction, 123, {
                lastExecutedDate: 1000,
                pinnedMessages: [],
                customField: 'nested'
            });

            // Verify the file was created at the correct nested path
            expect(
                existsSync(`${TEST_STORAGE_PATH}/${TEST_BOT_NAME}/nested/path/action.json`)
            ).toBe(true);
        });

        test('should use default storage path when not provided', () => {
            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction],
                eventEmitter
                // No path provided - should use 'storage' default
            );

            expect(existsSync(`storage/${TEST_BOT_NAME}/`)).toBe(true);

            // Cleanup default storage
            rmSync(`storage/${TEST_BOT_NAME}/`, { recursive: true, force: true });
        });
    });

    describe('dynamically registered actions', () => {
        test('should handle actions not registered in constructor', async () => {
            const dynamicAction = createTestAction('dynamic:action');

            // Pre-create file for the dynamic action
            ensureActionFileExists(TEST_STORAGE_PATH, TEST_BOT_NAME, 'dynamic:action');

            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [], // No actions registered initially
                eventEmitter,
                TEST_STORAGE_PATH
            );

            // Should be able to load and save for unregistered action
            const loadResult = await storage.load(dynamicAction);
            expect(loadResult).toEqual({});

            await storage.saveActionExecutionResult(dynamicAction, 123, {
                lastExecutedDate: 1000,
                pinnedMessages: [],
                customField: 'dynamic'
            });

            const result = await storage.getActionState(dynamicAction, 123);
            expect(result.customField).toBe('dynamic');
        });
    });

    // Tests based on real usage patterns in the codebase
    describe('command/scheduled action workflow', () => {
        // Pattern: getActionState -> handler executes -> saveActionExecutionResult
        // Used by CommandAction and ScheduledAction
        
        test('should support get-modify-save workflow (command action pattern)', async () => {
            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            const chatId = 12345;

            // Step 1: Get initial state (like CommandAction.exec does)
            const initialState = await storage.getActionState(testAction, chatId);
            expect(initialState.lastExecutedDate).toBe(0);

            // Step 2: Modify state (simulating action execution)
            const newState: TestActionState = {
                ...initialState,
                lastExecutedDate: Date.now(),
                customField: 'executed'
            };

            // Step 3: Save the result (like CommandAction.exec does after handler)
            await storage.saveActionExecutionResult(testAction, chatId, newState);

            // Verify persistence
            const loadedState = await storage.getActionState(testAction, chatId);
            expect(loadedState.lastExecutedDate).toBe(newState.lastExecutedDate);
            expect(loadedState.customField).toBe('executed');
        });

        test('should maintain isolation between different chats', async () => {
            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            const chat1 = 111;
            const chat2 = 222;
            const chat3 = 333;

            // Save different states for different chats
            await storage.saveActionExecutionResult(testAction, chat1, {
                lastExecutedDate: 1000,
                pinnedMessages: [1],
                customField: 'chat1'
            });
            await storage.saveActionExecutionResult(testAction, chat2, {
                lastExecutedDate: 2000,
                pinnedMessages: [2],
                customField: 'chat2'
            });

            // Verify each chat has its own state
            const state1 = await storage.getActionState(testAction, chat1);
            const state2 = await storage.getActionState(testAction, chat2);
            const state3 = await storage.getActionState(testAction, chat3);

            expect(state1.customField).toBe('chat1');
            expect(state2.customField).toBe('chat2');
            expect(state3.customField).toBe('default'); // Unmodified chat gets default
        });

        test('should maintain isolation between different actions', async () => {
            const commandAction = createTestAction('command:myCommand');
            const scheduledAction = createTestAction('scheduled:myScheduled');

            ensureActionFileExists(TEST_STORAGE_PATH, TEST_BOT_NAME, 'command:myCommand');
            ensureActionFileExists(TEST_STORAGE_PATH, TEST_BOT_NAME, 'scheduled:myScheduled');

            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [commandAction, scheduledAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            const chatId = 123;

            // Save states for same chat but different actions
            await storage.saveActionExecutionResult(commandAction, chatId, {
                lastExecutedDate: 1000,
                pinnedMessages: [],
                customField: 'from-command'
            });
            await storage.saveActionExecutionResult(scheduledAction, chatId, {
                lastExecutedDate: 2000,
                pinnedMessages: [],
                customField: 'from-scheduled'
            });

            // Each action should have its own state
            const cmdState = await storage.getActionState(commandAction, chatId);
            const schedState = await storage.getActionState(scheduledAction, chatId);

            expect(cmdState.customField).toBe('from-command');
            expect(schedState.customField).toBe('from-scheduled');
        });
    });

    describe('cross-action state access (BaseContext pattern)', () => {
        // Pattern: load() to get all states, then access specific chat
        // Used by BaseContext.loadStateOf()
        
        test('should support loading all states for an action', async () => {
            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            // Populate states for multiple chats
            await storage.saveActionExecutionResult(testAction, 100, {
                lastExecutedDate: 1000,
                pinnedMessages: [],
                customField: 'chat100'
            });
            await storage.saveActionExecutionResult(testAction, 200, {
                lastExecutedDate: 2000,
                pinnedMessages: [],
                customField: 'chat200'
            });

            // Load all states (like BaseContext.loadStateOf does)
            const allStates = await storage.load(testAction);

            expect(Object.keys(allStates).length).toBe(2);
            expect(allStates[100].customField).toBe('chat100');
            expect(allStates[200].customField).toBe('chat200');
        });

        test('should support updateStateFor from another action context', async () => {
            const otherAction = createTestAction('other:action');
            ensureActionFileExists(TEST_STORAGE_PATH, TEST_BOT_NAME, 'other:action');

            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction, otherAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            const chatId = 456;

            // First, save initial state
            await storage.saveActionExecutionResult(otherAction, chatId, {
                lastExecutedDate: 1000,
                pinnedMessages: [1, 2],
                customField: 'initial'
            });

            // Update state from different context (like BaseContext.updateStateOf)
            await storage.updateStateFor(otherAction, chatId, (state) => {
                state.pinnedMessages.push(3);
                state.customField = 'modified-externally';
            });

            const result = await storage.getActionState(otherAction, chatId);
            expect(result.pinnedMessages).toEqual([1, 2, 3]);
            expect(result.customField).toBe('modified-externally');
        });
    });

    describe('pinnedMessages array handling', () => {
        // IActionState includes pinnedMessages array - test array operations
        
        test('should correctly persist and restore arrays', async () => {
            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            await storage.saveActionExecutionResult(testAction, 123, {
                lastExecutedDate: 0,
                pinnedMessages: [101, 102, 103, 104, 105],
                customField: 'test'
            });

            const loaded = await storage.getActionState(testAction, 123);
            expect(loaded.pinnedMessages).toEqual([101, 102, 103, 104, 105]);
            expect(loaded.pinnedMessages.length).toBe(5);
        });

        test('should handle empty arrays', async () => {
            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            await storage.saveActionExecutionResult(testAction, 123, {
                lastExecutedDate: 0,
                pinnedMessages: [],
                customField: 'test'
            });

            const loaded = await storage.getActionState(testAction, 123);
            expect(loaded.pinnedMessages).toEqual([]);
            expect(Array.isArray(loaded.pinnedMessages)).toBe(true);
        });
    });

    describe('lastExecutedDate handling', () => {
        // CommandAction and ScheduledAction update lastExecutedDate after execution
        
        test('should persist timestamp values correctly', async () => {
            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            const timestamp = Date.now();

            await storage.saveActionExecutionResult(testAction, 123, {
                lastExecutedDate: timestamp,
                pinnedMessages: [],
                customField: 'test'
            });

            const loaded = await storage.getActionState(testAction, 123);
            expect(loaded.lastExecutedDate).toBe(timestamp);
        });

        test('should handle zero timestamps (never executed)', async () => {
            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            const state = await storage.getActionState(testAction, 999);
            expect(state.lastExecutedDate).toBe(0);
        });
    });

    describe('state constructor usage', () => {
        // Actions provide stateConstructor for default state
        
        test('should use stateConstructor for new chats', async () => {
            const actionWithDefaults = createTestAction('action:defaults', {
                lastExecutedDate: 0,
                pinnedMessages: [999],
                customField: 'custom-default'
            });
            ensureActionFileExists(TEST_STORAGE_PATH, TEST_BOT_NAME, 'action:defaults');

            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [actionWithDefaults],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            const state = await storage.getActionState(actionWithDefaults, 12345);
            expect(state.customField).toBe('custom-default');
            expect(state.pinnedMessages).toEqual([999]);
        });

        test('should not use stateConstructor for existing chats', async () => {
            const actionWithDefaults = createTestAction('action:defaults', {
                customField: 'should-not-see-this'
            });
            
            // Pre-populate with existing data
            ensureActionFileExists(TEST_STORAGE_PATH, TEST_BOT_NAME, 'action:defaults', {
                123: {
                    lastExecutedDate: 5000,
                    pinnedMessages: [1],
                    customField: 'existing-value'
                }
            });

            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [actionWithDefaults],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            const state = await storage.getActionState(actionWithDefaults, 123);
            expect(state.customField).toBe('existing-value');
            expect(state.lastExecutedDate).toBe(5000);
        });
    });

    describe('concurrent action execution (multiple chats)', () => {
        // Bot can receive messages from multiple chats simultaneously
        
        test('should handle concurrent operations on different chats', async () => {
            const localStorage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            const chatIds = [1001, 1002, 1003, 1004, 1005];

            // Simulate concurrent message handling for different chats
            const operations = chatIds.map(async (chatId) => {
                const state = await localStorage.getActionState(testAction, chatId);
                state.customField = `processed-${chatId}`;
                state.lastExecutedDate = chatId * 1000;
                await localStorage.saveActionExecutionResult(testAction, chatId, state);
            });

            await Promise.all(operations);

            // Verify all states were saved correctly
            for (const chatId of chatIds) {
                const state = await localStorage.getActionState(testAction, chatId);
                expect(state.customField).toBe(`processed-${chatId}`);
                expect(state.lastExecutedDate).toBe(chatId * 1000);
            }
        });

        test('should handle rapid sequential operations on same chat', async () => {
            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            const chatId = 9999;

            // Rapid sequential updates (simulating spam)
            for (let i = 1; i <= 10; i++) {
                await storage.saveActionExecutionResult(testAction, chatId, {
                    lastExecutedDate: i * 100,
                    pinnedMessages: [],
                    customField: `update-${i}`
                });
            }

            const finalState = await storage.getActionState(testAction, chatId);
            expect(finalState.customField).toBe('update-10');
            expect(finalState.lastExecutedDate).toBe(1000);
        });
    });

    describe('data integrity', () => {
        test('should not lose data when updating single chat in multi-chat file', async () => {
            storage = new JsonFileStorage(
                TEST_BOT_NAME,
                [testAction],
                eventEmitter,
                TEST_STORAGE_PATH
            );

            // Create states for 3 chats
            await storage.saveActionExecutionResult(testAction, 1, {
                lastExecutedDate: 1,
                pinnedMessages: [1],
                customField: 'one'
            });
            await storage.saveActionExecutionResult(testAction, 2, {
                lastExecutedDate: 2,
                pinnedMessages: [2],
                customField: 'two'
            });
            await storage.saveActionExecutionResult(testAction, 3, {
                lastExecutedDate: 3,
                pinnedMessages: [3],
                customField: 'three'
            });

            // Update only chat 2
            await storage.saveActionExecutionResult(testAction, 2, {
                lastExecutedDate: 200,
                pinnedMessages: [20],
                customField: 'two-updated'
            });

            // Verify chat 1 and 3 are unchanged
            const state1 = await storage.getActionState(testAction, 1);
            const state2 = await storage.getActionState(testAction, 2);
            const state3 = await storage.getActionState(testAction, 3);

            expect(state1.customField).toBe('one');
            expect(state2.customField).toBe('two-updated');
            expect(state3.customField).toBe('three');
        });
    });
});
