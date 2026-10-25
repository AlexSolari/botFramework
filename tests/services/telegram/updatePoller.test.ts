import {
    describe,
    test,
    expect,
    mock,
    spyOn,
    beforeEach,
    afterEach,
    jest
} from 'bun:test';
import {
    BotApiClient,
    BotApiCallOptions,
    TelegramApiError,
    freshConnectionWindow
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
    options: BotApiCallOptions;
}

type ScriptedResult = Update[] | Error;

/**
 * Fake client: `getUpdates` answers from the script, then hangs until aborted,
 * like a long poll with no new updates.
 */
function createFakeClient(
    script: ScriptedResult[] = [],
    deleteWebhookErrors: Error[] = []
) {
    const calls: RecordedCall[] = [];
    const freshConnections = { requested: 0 };
    let idleListeners: (() => void)[] = [];
    const nextIdle = () =>
        new Promise<void>((resolve) => {
            idleListeners.push(resolve);
        });
    const idle = nextIdle();

    const client = {
        call: (
            method: string,
            params: Record<string, unknown>,
            options: BotApiCallOptions = {}
        ) => {
            calls.push({ method, params, options });
            const webhookError = method == 'deleteWebhook' && deleteWebhookErrors.shift();
            if (webhookError) return Promise.reject(webhookError);
            if (method != 'getUpdates' || params.timeout === 0) {
                return Promise.resolve(true);
            }

            const next = script.shift();
            if (next instanceof Error) return Promise.reject(next);
            if (next) return Promise.resolve(next);

            const signal = options.signal;
            if (!signal) {
                throw new Error('getUpdates called without signal');
            }
            for (const listener of idleListeners) listener();
            idleListeners = [];
            return new Promise((_, reject) => {
                signal.addEventListener('abort', () => {
                    reject(signal.reason as Error);
                });
            });
        },
        useFreshConnections: () => {
            freshConnections.requested++;
        }
    };

    return {
        client: client as unknown as BotApiClient,
        calls,
        /** How many times fresh connections were requested. */
        freshConnections,
        /** Resolves once the script is exhausted and the poller waits for new updates. */
        idle,
        /** Resolves the next time the poller waits for new updates. */
        nextIdle
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

/** Fires timers until the promise settles, so retry delays and timeouts pass at once. */
async function runTimersUntil<T>(promise: Promise<T>) {
    let settled = false;
    const result = promise.finally(() => {
        settled = true;
    });
    for (let i = 0; !settled; i++) {
        if (i > 10_000) throw new Error('Promise did not settle');
        jest.runOnlyPendingTimers();
        await Promise.resolve();
    }

    return await result;
}

describe('UpdatePoller', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        mock.restore();
    });

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
        expect(calls[1]).toMatchObject({
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

        expect(calls.at(-1)).toMatchObject({
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
        await runTimersUntil(idle);
        poller.stop();
        await running;

        expect(errors).toEqual(['network failure']);
        expect(
            calls.filter((x) => x.method == 'getUpdates').length
        ).toBe(2);
    });

    test('should keep retrying recoverable errors after the delay list is exhausted', async () => {
        const failures = Array.from(
            { length: 8 },
            (_, i) => new Error(`failure ${i + 1}`)
        );
        const { client, calls, idle } = createFakeClient([...failures]);
        const errors: Error[] = [];
        const poller = new UpdatePoller(client, (error) => {
            errors.push(error);
        });
        poller.on('message', () => undefined);

        const running = poller.start();
        await runTimersUntil(idle);
        poller.stop();
        await running;

        expect(errors).toEqual(failures);
        expect(
            calls.filter((x) => x.method == 'getUpdates').length
        ).toBe(9);
    });

    test('should recover when fatal error goes away before retries are exhausted', async () => {
        const { client, idle } = createFakeClient([
            conflictError(),
            [{ update_id: 1, message: message(1) }]
        ]);
        const errors: Error[] = [];
        const received: number[] = [];
        const poller = new UpdatePoller(client, (error) => {
            errors.push(error);
        });
        poller.on('message', (x) => {
            received.push(x.message_id);
        });

        const running = poller.start();
        await runTimersUntil(idle);
        poller.stop();
        await running;

        expect(errors.length).toBe(1);
        expect(received).toEqual([1]);
    });

    test('should stop polling and report fatal errors once every retry failed', async () => {
        const { client, calls } = createFakeClient(
            Array.from({ length: 7 }, conflictError)
        );
        const errors: Error[] = [];
        const poller = new UpdatePoller(client, (error) => {
            errors.push(error);
        });
        poller.on('message', () => undefined);

        await runTimersUntil(poller.start());

        expect(errors.length).toBe(7);
        expect(errors.every((x) => x instanceof TelegramApiError)).toBe(true);
        expect(calls.map((x) => x.method)).toEqual([
            'deleteWebhook',
            ...Array<string>(7).fill('getUpdates')
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
            options?: BotApiCallOptions
        ) =>
            params.timeout === 0
                ? Promise.reject(new Error('sync failed'))
                : originalCall(method as never, params as never, options);
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

    test('should retry deleting the webhook, then start polling', async () => {
        const { client, calls, idle } = createFakeClient(
            [],
            [new Error('network failure')]
        );
        const errors: string[] = [];
        const poller = new UpdatePoller(client, (error) => {
            errors.push(error.message);
        });
        poller.on('message', () => undefined);

        const running = poller.start();
        await runTimersUntil(idle);
        poller.stop();
        await running;

        expect(errors).toEqual(['network failure']);
        expect(calls.map((x) => x.method)).toEqual([
            'deleteWebhook',
            'deleteWebhook',
            'getUpdates'
        ]);
    });

    test('should stop and report fatal webhook errors once every retry failed', async () => {
        const unauthorized = () =>
            new TelegramApiError('deleteWebhook', 401, 'Unauthorized');
        const { client, calls } = createFakeClient(
            [],
            Array.from({ length: 7 }, unauthorized)
        );
        const errors: Error[] = [];
        const poller = new UpdatePoller(client, (error) => {
            errors.push(error);
        });
        poller.on('message', () => undefined);

        await runTimersUntil(poller.start());

        expect(errors.length).toBe(7);
        expect(calls.map((x) => x.method)).toEqual(
            Array<string>(7).fill('deleteWebhook')
        );
    });

    test('should limit only the long poll to the long polling timeout', async () => {
        const { client, calls, idle } = createFakeClient([
            [{ update_id: 1, message: message(1) }]
        ]);
        const poller = new UpdatePoller(client, () => undefined);
        poller.on('message', () => undefined);

        const running = poller.start();
        await idle;
        poller.stop();
        await running;

        expect(calls.map((x) => x.options.timeout)).toEqual([
            undefined,
            60_000 as Milliseconds,
            60_000 as Milliseconds,
            undefined
        ]);
    });

    test('should drop a long poll that gets no answer in time and retry on a new connection', async () => {
        const longPolls: RequestInit[] = [];
        let onRetry: () => void = () => undefined;
        const retried = new Promise<void>((resolve) => {
            onRetry = resolve;
        });
        const fetchMock = (url: string, init: RequestInit) => {
            if (url.endsWith('/deleteWebhook')) {
                return Promise.resolve(Response.json({ ok: true, result: true }));
            }

            longPolls.push(init);
            if (longPolls.length == 2) onRetry();
            return new Promise((_, reject) => {
                init.signal?.addEventListener('abort', () => {
                    reject(init.signal?.reason as Error);
                });
            });
        };
        spyOn(globalThis, 'fetch').mockImplementation(
            fetchMock as unknown as typeof fetch
        );
        freshConnectionWindow.until = 0;
        freshConnectionWindow.failing = false;
        const client = new BotApiClient('TOKEN');
        const errors: Error[] = [];
        const poller = new UpdatePoller(client, (error) => {
            errors.push(error);
        });
        poller.on('message', () => undefined);

        const running = poller.start();
        await runTimersUntil(retried);
        poller.stop();
        await running;

        expect(errors[0].name).toBe('TimeoutError');
        expect(longPolls.map((x) => x.keepalive)).toEqual([undefined, false]);
    });

    test('should reconnect right away on a fresh connection without reporting an error', async () => {
        const { client, calls, freshConnections, idle, nextIdle } =
            createFakeClient([[{ update_id: 1, message: message(1) }]]);
        const errors: Error[] = [];
        const poller = new UpdatePoller(client, (error) => {
            errors.push(error);
        });
        poller.on('message', () => undefined);

        const running = poller.start();
        await idle;
        const reconnected = nextIdle();
        poller.reconnect();
        await reconnected;
        expect(freshConnections.requested).toBe(1);
        poller.stop();
        await running;

        expect(errors).toEqual([]);
        const getUpdates = calls.filter((x) => x.method == 'getUpdates');
        expect(getUpdates.map((x) => x.params.offset)).toEqual([0, 2, 2, 2]);
    });

    test('should skip the wait before a retry on reconnect', async () => {
        const { client, calls, freshConnections, idle } = createFakeClient([
            new Error('network failure')
        ]);
        let onFailure: () => void = () => undefined;
        const failed = new Promise<void>((resolve) => {
            onFailure = resolve;
        });
        const poller = new UpdatePoller(client, () => {
            onFailure();
        });
        poller.on('message', () => undefined);

        const running = poller.start();
        await failed;
        poller.reconnect();
        await idle;
        expect(freshConnections.requested).toBe(1);
        poller.stop();
        await running;

        expect(calls.filter((x) => x.method == 'getUpdates').length).toBe(2);
    });

    test('should ignore reconnect when not polling', () => {
        const { client } = createFakeClient();
        const poller = new UpdatePoller(client, () => undefined);

        expect(() => {
            poller.reconnect();
        }).not.toThrow();
    });

    test('should allow stop before start', () => {
        const { client } = createFakeClient();
        const poller = new UpdatePoller(client, () => undefined);

        expect(() => {
            poller.stop();
        }).not.toThrow();
    });
});
