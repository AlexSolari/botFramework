import { describe, test, expect } from 'bun:test';
import {
    BotApiClient,
    TelegramApiError
} from '../../../src/services/telegram/botApiClient';
import { UpdatePoller } from '../../../src/services/telegram/updatePoller';
import type {
    InlineQuery,
    Message,
    Update
} from '../../../src/types/botApi.generated';
import type { Milliseconds } from '../../../src/types/timeValues';

interface RecordedCall {
    method: string;
    params: Record<string, unknown>;
}

type ScriptedResult = Update[] | Error;

/**
 * Fake client: `getUpdates` answers from the script, then hangs until aborted,
 * like a long poll with no new updates.
 */
function createFakeClient(script: ScriptedResult[] = []) {
    const calls: RecordedCall[] = [];
    let onIdle: () => void = () => undefined;
    const idle = new Promise<void>((resolve) => {
        onIdle = resolve;
    });

    const client = {
        call: (
            method: string,
            params: Record<string, unknown>,
            signal?: AbortSignal
        ) => {
            calls.push({ method, params });
            if (method != 'getUpdates' || !signal) return Promise.resolve(true);

            const next = script.shift();
            if (next instanceof Error) return Promise.reject(next);
            if (next) return Promise.resolve(next);

            onIdle();
            return new Promise((_, reject) => {
                signal.addEventListener('abort', () => {
                    reject(new Error('aborted'));
                });
            });
        }
    };

    return {
        client: client as unknown as BotApiClient,
        calls,
        /** Resolves once the script is exhausted and the poller waits for new updates. */
        idle
    };
}

const message = (id: number) =>
    ({ message_id: id, date: 0, chat: { id: 1, type: 'private' } }) as Message;

const inlineQuery = (id: string) =>
    ({ id, query: 'q', offset: '', from: { id: 1 } }) as InlineQuery;

const conflictError = () =>
    new TelegramApiError(
        'getUpdates',
        409,
        'Conflict: terminated by other getUpdates request'
    );

describe('UpdatePoller', () => {
    test('should not poll when no handlers are registered', async () => {
        const { client, calls } = createFakeClient();
        const poller = new UpdatePoller(client, () => undefined);

        await poller.start();

        expect(calls.length).toBe(0);
    });

    test('should delete webhook, then poll only for handled update types', async () => {
        const { client, calls, idle } = createFakeClient();
        const poller = new UpdatePoller(client, () => undefined);
        poller.on('message', () => undefined);
        poller.on('inline_query', () => undefined);

        const running = poller.start();
        await idle;
        poller.stop();
        await running;

        expect(calls[0].method).toBe('deleteWebhook');
        expect(calls[1]).toEqual({
            method: 'getUpdates',
            params: {
                offset: 0,
                timeout: 50,
                allowed_updates: ['message', 'inline_query']
            }
        });
    });

    test('should dispatch payloads and advance offset', async () => {
        const { client, calls, idle } = createFakeClient([
            [
                { update_id: 10, message: message(1) },
                { update_id: 11, inline_query: inlineQuery('q1') }
            ],
            [{ update_id: 12, message: message(2) }]
        ]);
        const poller = new UpdatePoller(client, () => undefined);
        const messages: number[] = [];
        const queries: string[] = [];
        poller.on('message', (x) => {
            messages.push(x.message_id);
        });
        poller.on('inline_query', (x) => {
            queries.push(x.id);
        });

        const running = poller.start();
        await idle;
        poller.stop();
        await running;

        expect(messages).toEqual([1, 2]);
        expect(queries).toEqual(['q1']);

        const offsets = calls
            .filter((x) => x.method == 'getUpdates')
            .map((x) => x.params.offset);
        expect(offsets).toEqual([0, 12, 13, 13]);
    });

    test('should confirm the last offset on stop', async () => {
        const { client, calls, idle } = createFakeClient([
            [{ update_id: 5, message: message(1) }]
        ]);
        const poller = new UpdatePoller(client, () => undefined);
        poller.on('message', () => undefined);

        const running = poller.start();
        await idle;
        poller.stop();
        await running;

        expect(calls.at(-1)).toEqual({
            method: 'getUpdates',
            params: { offset: 6, limit: 1, timeout: 0 }
        });
    });

    test('should call every handler of the same type', async () => {
        const { client, idle } = createFakeClient([
            [{ update_id: 1, message: message(1) }]
        ]);
        const poller = new UpdatePoller(client, () => undefined);
        const received: string[] = [];
        poller.on('message', () => {
            received.push('first');
        });
        poller.on('message', () => {
            received.push('second');
        });

        const running = poller.start();
        await idle;
        poller.stop();
        await running;

        expect(received).toEqual(['first', 'second']);
    });

    test('should not wait for slow handlers before polling again', async () => {
        const { client, calls, idle } = createFakeClient([
            [{ update_id: 1, message: message(1) }]
        ]);
        const poller = new UpdatePoller(client, () => undefined);
        poller.on('message', () => new Promise<void>(() => undefined));

        const running = poller.start();
        await idle;

        expect(calls.filter((x) => x.method == 'getUpdates').length).toBe(2);
        poller.stop();
        await running;
    });

    test('should report handler errors and keep polling', async () => {
        const { client, idle } = createFakeClient([
            [
                { update_id: 1, message: message(1) },
                { update_id: 2, inline_query: inlineQuery('q') }
            ]
        ]);
        const errors: string[] = [];
        const poller = new UpdatePoller(client, (error) => {
            errors.push(error.message);
        });
        poller.on('message', () => {
            throw new Error('sync failure');
        });
        poller.on('inline_query', () => Promise.reject(new Error('async failure')));

        const running = poller.start();
        await idle;
        poller.stop();
        await running;

        expect(errors).toEqual(['sync failure', 'async failure']);
    });

    test('should wrap non-Error failures', async () => {
        const { client, idle } = createFakeClient([
            [{ update_id: 1, message: message(1) }]
        ]);
        const errors: string[] = [];
        const poller = new UpdatePoller(client, (error) => {
            errors.push(error.message);
        });
        poller.on('message', () => {
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw 'not an error';
        });

        const running = poller.start();
        await idle;
        poller.stop();
        await running;

        expect(errors).toEqual(['Unknown error']);
    });

    test('should retry after recoverable error once the delay passes', async () => {
        const { client, calls, idle } = createFakeClient([
            new Error('network failure')
        ]);
        const errors: string[] = [];
        const poller = new UpdatePoller(client, (error) => {
            errors.push(error.message);
        });
        poller.on('message', () => undefined);

        const running = poller.start();
        await idle;
        poller.stop();
        await running;

        expect(errors).toEqual(['network failure']);
        expect(
            calls.filter((x) => x.method == 'getUpdates').length
        ).toBe(2);
    });

    test('should keep retrying recoverable errors after the delay list is exhausted', async () => {
        const { client, calls, idle } = createFakeClient([
            new Error('failure 1'),
            new Error('failure 2'),
            new Error('failure 3')
        ]);
        const errors: string[] = [];
        const poller = new UpdatePoller(
            client,
            (error) => {
                errors.push(error.message);
            },
            [0 as Milliseconds]
        );
        poller.on('message', () => undefined);

        const running = poller.start();
        await idle;
        poller.stop();
        await running;

        expect(errors).toEqual(['failure 1', 'failure 2', 'failure 3']);
        expect(
            calls.filter((x) => x.method == 'getUpdates').length
        ).toBe(4);
    });

    test('should recover when fatal error goes away before retries are exhausted', async () => {
        const { client, idle } = createFakeClient([
            conflictError(),
            [{ update_id: 1, message: message(1) }]
        ]);
        const errors: Error[] = [];
        const received: number[] = [];
        const poller = new UpdatePoller(
            client,
            (error) => {
                errors.push(error);
            },
            [0 as Milliseconds, 0 as Milliseconds]
        );
        poller.on('message', (x) => {
            received.push(x.message_id);
        });

        const running = poller.start();
        await idle;
        poller.stop();
        await running;

        expect(errors.length).toBe(1);
        expect(received).toEqual([1]);
    });

    test('should stop polling and report fatal errors once every retry failed', async () => {
        const { client, calls } = createFakeClient([
            conflictError(),
            conflictError(),
            conflictError()
        ]);
        const errors: Error[] = [];
        const poller = new UpdatePoller(
            client,
            (error) => {
                errors.push(error);
            },
            [0 as Milliseconds, 0 as Milliseconds]
        );
        poller.on('message', () => undefined);

        await poller.start();

        expect(errors.length).toBe(3);
        expect(errors.every((x) => x instanceof TelegramApiError)).toBe(true);
        expect(calls.map((x) => x.method)).toEqual([
            'deleteWebhook',
            'getUpdates',
            'getUpdates',
            'getUpdates'
        ]);
    });

    test('should report failure of the final offset confirmation', async () => {
        const { client, idle } = createFakeClient([
            [{ update_id: 1, message: message(1) }]
        ]);
        const originalCall = client.call.bind(client);
        const errors: string[] = [];
        const poller = new UpdatePoller(client, (error) => {
            errors.push(error.message);
        });
        poller.on('message', () => undefined);

        const running = poller.start();
        await idle;
        (client as { call: unknown }).call = (
            method: string,
            params: Record<string, unknown>,
            signal?: AbortSignal
        ) =>
            signal
                ? originalCall(method as never, params as never, signal)
                : Promise.reject(new Error('sync failed'));
        poller.stop();
        await running;

        expect(errors).toEqual(['sync failed']);
    });

    test('should ignore start while already running', async () => {
        const { client, calls, idle } = createFakeClient();
        const poller = new UpdatePoller(client, () => undefined);
        poller.on('message', () => undefined);

        const running = poller.start();
        await poller.start();
        await idle;
        poller.stop();
        await running;

        expect(calls.filter((x) => x.method == 'deleteWebhook').length).toBe(1);
    });

    test('should allow stop before start', () => {
        const { client } = createFakeClient();
        const poller = new UpdatePoller(client, () => undefined);

        expect(() => {
            poller.stop();
        }).not.toThrow();
    });
});
