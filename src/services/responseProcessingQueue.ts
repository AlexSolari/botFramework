import { Milliseconds } from '../types/timeValues';
import { RateLimit } from 'async-sema';

export type QueueItem = {
    priority: number;
    callback: () => Promise<void>;
};

const TELEGRAM_RATELIMIT_DELAY = 35 as Milliseconds;

export class ResponseProcessingQueue {
    private readonly rateLimiter = RateLimit(1, {
        timeUnit: TELEGRAM_RATELIMIT_DELAY
    });
    private readonly items: QueueItem[] = [];
    private isFlushing = false;

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

        try {
            while (this.items.length > 0) {
                await this.rateLimiter();
                if (Date.now() >= this.items[0].priority) {
                    const item = this.items.shift();

                    await item?.callback();
                }
            }
        } finally {
            this.isFlushing = false;
        }
    }
}
