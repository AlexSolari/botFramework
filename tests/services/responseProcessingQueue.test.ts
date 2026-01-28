import { describe, test, expect, beforeEach } from 'bun:test';
import { ResponseProcessingQueue, QueueItem } from '../../src/services/responseProcessingQueue';

// Helper for creating simple void callbacks
const noopCallback = () => Promise.resolve();

describe('ResponseProcessingQueue', () => {
    let queue: ResponseProcessingQueue;

    beforeEach(() => {
        queue = new ResponseProcessingQueue();
    });

    describe('constructor', () => {
        test('should initialize with empty items array', () => {
            expect(queue.items).toEqual([]);
        });

        test('should initialize with isFlushing as false', () => {
            expect(queue.isFlushing).toBe(false);
        });

        test('should have rateLimiter defined', () => {
            expect(queue.rateLimiter).toBeDefined();
        });
    });

    describe('enqueue', () => {
        test('should add item to empty queue', () => {
            const item: QueueItem = {
                priority: 100,
                callback: noopCallback
            };

            queue.enqueue(item);

            expect(queue.items.length).toBe(1);
            expect(queue.items[0]).toBe(item);
        });

        test('should maintain priority order (lower priority first)', () => {
            queue.enqueue({ priority: 300, callback: noopCallback });
            queue.enqueue({ priority: 100, callback: noopCallback });
            queue.enqueue({ priority: 200, callback: noopCallback });

            expect(queue.items.map(i => i.priority)).toEqual([100, 200, 300]);
        });

        test('should append item with equal priority to end', () => {
            queue.enqueue({ priority: 100, callback: noopCallback });
            queue.enqueue({ priority: 100, callback: noopCallback });
            queue.enqueue({ priority: 100, callback: noopCallback });

            expect(queue.items.length).toBe(3);
            expect(queue.items.every(i => i.priority === 100)).toBe(true);
        });

        test('should insert at correct position for mixed priorities', () => {
            queue.enqueue({ priority: 100, callback: noopCallback });
            queue.enqueue({ priority: 300, callback: noopCallback });
            queue.enqueue({ priority: 200, callback: noopCallback });
            queue.enqueue({ priority: 150, callback: noopCallback });
            queue.enqueue({ priority: 250, callback: noopCallback });

            expect(queue.items.map(i => i.priority)).toEqual([100, 150, 200, 250, 300]);
        });

        test('should handle inserting lowest priority item', () => {
            queue.enqueue({ priority: 200, callback: noopCallback });
            queue.enqueue({ priority: 300, callback: noopCallback });
            queue.enqueue({ priority: 100, callback: noopCallback }); // Lowest

            expect(queue.items.map(i => i.priority)).toEqual([100, 200, 300]);
        });

        test('should handle inserting highest priority item', () => {
            queue.enqueue({ priority: 100, callback: noopCallback });
            queue.enqueue({ priority: 200, callback: noopCallback });
            queue.enqueue({ priority: 300, callback: noopCallback }); // Highest, appended

            expect(queue.items.map(i => i.priority)).toEqual([100, 200, 300]);
        });
    });

    describe('flushReadyItems', () => {
        test('should process items with priority <= current time', async () => {
            const processed: number[] = [];
            const now = Date.now();

            queue.enqueue({
                priority: now - 100, // Past - should process
                callback: () => { processed.push(1); return Promise.resolve(); }
            });
            queue.enqueue({
                priority: now - 50, // Past - should process
                callback: () => { processed.push(2); return Promise.resolve(); }
            });

            await queue.flushReadyItems();

            expect(processed).toEqual([1, 2]);
            expect(queue.items.length).toBe(0);
        });

        test('should set isFlushing during processing', async () => {
            const now = Date.now();
            let wasFlushing = false;

            queue.enqueue({
                priority: now - 100,
                callback: () => {
                    wasFlushing = queue.isFlushing;
                    return Promise.resolve();
                }
            });

            await queue.flushReadyItems();

            expect(wasFlushing).toBe(true);
            expect(queue.isFlushing).toBe(false); // Reset after
        });

        test('should not start new flush if already flushing', async () => {
            const processed: number[] = [];
            const now = Date.now();

            queue.enqueue({
                priority: now - 100,
                callback: async () => {
                    processed.push(1);
                    // Try to start another flush while this one is running
                    await queue.flushReadyItems(); // Should return immediately
                    processed.push(2);
                }
            });

            await queue.flushReadyItems();

            expect(processed).toEqual([1, 2]);
        });

        test('should process items in priority order', async () => {
            const processed: number[] = [];
            const now = Date.now();

            queue.enqueue({
                priority: now - 50,
                callback: () => { processed.push(2); return Promise.resolve(); }
            });
            queue.enqueue({
                priority: now - 100,
                callback: () => { processed.push(1); return Promise.resolve(); }
            });
            queue.enqueue({
                priority: now - 25,
                callback: () => { processed.push(3); return Promise.resolve(); }
            });

            await queue.flushReadyItems();

            expect(processed).toEqual([1, 2, 3]);
        });

        test('should handle empty queue', async () => {
            await queue.flushReadyItems();
            expect(queue.isFlushing).toBe(false);
        });

        test('should handle callback errors gracefully', async () => {
            const now = Date.now();
            const processed: number[] = [];

            queue.enqueue({
                priority: now - 100,
                callback: () => { processed.push(1); return Promise.resolve(); }
            });
            queue.enqueue({
                priority: now - 50,
                callback: () => Promise.reject(new Error('Test error'))
            });
            queue.enqueue({
                priority: now - 25,
                callback: () => { processed.push(3); return Promise.resolve(); }
            });

            // The queue processes and removes items but error propagates
            // In real usage, errors are caught in TelegramApiService
            try {
                await queue.flushReadyItems();
            } catch {
                // Expected
            }

            expect(processed.includes(1)).toBe(true);
        });
    });

    describe('priority as timestamp pattern', () => {
        // In TelegramApiService, priority = response.createdAt + offset
        // This pattern ensures responses are sent in order with delays
        
        test('should handle timestamp-based priorities', async () => {
            const processed: string[] = [];
            const baseTime = Date.now() - 100;

            // Simulate responses with offsets (delays)
            queue.enqueue({
                priority: baseTime, // First response
                callback: () => { processed.push('first'); return Promise.resolve(); }
            });
            queue.enqueue({
                priority: baseTime + 10, // Second response, 10ms delay
                callback: () => { processed.push('second'); return Promise.resolve(); }
            });
            queue.enqueue({
                priority: baseTime + 20, // Third response, 20ms delay
                callback: () => { processed.push('third'); return Promise.resolve(); }
            });

            await queue.flushReadyItems();

            expect(processed).toEqual(['first', 'second', 'third']);
        });

        test('should respect rate limiting between items', async () => {
            const timestamps: number[] = [];
            const now = Date.now();

            queue.enqueue({
                priority: now - 100,
                callback: () => { timestamps.push(Date.now()); return Promise.resolve(); }
            });
            queue.enqueue({
                priority: now - 50,
                callback: () => { timestamps.push(Date.now()); return Promise.resolve(); }
            });
            queue.enqueue({
                priority: now - 25,
                callback: () => { timestamps.push(Date.now()); return Promise.resolve(); }
            });

            await queue.flushReadyItems();

            // Rate limiter should add delay between items
            // TELEGRAM_RATELIMIT_DELAY is 35ms
            if (timestamps.length >= 2) {
                const gap = timestamps[1] - timestamps[0];
                expect(gap).toBeGreaterThanOrEqual(30); // Allow some tolerance
            }
        });
    });

    describe('concurrent enqueue and flush', () => {
        test('should handle items added during flush', async () => {
            const processed: number[] = [];
            const now = Date.now();

            queue.enqueue({
                priority: now - 100,
                callback: () => {
                    processed.push(1);
                    // Add new item during processing
                    queue.enqueue({
                        priority: now - 50,
                        callback: () => { processed.push(2); return Promise.resolve(); }
                    });
                    return Promise.resolve();
                }
            });

            await queue.flushReadyItems();

            // Item added during flush should also be processed
            expect(processed).toEqual([1, 2]);
        });
    });

    describe('TelegramApiService usage pattern', () => {
        // TelegramApiService enqueues responses with createdAt + offset as priority
        
        test('should support batched responses with delays', async () => {
            const sentMessages: string[] = [];
            const baseCreatedAt = Date.now() - 200;

            // Simulate enqueueBatchedResponses behavior
            type TestResponse = 
                | { text: string; createdAt: number }
                | { text: string; delay: number };

            const responses: TestResponse[] = [
                { text: 'msg1', createdAt: baseCreatedAt },
                { text: 'delay', delay: 50 }, // Delay response
                { text: 'msg2', createdAt: baseCreatedAt },
            ];

            let offset = 0;
            for (const response of responses) {
                if ('delay' in response) {
                    offset += response.delay;
                    continue;
                }

                const text = response.text;
                queue.enqueue({
                    priority: response.createdAt + offset,
                    callback: () => { sentMessages.push(text); return Promise.resolve(); }
                });
            }

            await queue.flushReadyItems();

            expect(sentMessages).toEqual(['msg1', 'msg2']);
        });

        test('should handle high volume of items', async () => {
            const now = Date.now();
            const itemCount = 100;
            let processedCount = 0;

            for (let i = 0; i < itemCount; i++) {
                queue.enqueue({
                    priority: now - (itemCount - i),
                    callback: () => { processedCount++; return Promise.resolve(); }
                });
            }

            expect(queue.items.length).toBe(itemCount);

            await queue.flushReadyItems();

            expect(processedCount).toBe(itemCount);
            expect(queue.items.length).toBe(0);
        });
    });
});
