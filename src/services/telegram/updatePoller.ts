import { setTimeout } from 'timers/promises';
import { Update } from '../../types/botApi.generated';
import { Milliseconds, Seconds } from '../../types/timeValues';
import { BotApiClient, TelegramApiError } from './botApiClient';
import { secondsToMilliseconds } from '../../helpers/timeConvertions';

export type UpdateType = Exclude<keyof Update, 'update_id'>;
export type UpdateHandler<T extends UpdateType> = (
    payload: NonNullable<Update[T]>
) => void | Promise<void>;

const LONG_POLLING_TIMEOUT = 50 as Seconds;

/**
 * Delays between consecutive failed polling attempts.
 * Recoverable errors keep retrying with the last delay.
 */
const DEFAULT_RETRY_DELAYS = [1, 3, 5, 10, 30, 60].map((x) =>
    secondsToMilliseconds(x as Seconds)
);

/**
 * Errors that usually mean polling cannot recover: invalid token, another instance polling.
 * They can still be transient (e.g. instances overlapping during a deploy),
 * so polling stops only once every retry has failed.
 */
const FATAL_ERROR_CODES = new Set([401, 409]);

/**
 * Receives updates through `getUpdates` long polling and dispatches them to handlers.
 * Handlers are not awaited, so a slow handler does not delay the next batch of updates.
 */
export class UpdatePoller {
    private readonly client: BotApiClient;
    private readonly onError: (error: Error) => void;
    private readonly retryDelays: Milliseconds[];
    private readonly handlers = new Map<
        UpdateType,
        ((payload: never) => void | Promise<void>)[]
    >();

    private abortController: AbortController | null = null;
    private offset = 0;

    constructor(
        client: BotApiClient,
        onError: (error: Error) => void,
        retryDelays: Milliseconds[] = DEFAULT_RETRY_DELAYS
    ) {
        this.client = client;
        this.onError = onError;
        this.retryDelays = retryDelays;
    }

    on<T extends UpdateType>(type: T, handler: UpdateHandler<T>) {
        const handlers = this.handlers.get(type) ?? [];
        handlers.push(handler);
        this.handlers.set(type, handlers);
    }

    /**
     * Removes the webhook (polling is rejected while one is set) and starts polling in background.
     * Does nothing if no handlers are registered.
     * @returns promise that resolves once polling has stopped.
     */
    async start() {
        if (this.abortController || this.handlers.size == 0) return;

        const abortController = new AbortController();
        this.abortController = abortController;

        try {
            await this.poll(abortController.signal);
        } catch (error) {
            if (!abortController.signal.aborted) {
                this.onError(this.toError(error));
            }
        } finally {
            if (this.abortController == abortController) {
                this.abortController = null;
            }
        }
    }

    stop() {
        this.abortController?.abort();
        this.abortController = null;
    }

    private async poll(signal: AbortSignal) {
        const allowedUpdates = [...this.handlers.keys()];
        let failedAttempts = 0;
        let isWebhookDeleted = false;

        while (!signal.aborted) {
            try {
                // Retried like getUpdates, so a network error at startup doesn't stop polling
                if (!isWebhookDeleted) {
                    await this.client.call('deleteWebhook', {}, signal);
                    isWebhookDeleted = true;
                }

                const updates = await this.client.call(
                    'getUpdates',
                    {
                        offset: this.offset,
                        timeout: LONG_POLLING_TIMEOUT,
                        allowed_updates: allowedUpdates
                    },
                    signal
                );
                failedAttempts = 0;

                for (const update of updates) {
                    this.offset = update.update_id + 1;
                    this.dispatch(update);
                }
            } catch (error) {
                if (signal.aborted) break;
                if (
                    error instanceof TelegramApiError &&
                    FATAL_ERROR_CODES.has(error.errorCode) &&
                    failedAttempts >= this.retryDelays.length
                ) {
                    throw error;
                }

                this.onError(this.toError(error));
                await setTimeout(this.retryDelay(failedAttempts), undefined, {
                    signal
                }).catch(() => undefined);
                failedAttempts += 1;
            }
        }

        if (this.offset == 0) return;

        await this.client
            .call('getUpdates', { offset: this.offset, limit: 1, timeout: 0 })
            .catch((error: unknown) => {
                this.onError(this.toError(error));
            });
    }

    private dispatch(update: Update) {
        for (const [type, handlers] of this.handlers) {
            const payload = update[type];
            if (payload === undefined) continue;

            for (const handler of handlers) {
                try {
                    const result = handler(payload as never);
                    if (result instanceof Promise) {
                        result.catch((error: unknown) => {
                            this.onError(this.toError(error));
                        });
                    }
                } catch (error) {
                    this.onError(this.toError(error));
                }
            }
        }
    }

    private retryDelay(failedAttempts: number) {
        return this.retryDelays[
            Math.min(failedAttempts, this.retryDelays.length - 1)
        ];
    }

    private toError(error: unknown) {
        return error instanceof Error ? error : new Error('Unknown error');
    }
}
