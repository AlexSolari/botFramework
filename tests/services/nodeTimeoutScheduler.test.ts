import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { NodeTimeoutScheduler } from '../../src/services/nodeTimeoutScheduler';
import { BotEventType, TypedEventEmitter } from '../../src/types/events';
import { Milliseconds } from '../../src/types/timeValues';

describe('NodeTimeoutScheduler', () => {
    let scheduler: NodeTimeoutScheduler;
    let eventEmitter: TypedEventEmitter;

    beforeEach(() => {
        eventEmitter = new TypedEventEmitter();
        scheduler = new NodeTimeoutScheduler(eventEmitter);
    });

    afterEach(() => {
        scheduler.stopAll();
    });

    describe('constructor', () => {
        test('should initialize with empty activeTasks array', () => {
            expect(scheduler.activeTasks).toEqual([]);
        });

        test('should store eventEmitter reference', () => {
            expect(scheduler.eventEmitter).toBe(eventEmitter);
        });
    });

    describe('createTask', () => {
        test('should add task to activeTasks', () => {
            scheduler.createTask(
                'test-task',
                () => {},
                1000 as Milliseconds,
                false,
                'test-bot'
            );

            expect(scheduler.activeTasks.length).toBe(1);
            expect(scheduler.activeTasks[0].name).toBe('test-task');
            expect(scheduler.activeTasks[0].interval).toBe(1000 as Milliseconds);
        });

        test('should emit taskCreated event', () => {
            const createdEvents: unknown[] = [];
            eventEmitter.on(BotEventType.taskCreated, (_timestamp, data) => {
                createdEvents.push(data);
            });

            scheduler.createTask(
                'my-task',
                () => {},
                500 as Milliseconds,
                false,
                'owner-bot'
            );

            expect(createdEvents.length).toBe(1);
            expect(createdEvents[0]).toEqual({
                name: 'my-task',
                ownerName: 'owner-bot',
                interval: 500
            });
        });

        test('should execute action immediately when executeRightAway is true', async () => {
            let executed = false;

            scheduler.createTask(
                'immediate-task',
                () => { executed = true; },
                10000 as Milliseconds, // Long interval so it won't re-trigger
                true,
                'test-bot'
            );

            // Wait for setImmediate to execute
            await new Promise(resolve => setImmediate(resolve));

            expect(executed).toBe(true);
        });

        test('should not execute immediately when executeRightAway is false', async () => {
            let executed = false;

            scheduler.createTask(
                'delayed-task',
                () => { executed = true; },
                10000 as Milliseconds,
                false,
                'test-bot'
            );

            // Wait a tick
            await new Promise(resolve => setImmediate(resolve));

            expect(executed).toBe(false);
        });

        test('should execute action on interval', async () => {
            let executionCount = 0;

            scheduler.createTask(
                'interval-task',
                () => { executionCount++; },
                50 as Milliseconds,
                false,
                'test-bot'
            );

            // Wait for 2-3 intervals
            await new Promise(resolve => setTimeout(resolve, 130));

            expect(executionCount).toBeGreaterThanOrEqual(2);
        });

        test('should emit taskRun event on each interval execution', async () => {
            const runEvents: unknown[] = [];
            eventEmitter.on(BotEventType.taskRun, (_timestamp, data) => {
                runEvents.push(data);
            });

            scheduler.createTask(
                'run-event-task',
                () => {},
                50 as Milliseconds,
                false,
                'test-bot'
            );

            await new Promise(resolve => setTimeout(resolve, 130));

            expect(runEvents.length).toBeGreaterThanOrEqual(2);
            expect(runEvents[0]).toEqual({
                name: 'run-event-task',
                ownerName: 'test-bot',
                interval: 50
            });
        });

        test('should create multiple independent tasks', () => {
            scheduler.createTask('task-1', () => {}, 100 as Milliseconds, false, 'bot');
            scheduler.createTask('task-2', () => {}, 200 as Milliseconds, false, 'bot');
            scheduler.createTask('task-3', () => {}, 300 as Milliseconds, false, 'bot');

            expect(scheduler.activeTasks.length).toBe(3);
            expect(scheduler.activeTasks.map(t => t.name)).toEqual(['task-1', 'task-2', 'task-3']);
        });
    });

    describe('createOnetimeTask', () => {
        test('should emit taskCreated event with delay', () => {
            const createdEvents: unknown[] = [];
            eventEmitter.on(BotEventType.taskCreated, (_timestamp, data) => {
                createdEvents.push(data);
            });

            scheduler.createOnetimeTask(
                'onetime-task',
                () => {},
                100 as Milliseconds,
                'test-bot'
            );

            expect(createdEvents.length).toBe(1);
            expect(createdEvents[0]).toEqual({
                name: 'onetime-task',
                ownerName: 'test-bot',
                delay: 100
            });
        });

        test('should execute action after delay', async () => {
            let executed = false;

            scheduler.createOnetimeTask(
                'delayed-onetime',
                () => { executed = true; },
                50 as Milliseconds,
                'test-bot'
            );

            expect(executed).toBe(false);

            await new Promise(resolve => setTimeout(resolve, 80));

            expect(executed).toBe(true);
        });

        test('should emit taskRun event when executed', async () => {
            const runEvents: unknown[] = [];
            eventEmitter.on(BotEventType.taskRun, (_timestamp, data) => {
                runEvents.push(data);
            });

            scheduler.createOnetimeTask(
                'run-once',
                () => {},
                50 as Milliseconds,
                'test-bot'
            );

            await new Promise(resolve => setTimeout(resolve, 80));

            expect(runEvents.length).toBe(1);
            expect(runEvents[0]).toEqual({
                name: 'run-once',
                ownerName: 'test-bot',
                delay: 50
            });
        });

        test('should not add to activeTasks (one-time tasks are not tracked)', () => {
            scheduler.createOnetimeTask(
                'not-tracked',
                () => {},
                100 as Milliseconds,
                'test-bot'
            );

            // One-time tasks are not added to activeTasks
            expect(scheduler.activeTasks.length).toBe(0);
        });

        test('should only execute once', async () => {
            let executionCount = 0;

            scheduler.createOnetimeTask(
                'execute-once',
                () => { executionCount++; },
                30 as Milliseconds,
                'test-bot'
            );

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(executionCount).toBe(1);
        });
    });

    describe('stopAll', () => {
        test('should clear all active interval tasks', async () => {
            let task1Count = 0;
            let task2Count = 0;

            scheduler.createTask('task-1', () => { task1Count++; }, 30 as Milliseconds, false, 'bot');
            scheduler.createTask('task-2', () => { task2Count++; }, 30 as Milliseconds, false, 'bot');

            // Let them run a bit
            await new Promise(resolve => setTimeout(resolve, 50));

            const countBeforeStop1 = task1Count;
            const countBeforeStop2 = task2Count;

            scheduler.stopAll();

            // Wait more time
            await new Promise(resolve => setTimeout(resolve, 100));

            // Counts should not have increased after stop
            expect(task1Count).toBe(countBeforeStop1);
            expect(task2Count).toBe(countBeforeStop2);
        });

        test('should handle being called with no tasks', () => {
            expect(() => { scheduler.stopAll(); }).not.toThrow();
        });

        test('should handle being called multiple times', () => {
            scheduler.createTask('task', () => { /* no-op */ }, 100 as Milliseconds, false, 'bot');

            expect(() => {
                scheduler.stopAll();
                scheduler.stopAll();
            }).not.toThrow();
        });
    });

    describe('IScheduler interface compliance', () => {
        test('should implement stopAll method', () => {
            expect(typeof scheduler.stopAll).toBe('function');
        });

        test('should implement createTask method', () => {
            expect(typeof scheduler.createTask).toBe('function');
        });

        test('should implement createOnetimeTask method', () => {
            expect(typeof scheduler.createOnetimeTask).toBe('function');
        });
    });

    describe('real-world usage patterns', () => {
        // Pattern: ScheduledActionProcessor creates recurring task for scheduled actions
        test('should support scheduled action processor pattern', async () => {
            const executions: string[] = [];

            // Initial one-time task to align to hour boundary (simulated)
            scheduler.createOnetimeTask(
                'ScheduledProcessing_OneTime',
                () => {
                    // Then create recurring task
                    scheduler.createTask(
                        'ScheduledProcessing',
                        () => { executions.push('scheduled-run'); },
                        50 as Milliseconds,
                        true, // Execute right away
                        'test-bot'
                    );
                },
                20 as Milliseconds,
                'test-bot'
            );

            await new Promise(resolve => setTimeout(resolve, 150));

            // Should have the recurring task in activeTasks
            expect(scheduler.activeTasks.some(t => t.name === 'ScheduledProcessing')).toBe(true);
            // Should have executed multiple times
            expect(executions.length).toBeGreaterThanOrEqual(2);
        });

        // Pattern: BotInstance uses scheduler and stops on shutdown
        test('should support bot shutdown pattern', async () => {
            let runCount = 0;

            scheduler.createTask(
                'ScheduledProcessing',
                () => { runCount++; },
                30 as Milliseconds,
                false,
                'test-bot'
            );

            await new Promise(resolve => setTimeout(resolve, 50));
            const countBeforeShutdown = runCount;

            // Simulate bot shutdown
            scheduler.stopAll();

            await new Promise(resolve => setTimeout(resolve, 100));

            // No more executions after stop
            expect(runCount).toBe(countBeforeShutdown);
        });
    });
});
