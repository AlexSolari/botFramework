import { describe, test, expect } from 'bun:test';
import { setTimeout } from 'timers/promises';
import { getAbortControllerWithTimeout } from '../../src/helpers/getAbortControllerWithTimeout';
import { Milliseconds } from '../../src/types/timeValues';

describe('getAbortControllerWithTimeout', () => {
    test('should abort with a TimeoutError once the time has passed', async () => {
        const { controller } = getAbortControllerWithTimeout(
            10 as Milliseconds
        );

        expect(controller.signal.aborted).toBe(false);
        await setTimeout(30);

        expect(controller.signal.aborted).toBe(true);
        expect((controller.signal.reason as Error).name).toBe('TimeoutError');
    });

    test('should not abort once the timer is cleared', async () => {
        const { controller, timer } = getAbortControllerWithTimeout(
            10 as Milliseconds
        );

        clearTimeout(timer);
        await setTimeout(30);

        expect(controller.signal.aborted).toBe(false);
    });
});
