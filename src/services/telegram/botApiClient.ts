import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { setTimeout } from 'timers/promises';
import {
    BotApiMethods,
    ResponseParameters
} from '../../types/botApi.generated';
import { InputFile } from '../../types/inputFile';
import { Milliseconds, Seconds } from '../../types/timeValues';
import { secondsToMilliseconds } from '../../helpers/timeConvertions';
import { getAbortControllerWithTimeout } from '../../helpers/getAbortControllerWithTimeout';

export type BotApiMethod = keyof BotApiMethods;
export type BotApiParams<M extends BotApiMethod> = BotApiMethods[M]['params'];
export type BotApiResult<M extends BotApiMethod> = BotApiMethods[M]['result'];

interface BotApiResponse<T> {
    ok: boolean;
    result?: T;
    description?: string;
    error_code?: number;
    parameters?: ResponseParameters;
}

const TELEGRAM_API_ROOT = 'https://api.telegram.org';
const HTTP_TOO_MANY_REQUESTS = 429;
const REDACTED = '[REDACTED]';

/** A request still waiting past this is most likely stuck on a dead connection. */
const DEFAULT_REQUEST_TIMEOUT = secondsToMilliseconds(60 as Seconds);

/**
 * Bun closes pooled connections after about 10 seconds idle,
 * so the ones opened before a network change are gone once this has passed.
 */
const FRESH_CONNECTION_PERIOD = secondsToMilliseconds(30 as Seconds);

/**
 * Slowest upload, in bytes per second, still expected to finish.
 * Uploaded files extend the request timeout by the time they take at this speed.
 */
const MIN_UPLOAD_SPEED = 100 * 1024;

/**
 * Fresh connection window: it lasts until `until`, and while `failing`, until a request gets an answer.
 * Bun pools connections process-wide, so the window is shared by all clients.
 */
export const freshConnectionWindow = { until: 0, failing: false };

/**
 * Error returned by the Bot API.
 * Message format (`<code>: <description>`) matches the one used by Telegraf,
 * so existing checks against the description keep working.
 */
export class TelegramApiError extends Error {
    readonly method: string;
    readonly errorCode: number;
    readonly description: string;
    readonly parameters: ResponseParameters | undefined;

    constructor(
        method: string,
        errorCode: number,
        description: string,
        parameters?: ResponseParameters
    ) {
        super(`${errorCode}: ${description}`);
        this.name = 'TelegramApiError';
        this.method = method;
        this.errorCode = errorCode;
        this.description = description;
        this.parameters = parameters;
    }

    get retryAfter(): Seconds | undefined {
        return this.parameters?.retry_after as Seconds | undefined;
    }
}

export interface BotApiCallOptions {
    signal?: AbortSignal;
    /**
     * Overrides the client's request timeout. Applies to each attempt separately
     * and is extended by the time uploaded files take at the minimum upload speed.
     */
    timeout?: Milliseconds;
}

function isInputFile(value: unknown): value is InputFile {
    if (typeof value != 'object' || value == null) return false;
    if (!('source' in value) || typeof value.source != 'string') return false;

    return Object.keys(value).every((x) => x == 'source' || x == 'filename');
}

export class BotApiClient {
    private readonly baseUrl: string;
    /** Token as it can appear in error details: raw and url-encoded. */
    private readonly secrets: string[];

    constructor(token: string) {
        this.baseUrl = `${TELEGRAM_API_ROOT}/bot${token}`;
        this.secrets = [...new Set([token, encodeURIComponent(token)])].filter(
            (x) => x.length > 0
        );
    }

    /**
     * Makes requests of all clients open new connections instead of reusing pooled ones for a while,
     * as the pooled ones may be dead after a network change.
     * After a network error or a timeout, this happens automatically
     * and lasts until a request gets an answer.
     */
    useFreshConnections() {
        freshConnectionWindow.until =
            performance.now() + FRESH_CONNECTION_PERIOD;
    }

    /**
     * Calls a Bot API method.
     * Parameters holding an `InputFile` are uploaded as multipart form data.
     * A flood-control error (429) is retried once after the requested delay.
     */
    async call<M extends BotApiMethod>(
        method: M,
        params: BotApiParams<M>,
        options: BotApiCallOptions = {}
    ): Promise<BotApiResult<M>> {
        try {
            return await this.send(method, params, options);
        } catch (error) {
            if (
                error instanceof TelegramApiError &&
                error.errorCode == HTTP_TOO_MANY_REQUESTS &&
                error.retryAfter != undefined
            ) {
                await setTimeout(
                    secondsToMilliseconds(error.retryAfter),
                    undefined,
                    { signal: options.signal }
                );
                return await this.send(method, params, options);
            }

            throw error;
        }
    }

    private async send<M extends BotApiMethod>(
        method: M,
        params: BotApiParams<M>,
        options: BotApiCallOptions
    ): Promise<BotApiResult<M>> {
        const { request, uploadSize } = await this.buildRequest(params);

        const timeout = ((options.timeout ?? DEFAULT_REQUEST_TIMEOUT) +
            (1000 * uploadSize) / MIN_UPLOAD_SPEED) as Milliseconds;
        const { response, text } = await this.post(
            method,
            request,
            timeout,
            options.signal
        );

        return this.parseResult(method, response, text);
    }

    private async buildRequest(
        params: object
    ): Promise<{ request: RequestInit; uploadSize: number }> {
        const entries = Object.entries(params).filter(
            ([, value]) => value !== undefined
        );
        if (entries.some(([, value]) => isInputFile(value))) {
            return await this.buildFormData(entries);
        }

        return {
            request: {
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.fromEntries(entries))
            },
            uploadSize: 0
        };
    }

    /**
     * While the fresh connection window is open, disables keepalive,
     * which makes Bun open a new connection for the request.
     * Errors are returned without the token, as network errors may carry the request url.
     */
    private async post(
        method: BotApiMethod,
        request: RequestInit,
        timeout: Milliseconds,
        signal: AbortSignal | undefined
    ) {
        const { controller, timer } = getAbortControllerWithTimeout(timeout);
        const freshConnection =
            freshConnectionWindow.failing ||
            performance.now() < freshConnectionWindow.until;

        try {
            const response = await fetch(`${this.baseUrl}/${method}`, {
                ...request,
                method: 'POST',
                signal: signal
                    ? AbortSignal.any([signal, controller.signal])
                    : controller.signal,
                ...(freshConnection && { keepalive: false })
            });
            const text = await response.text();
            freshConnectionWindow.failing = false;

            return { response, text };
        } catch (error) {
            if (!signal?.aborted) {
                freshConnectionWindow.failing = true;
                this.useFreshConnections();
            }
            throw this.redactToken(error);
        } finally {
            clearTimeout(timer);
        }
    }

    private parseResult<M extends BotApiMethod>(
        method: M,
        response: Response,
        text: string
    ): BotApiResult<M> {
        let body: BotApiResponse<BotApiResult<M>>;
        try {
            body = JSON.parse(text) as BotApiResponse<BotApiResult<M>>;
        } catch {
            throw new TelegramApiError(
                method,
                response.status,
                `Unexpected response: ${response.statusText}`
            );
        }

        if (!body.ok || body.result === undefined) {
            throw new TelegramApiError(
                method,
                body.error_code ?? response.status,
                body.description ?? 'Unknown error',
                body.parameters
            );
        }

        return body.result;
    }

    private redact(value: string) {
        return this.secrets.reduce(
            (result, secret) => result.replaceAll(secret, REDACTED),
            value
        );
    }

    /**
     * Copies the error with the token removed from its message, stack, cause and string properties.
     * Other non-primitive properties are dropped, as they cannot be checked reliably.
     */
    private redactToken(error: unknown): unknown {
        if (typeof error == 'string') return this.redact(error);
        if (!(error instanceof Error)) return error;

        const redacted = new Error(
            this.redact(error.message),
            error.cause === undefined
                ? undefined
                : { cause: this.redactToken(error.cause) }
        );
        redacted.name = error.name;
        redacted.stack = error.stack && this.redact(error.stack);

        const target = redacted as unknown as Record<string, unknown>;
        for (const [key, value] of Object.entries(error)) {
            if (key == 'cause') continue;
            if (typeof value == 'string') {
                target[key] = this.redact(value);
            } else if (typeof value == 'number' || typeof value == 'boolean') {
                target[key] = value;
            }
        }

        return redacted;
    }

    private async buildFormData(entries: [string, unknown][]) {
        const form = new FormData();
        let uploadSize = 0;

        for (const [key, value] of entries) {
            if (isInputFile(value)) {
                const content = await readFile(value.source);
                uploadSize += content.byteLength;
                form.append(
                    key,
                    new Blob([content]),
                    value.filename ?? basename(value.source)
                );
            } else if (typeof value == 'object') {
                form.append(key, JSON.stringify(value));
            } else {
                form.append(key, String(value));
            }
        }

        return { request: { body: form }, uploadSize };
    }
}
