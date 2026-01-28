import { describe, test, expect, mock } from 'bun:test';
import { CachedStateFactory } from '../../src/entities/cachedStateFactory';
import { Hours } from '../../src/types/timeValues';

describe('CachedStateFactory', () => {
    describe('constructor', () => {
        test('should store the getValue function', () => {
            const factory = mock(() => Promise.resolve('test-value'));
            const timeout = 1 as Hours;

            const cached = new CachedStateFactory(factory, timeout);

            expect(cached.getValue).toBe(factory);
        });

        test('should store the invalidationTimeoutInHours', () => {
            const factory = mock(() => Promise.resolve('test-value'));
            const timeout = 24 as Hours;

            const cached = new CachedStateFactory(factory, timeout);

            expect(cached.invalidationTimeoutInHours).toBe(timeout);
        });
    });

    describe('getValue', () => {
        test('should call the provided factory function', async () => {
            const factory = mock(() => Promise.resolve('fetched-data'));
            const cached = new CachedStateFactory(factory, 1 as Hours);

            await cached.getValue();

            expect(factory).toHaveBeenCalledTimes(1);
        });

        test('should return the value from factory', async () => {
            const expectedData = { key: 'value', count: 42 };
            const factory = mock(() => Promise.resolve(expectedData));
            const cached = new CachedStateFactory(factory, 1 as Hours);

            const result = await cached.getValue();

            expect(result).toEqual(expectedData);
        });

        test('should return different values on multiple calls if factory returns different values', async () => {
            let callCount = 0;
            const factory = mock(() => Promise.resolve(`call-${++callCount}`));
            const cached = new CachedStateFactory(factory, 1 as Hours);

            const result1 = await cached.getValue();
            const result2 = await cached.getValue();

            expect(result1).toBe('call-1');
            expect(result2).toBe('call-2');
            expect(factory).toHaveBeenCalledTimes(2);
        });

        test('should propagate errors from factory', async () => {
            const factory = mock(() => Promise.reject(new Error('Factory error')));
            const cached = new CachedStateFactory(factory, 1 as Hours);

            let caught = false;
            try {
                await cached.getValue();
            } catch (error) {
                caught = true;
                expect((error as Error).message).toBe('Factory error');
            }
            expect(caught).toBe(true);
        });
    });

    describe('invalidationTimeoutInHours', () => {
        test('should be readonly', () => {
            const timeout = 12 as Hours;
            const cached = new CachedStateFactory(() => Promise.resolve(null), timeout);

            // TypeScript enforces readonly, but we can verify it exists
            expect(cached.invalidationTimeoutInHours).toBe(timeout);
        });

        test('should preserve Hours type value', () => {
            const timeout = 48 as Hours;
            const cached = new CachedStateFactory(() => Promise.resolve(null), timeout);

            expect(cached.invalidationTimeoutInHours).toBe(timeout);
        });
    });
});
