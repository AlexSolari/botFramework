import { spyOn } from 'bun:test';

const defaultBot = {
    id: 1,
    is_bot: true,
    first_name: 'Bot',
    username: 'testbot'
};

/**
 * Replaces the global fetch with a minimal Bot API until `mock.restore()`:
 * `getMe` returns `me`, `getUpdates` waits until its request is aborted, every other method returns `true`.
 */
export function fakeTelegram(me: object = defaultBot) {
    const urls: string[] = [];
    const methods: string[] = [];

    spyOn(globalThis, 'fetch').mockImplementation(((
        url: string,
        init: RequestInit
    ) => {
        const method = url.slice(url.lastIndexOf('/') + 1);
        urls.push(url);
        methods.push(method);

        if (method == 'getUpdates') {
            return new Promise((_, reject) => {
                const signal = init.signal;
                if (signal?.aborted) reject(signal.reason as Error);
                signal?.addEventListener('abort', () => {
                    reject(signal.reason as Error);
                });
            });
        }

        const result = method == 'getMe' ? me : true;
        return Promise.resolve(
            new Response(JSON.stringify({ ok: true, result }))
        );
    }) as typeof fetch);

    return { urls, methods };
}
