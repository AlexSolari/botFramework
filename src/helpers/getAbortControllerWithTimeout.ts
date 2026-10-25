import { Milliseconds } from '../types/timeValues';

/**
 * Like `AbortSignal.timeout`, but the timer can be cleared once it is no longer needed.
 */
export function getAbortControllerWithTimeout(ms: Milliseconds) {
    const controller = new AbortController();
    const timer = setTimeout(() => {
        const error = new Error('The operation timed out.');
        error.name = 'TimeoutError';
        controller.abort(error);
    }, ms);

    return { controller, timer };
}
