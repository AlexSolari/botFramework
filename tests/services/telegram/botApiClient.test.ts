import {
    describe,
    test,
    expect,
    mock,
    beforeAll,
    afterAll,
    afterEach,
    spyOn
} from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    BotApiClient,
    TelegramApiError,
    freshConnectionWindow
} from '../../../src/services/telegram/botApiClient';
import type { Milliseconds } from '../../../src/types/timeValues';

interface RecordedRequest {
    url: string;
    init: RequestInit;
}

type ScriptedResponse = (init: RequestInit) => Response | Promise<Response>;

/** Replaces the global fetch until the end of the test. */
function createFetch(...responses: ScriptedResponse[]) {
    const requests: RecordedRequest[] = [];
    spyOn(globalThis, 'fetch').mockImplementation(((
        url: string,
        init: RequestInit
    ) => {
        requests.push({ url, init });
        const next = responses.shift();
        if (!next) throw new Error('Unexpected request');
        return Promise.resolve(next(init));
    }) as typeof fetch);

    return { requests };
}

const json = (body: unknown, status = 200) => () =>
    new Response(JSON.stringify(body), { status });

const delayed =
    (delay: number, response: ScriptedResponse): ScriptedResponse =>
    async (init) => {
        await Bun.sleep(delay);
        return response(init);
    };

const networkError: ScriptedResponse = () =>
    Promise.reject(new TypeError('fetch failed'));

/** Request stuck on a dead connection: fails only once its signal is aborted. */
const noAnswer: ScriptedResponse = (init) =>
    new Promise((_, reject) => {
        const signal = init.signal;
        if (signal?.aborted) {
            reject(signal.reason as Error);
            return;
        }
        signal?.addEventListener('abort', () => {
            reject(signal.reason as Error);
        });
    });

const ok = json({ ok: true, result: true });

describe('BotApiClient', () => {
    afterEach(() => {
        mock.restore();
        freshConnectionWindow.until = 0;
        freshConnectionWindow.failing = false;
    });

    test('should POST JSON params to the method url and return the result', async () => {
        const { requests } = createFetch(
            json({ ok: true, result: { message_id: 42 } })
        );
        const client = new BotApiClient('TOKEN');

        const result = await client.call('sendMessage', {
            chat_id: 1,
            text: 'hello',
            reply_parameters: undefined
        });

        expect(result).toEqual({ message_id: 42 } as never);
        expect(requests[0].url).toBe(
            'https://api.telegram.org/botTOKEN/sendMessage'
        );
        expect(requests[0].init.method).toBe('POST');
        expect(requests[0].init.headers).toEqual({
            'Content-Type': 'application/json'
        });
        expect(JSON.parse(requests[0].init.body as string)).toEqual({
            chat_id: 1,
            text: 'hello'
        });
    });

    test('should throw TelegramApiError in "<code>: <description>" format', async () => {
        createFetch(
            json(
                {
                    ok: false,
                    error_code: 400,
                    description: 'Bad Request: QUOTE_TEXT_INVALID'
                },
                400
            )
        );
        const client = new BotApiClient('TOKEN');

        const error = await client
            .call('sendMessage', { chat_id: 1, text: 'x' })
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(TelegramApiError);
        const apiError = error as TelegramApiError;
        expect(apiError.message).toBe('400: Bad Request: QUOTE_TEXT_INVALID');
        expect(apiError.errorCode).toBe(400);
        expect(apiError.method).toBe('sendMessage');
        expect(apiError.retryAfter).toBeUndefined();
    });

    test('should fall back to HTTP status when error body is incomplete', async () => {
        createFetch(json({ ok: false }, 500));
        const client = new BotApiClient('TOKEN');

        const error = (await client
            .call('getMe', {})
            .catch((e: unknown) => e)) as TelegramApiError;

        expect(error.errorCode).toBe(500);
        expect(error.description).toBe('Unknown error');
    });

    test('should throw TelegramApiError on non-JSON response', async () => {
        createFetch(
            () =>
                new Response('<html>Bad Gateway</html>', {
                    status: 502,
                    statusText: 'Bad Gateway'
                })
        );
        const client = new BotApiClient('TOKEN');

        const error = (await client
            .call('getMe', {})
            .catch((e: unknown) => e)) as TelegramApiError;

        expect(error).toBeInstanceOf(TelegramApiError);
        expect(error.errorCode).toBe(502);
        expect(error.message).toBe('502: Unexpected response: Bad Gateway');
    });

    test('should retry once after flood control error', async () => {
        const floodError = json(
            {
                ok: false,
                error_code: 429,
                description: 'Too Many Requests: retry after 0',
                parameters: { retry_after: 0 }
            },
            429
        );
        const { requests } = createFetch(
            floodError,
            json({ ok: true, result: true })
        );
        const client = new BotApiClient('TOKEN');

        const result = await client.call('deleteMessage', {
            chat_id: 1,
            message_id: 2
        });

        expect(result).toBe(true);
        expect(requests.length).toBe(2);
    });

    test('should throw when flood control error repeats', async () => {
        const floodError = json(
            {
                ok: false,
                error_code: 429,
                description: 'Too Many Requests: retry after 0',
                parameters: { retry_after: 0 }
            },
            429
        );
        const { requests } = createFetch(floodError, floodError);
        const client = new BotApiClient('TOKEN');

        const error = (await client
            .call('getMe', {})
            .catch((e: unknown) => e)) as TelegramApiError;

        expect(error.errorCode).toBe(429);
        expect(error.retryAfter).toBe(0 as never);
        expect(requests.length).toBe(2);
    });

    test('should not retry other errors', async () => {
        const { requests } = createFetch(
            json({ ok: false, error_code: 403, description: 'Forbidden' }, 403)
        );
        const client = new BotApiClient('TOKEN');

        await client.call('getMe', {}).catch(() => undefined);

        expect(requests.length).toBe(1);
    });

    test('should abort the request when the signal is aborted', async () => {
        createFetch(noAnswer);
        const client = new BotApiClient('TOKEN');
        const controller = new AbortController();

        const result = client
            .call('getUpdates', {}, { signal: controller.signal })
            .catch((e: unknown) => e);
        controller.abort();

        expect(((await result) as Error).name).toBe('AbortError');
    });

    test('should drop a request that gets no answer in time', async () => {
        createFetch(noAnswer);
        const client = new BotApiClient('TOKEN');

        const timedOut = (await client
            .call('getMe', {}, { timeout: 10 as Milliseconds })
            .catch((e: unknown) => e)) as Error;

        expect(timedOut.name).toBe('TimeoutError');
    });

    test('should apply the timeout to each attempt separately', async () => {
        const floodError = json(
            {
                ok: false,
                error_code: 429,
                description: 'Too Many Requests: retry after 0',
                parameters: { retry_after: 0 }
            },
            429
        );
        createFetch(
            delayed(60, floodError),
            delayed(60, ok)
        );
        const client = new BotApiClient('TOKEN');

        expect(
            await client.call('getMe', {}, { timeout: 100 as Milliseconds })
        ).toBe(true as never);
    });

    describe('fresh connections', () => {
        test('should reuse pooled connections by default', async () => {
            const { requests } = createFetch(ok);
            const client = new BotApiClient('TOKEN');

            await client.call('getMe', {});

            expect(requests[0].init.keepalive).toBeUndefined();
        });

        test('should open new connections for a while when requested', async () => {
            const { requests } = createFetch(ok, ok, ok);
            const client = new BotApiClient('TOKEN');
            const now = spyOn(performance, 'now').mockReturnValue(1_000);

            client.useFreshConnections();
            await client.call('getMe', {});
            now.mockReturnValue(30_000);
            await client.call('getMe', {});
            now.mockReturnValue(32_000);
            await client.call('getMe', {});

            expect(requests.map((x) => x.init.keepalive)).toEqual([
                false,
                false,
                undefined
            ]);
        });

        test('should share the window between clients', async () => {
            const { requests } = createFetch(ok, ok);
            const first = new BotApiClient('TOKEN');
            const second = new BotApiClient('OTHER');

            first.useFreshConnections();
            await first.call('getMe', {});
            await second.call('getMe', {});

            expect(requests.map((x) => x.init.keepalive)).toEqual([
                false,
                false
            ]);
        });

        test('should open new connections after a network error', async () => {
            const { requests } = createFetch(networkError, ok);
            const client = new BotApiClient('TOKEN');

            await client.call('getMe', {}).catch(() => undefined);
            await client.call('getMe', {});

            expect(requests[1].init.keepalive).toBe(false);
        });

        test('should keep opening new connections after a network error until a request gets an answer', async () => {
            const { requests } = createFetch(
                networkError,
                networkError,
                ok,
                ok
            );
            const client = new BotApiClient('TOKEN');
            const now = spyOn(performance, 'now').mockReturnValue(1_000);

            await client.call('getMe', {}).catch(() => undefined);
            now.mockReturnValue(100_000);
            await client.call('getMe', {}).catch(() => undefined);
            now.mockReturnValue(200_000);
            await client.call('getMe', {});
            await client.call('getMe', {});

            expect(requests.map((x) => x.init.keepalive)).toEqual([
                undefined,
                false,
                false,
                undefined
            ]);
        });

        test('should open new connections after a timeout', async () => {
            const { requests } = createFetch(noAnswer, ok);
            const client = new BotApiClient('TOKEN');

            await client
                .call('getMe', {}, { timeout: 10 as Milliseconds })
                .catch(() => undefined);
            await client.call('getMe', {});

            expect(requests[1].init.keepalive).toBe(false);
        });

        test('should keep pooled connections after an API error or an abort by the caller', async () => {
            const { requests } = createFetch(
                json({ ok: false, error_code: 403, description: 'Forbidden' }, 403),
                noAnswer,
                ok
            );
            const client = new BotApiClient('TOKEN');
            const controller = new AbortController();

            await client.call('getMe', {}).catch(() => undefined);
            const aborted = client
                .call('getMe', {}, { signal: controller.signal })
                .catch(() => undefined);
            controller.abort();
            await aborted;
            await client.call('getMe', {});

            expect(requests[2].init.keepalive).toBeUndefined();
        });
    });

    describe('token redaction', () => {
        const token = '123456:SECRET-token';
        const url = `https://api.telegram.org/bot${token}/getMe`;

        const callAndCatch = async (error: unknown) => {
            createFetch(() => Promise.reject(error));
            const client = new BotApiClient(token);
            return await client.call('getMe', {}).then(
                () => undefined,
                (reason: unknown) => reason
            );
        };

        test('should remove token from network error details', async () => {
            const original = Object.assign(
                new Error(`request to ${url} failed`, {
                    cause: new Error(`connect failed for ${url}`)
                }),
                {
                    path: url,
                    code: 'ConnectionRefused',
                    errno: 111,
                    request: { url }
                }
            );
            original.name = 'FetchError';

            const error = (await callAndCatch(original)) as Error &
                Record<string, unknown>;

            expect(error).toBeInstanceOf(Error);
            expect(error.name).toBe('FetchError');
            expect(error.message).toBe(
                'request to https://api.telegram.org/bot[REDACTED]/getMe failed'
            );
            expect((error.cause as Error).message).not.toContain(token);
            expect(error.stack).not.toContain(token);
            expect(error.path).toBe(
                'https://api.telegram.org/bot[REDACTED]/getMe'
            );
            expect(error.code).toBe('ConnectionRefused');
            expect(error.errno).toBe(111);
            expect(error.request).toBeUndefined();
        });

        test('should remove url-encoded token', async () => {
            const encodedUrl = `https://api.telegram.org/bot${encodeURIComponent(token)}/getMe`;

            const error = (await callAndCatch(
                new Error(`request to ${encodedUrl} failed`)
            )) as Error;

            expect(error.message).toBe(
                'request to https://api.telegram.org/bot[REDACTED]/getMe failed'
            );
        });

        test('should remove token from thrown strings', async () => {
            expect(await callAndCatch(`failed: ${url}`)).toBe(
                'failed: https://api.telegram.org/bot[REDACTED]/getMe'
            );
        });

        test('should keep API errors as TelegramApiError', async () => {
            createFetch(
                json({ ok: false, error_code: 403, description: 'Forbidden' }, 403)
            );
            const client = new BotApiClient(token);

            await expect(client.call('getMe', {})).rejects.toBeInstanceOf(
                TelegramApiError
            );
        });
    });

    describe('file uploads', () => {
        let directory: string;
        let filePath: string;

        beforeAll(async () => {
            directory = await mkdtemp(join(tmpdir(), 'botApiClient-'));
            filePath = join(directory, 'picture.png');
            await writeFile(filePath, 'image-bytes');
        });

        afterAll(async () => {
            await rm(directory, { recursive: true, force: true });
        });

        test('should send InputFile params as multipart form data', async () => {
            const { requests } = createFetch(
                json({ ok: true, result: { message_id: 7 } })
            );
            const client = new BotApiClient('TOKEN');

            await client.call('sendPhoto', {
                chat_id: 5,
                photo: { source: filePath },
                reply_parameters: { message_id: 3 },
                has_spoiler: false,
                caption: undefined
            });

            const { init } = requests[0];
            expect(init.headers).toBeUndefined();
            expect(init.body).toBeInstanceOf(FormData);

            const form = init.body as FormData;
            expect(form.get('chat_id')).toBe('5');
            expect(form.get('has_spoiler')).toBe('false');
            expect(form.get('reply_parameters')).toBe('{"message_id":3}');
            expect(form.has('caption')).toBe(false);

            const file = form.get('photo') as File;
            expect(file.name).toBe('picture.png');
            expect(await file.text()).toBe('image-bytes');
        });

        test('should use explicit filename when provided', async () => {
            const { requests } = createFetch(
                json({ ok: true, result: { message_id: 7 } })
            );
            const client = new BotApiClient('TOKEN');

            await client.call('sendVideo', {
                chat_id: 5,
                video: { source: filePath, filename: 'clip.mp4' }
            });

            const file = (requests[0].init.body as FormData).get(
                'video'
            ) as File;
            expect(file.name).toBe('clip.mp4');
        });

        test('should extend the timeout by the time the upload takes at the minimum speed', async () => {
            const largeFilePath = join(directory, 'large.mp4');
            await writeFile(largeFilePath, Buffer.alloc(20 * 1024));
            createFetch(delayed(60, ok), noAnswer);
            const client = new BotApiClient('TOKEN');
            const video = { source: largeFilePath };
            const options = { timeout: 10 as Milliseconds };

            const uploaded = await client.call(
                'sendVideo',
                { chat_id: 5, video },
                options
            );
            const startedAt = performance.now();
            const timedOut = (await client
                .call('sendVideo', { chat_id: 5, video }, options)
                .catch((e: unknown) => e)) as Error;

            expect(uploaded).toBe(true as never);
            expect(timedOut.name).toBe('TimeoutError');
            expect(performance.now() - startedAt).toBeGreaterThanOrEqual(200);
        });

        test('should not treat objects with other keys as files', async () => {
            const { requests } = createFetch(
                json({ ok: true, result: true })
            );
            const client = new BotApiClient('TOKEN');

            await client.call('setMessageReaction', {
                chat_id: 1,
                message_id: 2,
                reaction: { source: 'x', type: 'emoji' } as never
            });

            expect(typeof requests[0].init.body).toBe('string');
        });
    });
});
