import { describe, test, expect } from 'bun:test';
import { TypedEventEmitter, BotEventType } from '../../src/types/events';
import { TraceId } from '../../src/types/trace';

describe('TypedEventEmitter', () => {
    describe('onEach', () => {
        test('should receive all emitted events', () => {
            const emitter = new TypedEventEmitter();
            const received: Array<{ event: string; data: unknown }> = [];

            emitter.onEach((event, _ts, data) => {
                received.push({ event, data });
            });

            emitter.emit(BotEventType.error, {
                error: new Error('test error'),
                traceId: 'trace:1' as TraceId
            });

            expect(received.length).toBe(1);
            expect(received[0].event).toBe(BotEventType.error);
        });

        test('should receive multiple different events', () => {
            const emitter = new TypedEventEmitter();
            const receivedEvents: string[] = [];

            emitter.onEach((event) => {
                receivedEvents.push(event);
            });

            emitter.emit(BotEventType.scheduledProcessingStarted, {
                botName: 'test-bot',
                traceId: 'trace:1' as TraceId
            });
            emitter.emit(BotEventType.scheduledProcessingFinished, {
                botName: 'test-bot',
                traceId: 'trace:1' as TraceId
            });

            expect(receivedEvents.length).toBe(2);
            expect(receivedEvents[0]).toBe(
                BotEventType.scheduledProcessingStarted
            );
            expect(receivedEvents[1]).toBe(
                BotEventType.scheduledProcessingFinished
            );
        });

        test('should receive events in addition to specific listeners', () => {
            const emitter = new TypedEventEmitter();
            const specificReceived: unknown[] = [];
            const allReceived: unknown[] = [];

            emitter.on(BotEventType.error, (_ts, data) => {
                specificReceived.push(data);
            });
            emitter.onEach((_event, _ts, data) => {
                allReceived.push(data);
            });

            emitter.emit(BotEventType.error, {
                error: new Error('test'),
                traceId: 'trace:1' as TraceId
            });

            expect(specificReceived.length).toBe(1);
            expect(allReceived.length).toBe(1);
        });
    });

    describe('events', () => {
        test('should return registered event keys', () => {
            const emitter = new TypedEventEmitter();

            emitter.on(BotEventType.error, () => {});
            emitter.on(BotEventType.scheduledProcessingStarted, () => {});

            // Emit events to trigger the handlers and cover their function bodies
            emitter.emit(BotEventType.error, {
                error: new Error('test'),
                traceId: 'trace:1' as TraceId
            });
            emitter.emit(BotEventType.scheduledProcessingStarted, {
                botName: 'test-bot',
                traceId: 'trace:1' as TraceId
            });

            const events = emitter.events();

            expect(events).toContain(BotEventType.error);
            expect(events).toContain(BotEventType.scheduledProcessingStarted);
        });

        test('should return empty array when no listeners registered', () => {
            const emitter = new TypedEventEmitter();

            const events = emitter.events();

            expect(Array.isArray(events)).toBe(true);
            expect(events.length).toBe(0);
        });

        test('should return wildcard key after onEach registration', () => {
            const emitter = new TypedEventEmitter();

            emitter.onEach(() => {});

            // Emit an event to trigger the onEach handler
            emitter.emit(BotEventType.error, {
                error: new Error('test'),
                traceId: 'trace:1' as TraceId
            });

            const events = emitter.events();

            expect(events).toContain('*');
        });
    });
});
