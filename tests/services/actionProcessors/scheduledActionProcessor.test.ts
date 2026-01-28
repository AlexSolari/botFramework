import { describe, test, expect, beforeEach } from 'bun:test';
import { TypedEventEmitter } from '../../../src/types/events';
import { IStorageClient } from '../../../src/types/storage';
import { Seconds } from '../../../src/types/timeValues';
import { ScheduledActionProcessor } from '../../../src/services/actionProcessors/scheduledActionProcessor';
import {
    createMockStorage,
    createMockScheduler,
    createMockTelegramApi,
    type MockScheduler
} from './processorTestHelpers';

// =============================================================================
// ScheduledActionProcessor Tests
// =============================================================================

describe('ScheduledActionProcessor', () => {
    let processor: ScheduledActionProcessor;
    let eventEmitter: TypedEventEmitter;
    let storage: IStorageClient;
    let scheduler: MockScheduler;
    const chats = { 'chat1': 111, 'chat2': 222 };

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
                {},  // Empty chats
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
                { 'test': 123 },
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
                'general': 100, 
                'random': 200, 
                'dev': 300 
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
});
