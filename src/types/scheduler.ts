import { Milliseconds } from './timeValues';

export interface IScheduler {
    /**
     * Cancels every task created so far, repeating and one-time.
     * Tasks created afterwards are scheduled as usual.
     */
    cancelAllTasks(): void;

    /**
     * Runs `action` repeatedly, every `interval`, until the task is cancelled.
     * The scheduler must handle errors thrown by `action` and rejections of the promise it returns;
     * `NodeTimeoutScheduler` emits them as `error` events.
     * @param name Task name, used in traces and events.
     * @param action Function to run. It may return a promise, which isn't awaited before the next run.
     * @param interval Time between runs.
     * @param executeRightAway Also runs `action` once right away, without waiting for the first interval.
     * @param ownerName Name of the bot that created the task, used in events.
     */
    createTask(
        name: string,
        action: () => unknown,
        interval: Milliseconds,
        executeRightAway: boolean,
        ownerName: string
    ): void;

    /**
     * Runs `action` once, after `delay`, unless the task is cancelled first.
     * Errors are handled as in `createTask`.
     * @param name Task name, used in traces and events.
     * @param action Function to run. It may return a promise.
     * @param delay Time to wait before running `action`.
     * @param ownerName Name of the bot that created the task, used in events.
     */
    createOnetimeTask(
        name: string,
        action: () => unknown,
        delay: Milliseconds,
        ownerName: string
    ): void;
}
