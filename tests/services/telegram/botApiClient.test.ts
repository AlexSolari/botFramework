import { describe, test, expect, mock, beforeAll, afterAll } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    BotApiClient,
    TelegramApiError
} from '../../../src/services/telegram/botApiClient';

interface RecordedRequest {
    url: string;
    init: RequestInit;
}

function createFetch(...responses: (() => Response)[]) {
    const requests: RecordedRequest[] = [];
    const fetchMock = mock((url: string, init: RequestInit) => {
        requests.push({ url, init });
        const next = responses.shift();
        if (!next) throw new Error('Unexpected request');
        return Promise.resolve(next());
    });

    return { fetch: fetchMock as unknown as typeof fetch, requests };
}

const json = (body: unknown, status = 200) => () =>
    new Response(JSON.stringify(body), { status });

describe('BotApiClient', () => {
    test('should POST JSON params to the method url and return the result', async () => {
        const { fetch, requests } = createFetch(
            json({ ok: true, result: { message_id: 42 } })
        );
        const client = new BotApiClient('TOKEN', {
            apiRoot: 'https://api.example',
            fetch
        });

        const result = await client.call('sendMessage', {
            chat_id: 1,
            text: 'hello',
            reply_parameters: undefined
        });

        expect(result).toEqual({ message_id: 42 } as never);
        expect(requests[0].url).toBe('https://api.example/botTOKEN/sendMessage');
        expect(requests[0].init.method).toBe('POST');
        expect(requests[0].init.headers).toEqual({
            'Content-Type': 'application/json'
        });
        expect(JSON.parse(requests[0].init.body as string)).toEqual({
            chat_id: 1,
            text: 'hello'
        });
    });

    test('should use the Telegram API root by default', async () => {
        const { fetch, requests } = createFetch(json({ ok: true, result: true }));
        const client = new BotApiClient('TOKEN', { fetch });

        await client.call('deleteWebhook', {});

        expect(requests[0].url).toBe(
            'https://api.telegram.org/botTOKEN/deleteWebhook'
        );
    });

    test('should throw TelegramApiError in "<code>: <description>" format', async () => {
        const { fetch } = createFetch(
            json(
                {
                    ok: false,
                    error_code: 400,
                    description: 'Bad Request: QUOTE_TEXT_INVALID'
                },
                400
            )
        );
        const client = new BotApiClient('TOKEN', { fetch });

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
        const { fetch } = createFetch(json({ ok: false }, 500));
        const client = new BotApiClient('TOKEN', { fetch });

        const error = (await client
            .call('getMe', {})
            .catch((e: unknown) => e)) as TelegramApiError;

        expect(error.errorCode).toBe(500);
        expect(error.description).toBe('Unknown error');
    });

    test('should throw TelegramApiError on non-JSON response', async () => {
        const { fetch } = createFetch(
            () =>
                new Response('<html>Bad Gateway</html>', {
                    status: 502,
                    statusText: 'Bad Gateway'
                })
        );
        const client = new BotApiClient('TOKEN', { fetch });

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
        const { fetch, requests } = createFetch(
            floodError,
            json({ ok: true, result: true })
        );
        const client = new BotApiClient('TOKEN', { fetch });

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
        const { fetch, requests } = createFetch(floodError, floodError);
        const client = new BotApiClient('TOKEN', { fetch });

        const error = (await client
            .call('getMe', {})
            .catch((e: unknown) => e)) as TelegramApiError;

        expect(error.errorCode).toBe(429);
        expect(error.retryAfter).toBe(0 as never);
        expect(requests.length).toBe(2);
    });

    test('should not retry other errors', async () => {
        const { fetch, requests } = createFetch(
            json({ ok: false, error_code: 403, description: 'Forbidden' }, 403)
        );
        const client = new BotApiClient('TOKEN', { fetch });

        await client.call('getMe', {}).catch(() => undefined);

        expect(requests.length).toBe(1);
    });

    test('should pass abort signal to fetch', async () => {
        const { fetch, requests } = createFetch(json({ ok: true, result: [] }));
        const client = new BotApiClient('TOKEN', { fetch });
        const controller = new AbortController();

        await client.call('getUpdates', {}, { signal: controller.signal });

        expect(requests[0].init.signal).toBe(controller.signal);
    });

    test('should reuse pooled connections unless a fresh connection is requested', async () => {
        const { fetch, requests } = createFetch(
            json({ ok: true, result: [] }),
            json({ ok: true, result: [] })
        );
        const client = new BotApiClient('TOKEN', { fetch });

        await client.call('getUpdates', {});
        await client.call('getUpdates', {}, { freshConnection: true });

        expect(requests[0].init.keepalive).toBeUndefined();
        expect(requests[1].init.keepalive).toBe(false);
    });

    describe('token redaction', () => {
        const token = '123456:SECRET-token';
        const url = `https://api.telegram.org/bot${token}/getMe`;

        const failingFetch = (error: unknown) =>
            (() => Promise.reject(error)) as unknown as typeof fetch;

        const callAndCatch = async (error: unknown) => {
            const client = new BotApiClient(token, {
                fetch: failingFetch(error)
            });
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
            const { fetch } = createFetch(
                json({ ok: false, error_code: 403, description: 'Forbidden' }, 403)
            );
            const client = new BotApiClient(token, { fetch });

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
            const { fetch, requests } = createFetch(
                json({ ok: true, result: { message_id: 7 } })
            );
            const client = new BotApiClient('TOKEN', { fetch });

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
            const { fetch, requests } = createFetch(
                json({ ok: true, result: { message_id: 7 } })
            );
            const client = new BotApiClient('TOKEN', { fetch });

            await client.call('sendVideo', {
                chat_id: 5,
                video: { source: filePath, filename: 'clip.mp4' }
            });

            const file = (requests[0].init.body as FormData).get(
                'video'
            ) as File;
            expect(file.name).toBe('clip.mp4');
        });

        test('should not treat objects with other keys as files', async () => {
            const { fetch, requests } = createFetch(
                json({ ok: true, result: true })
            );
            const client = new BotApiClient('TOKEN', { fetch });

            await client.call('setMessageReaction', {
                chat_id: 1,
                message_id: 2,
                reaction: { source: 'x', type: 'emoji' } as never
            });

            expect(typeof requests[0].init.body).toBe('string');
        });
    });
});
