import { describe, test, expect } from 'bun:test';
import { TaskRecord } from '../../src/entities/taskRecord';
import { Milliseconds } from '../../src/types/timeValues';

function createMockTimeoutId(): NodeJS.Timeout {
    return setTimeout(() => {}, 0);
}

describe('TaskRecord', () => {
    describe('constructor', () => {
        test('should store name', () => {
            const taskId = createMockTimeoutId();
            const interval = 1000 as Milliseconds;
            const record = new TaskRecord('test-task', taskId, interval);

            expect(record.name).toBe('test-task');
            clearTimeout(taskId);
        });

        test('should store taskId', () => {
            const taskId = createMockTimeoutId();
            const interval = 1000 as Milliseconds;
            const record = new TaskRecord('test-task', taskId, interval);

            expect(record.taskId).toBe(taskId);
            clearTimeout(taskId);
        });

        test('should store interval', () => {
            const taskId = createMockTimeoutId();
            const interval = 5000 as Milliseconds;
            const record = new TaskRecord('test-task', taskId, interval);

            expect(record.interval).toBe(interval);
            clearTimeout(taskId);
        });
    });

    describe('properties', () => {
        test('should have readonly name', () => {
            const taskId = createMockTimeoutId();
            const interval = 1000 as Milliseconds;
            const record = new TaskRecord('readonly-task', taskId, interval);

            expect(record.name).toBe('readonly-task');
            clearTimeout(taskId);
        });

        test('should have readonly taskId', () => {
            const taskId = createMockTimeoutId();
            const interval = 1000 as Milliseconds;
            const record = new TaskRecord('test-task', taskId, interval);

            expect(record.taskId).toBe(taskId);
            clearTimeout(taskId);
        });

        test('should have readonly interval', () => {
            const taskId = createMockTimeoutId();
            const interval = 30000 as Milliseconds;
            const record = new TaskRecord('test-task', taskId, interval);

            expect(record.interval).toBe(interval);
            clearTimeout(taskId);
        });

        test('should preserve Milliseconds type value', () => {
            const taskId = createMockTimeoutId();
            const interval = 60000 as Milliseconds;
            const record = new TaskRecord('test-task', taskId, interval);

            expect(record.interval).toBe(interval);
            clearTimeout(taskId);
        });
    });

    describe('edge cases', () => {
        test('should handle empty name', () => {
            const taskId = createMockTimeoutId();
            const interval = 1000 as Milliseconds;
            const record = new TaskRecord('', taskId, interval);

            expect(record.name).toBe('');
            clearTimeout(taskId);
        });

        test('should handle zero interval', () => {
            const taskId = createMockTimeoutId();
            const interval = 0 as Milliseconds;
            const record = new TaskRecord('test-task', taskId, interval);

            expect(record.interval).toBe(interval);
            clearTimeout(taskId);
        });

        test('should handle very large interval', () => {
            const taskId = createMockTimeoutId();
            const largeInterval = 86400000 as Milliseconds; // 24 hours
            const record = new TaskRecord('test-task', taskId, largeInterval);

            expect(record.interval).toBe(largeInterval);
            clearTimeout(taskId);
        });
    });
});
