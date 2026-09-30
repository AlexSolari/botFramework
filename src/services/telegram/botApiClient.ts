import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { setTimeout } from 'timers/promises';
import {
    BotApiMethods,
    ResponseParameters
} from '../../types/botApi.generated';
import { InputFile } from '../../types/inputFile';
import { Seconds } from '../../types/timeValues';
import { secondsToMilliseconds } from '../../helpers/timeConvertions';

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

function isInputFile(value: unknown): value is InputFile {
    if (typeof value != 'object' || value == null) return false;
    if (!('source' in value) || typeof value.source != 'string') return false;

    return Object.keys(value).every((x) => x == 'source' || x == 'filename');
}

export class BotApiClient {
    private readonly baseUrl: string;
    private readonly fetchImpl: typeof fetch;
    /** Token as it can appear in error details: raw and url-encoded. */
    private readonly secrets: string[];

    constructor(
        token: string,
        options?: { apiRoot?: string; fetch?: typeof fetch }
    ) {
        this.baseUrl = `${options?.apiRoot ?? TELEGRAM_API_ROOT}/bot${token}`;
        this.fetchImpl = options?.fetch ?? fetch;
        this.secrets = [...new Set([token, encodeURIComponent(token)])].filter(
            (x) => x.length > 0
        );
    }

    /**
     * Calls a Bot API method.
     * Parameters holding an `InputFile` are uploaded as multipart form data.
     * A flood-control error (429) is retried once after the requested delay.
     */
    async call<M extends BotApiMethod>(
        method: M,
        params: BotApiParams<M>,
        signal?: AbortSignal
    ): Promise<BotApiResult<M>> {
        try {
            return await this.send(method, params, signal);
        } catch (error) {
            if (
                error instanceof TelegramApiError &&
                error.errorCode == HTTP_TOO_MANY_REQUESTS &&
                error.retryAfter != undefined
            ) {
                await setTimeout(
                    secondsToMilliseconds(error.retryAfter),
                    undefined,
                    { signal }
                );
                return await this.send(method, params, signal);
            }

            throw error;
        }
    }

    private async send<M extends BotApiMethod>(
        method: M,
        params: BotApiParams<M>,
        signal?: AbortSignal
    ): Promise<BotApiResult<M>> {
        const entries = Object.entries(params).filter(
            ([, value]) => value !== undefined
        );
        const hasFiles = entries.some(([, value]) => isInputFile(value));
        const request: RequestInit = hasFiles
            ? { body: await this.buildFormData(entries) }
            : {
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(Object.fromEntries(entries))
              };

        let response: Response;
        let text: string;
        try {
            response = await this.fetchImpl(`${this.baseUrl}/${method}`, {
                ...request,
                method: 'POST',
                signal
            });
            text = await response.text();
        } catch (error) {
            // Network errors may carry the request url, which contains the token.
            throw this.redactToken(error);
        }

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
            } else if (
                typeof value == 'number' ||
                typeof value == 'boolean'
            ) {
                target[key] = value;
            }
        }

        return redacted;
    }

    private async buildFormData(entries: [string, unknown][]) {
        const form = new FormData();

        for (const [key, value] of entries) {
            if (isInputFile(value)) {
                const content = await readFile(value.source);
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

        return form;
    }
}
