import { Milliseconds } from '../types/timeValues';
import { RateLimit } from 'async-sema';

export type QueueItem = {
    priority: number;
    callback: () => Promise<void>;
};

function notEmpty<T>(arr: T[]): arr is [T, ...T[]] {
    return arr.length > 0;
}

const TELEGRAM_RATELIMIT_DELAY = 35 as Milliseconds;

export class ResponseProcessingQueue {
    rateLimiter = RateLimit(1, { timeUnit: TELEGRAM_RATELIMIT_DELAY });
    items: QueueItem[] = [];
    isFlushing = false;

    enqueue(item: QueueItem) {
        if (
            this.items.length === 0 ||
            item.priority >= this.items[this.items.length - 1].priority
        ) {
            this.items.push(item);
            return;
        }

        let insertIndex = this.items.length;
        while (
            insertIndex > 0 &&
            this.items[insertIndex - 1].priority > item.priority
        ) {
            insertIndex--;
        }
        this.items.splice(insertIndex, 0, item);
    }

    async flushReadyItems() {
        if (this.isFlushing) return;

        this.isFlushing = true;

        while (notEmpty(this.items)) {
            if (Date.now() >= this.items[0].priority) {
                await this.rateLimiter();

                const [item] = this.items;
                this.items.shift();

                await item.callback();
            }
        }

        this.isFlushing = false;
    }
}
