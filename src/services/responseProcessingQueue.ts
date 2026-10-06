import { RateLimit } from 'async-sema';
import { TELEGRAM_RATELIMIT_DELAY } from '../helpers/constants';
import { Noop } from '../helpers/noop';

export type QueueItem = {
    priority: number;
    callback: () => Promise<void>;
};

export class ResponseProcessingQueue {
    private readonly rateLimiter = RateLimit(1, {
        timeUnit: TELEGRAM_RATELIMIT_DELAY
    });
    private readonly items: QueueItem[] = [];
    private isFlushing = false;
    private wakeUp = Noop.void;

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

        if (insertIndex === 0) {
            this.wakeUp();
        }
    }

    async flushReadyItems() {
        if (this.isFlushing) return;

        this.isFlushing = true;

        try {
            while (this.items.length > 0) {
                const delay = this.items[0].priority - Date.now();
                if (delay > 0) {
                    await this.sleep(delay);
                    continue;
                }

                await this.rateLimiter();
                const item = this.items.shift();

                void item?.callback();
            }
        } finally {
            this.isFlushing = false;
        }
    }

    private sleep(ms: number) {
        return new Promise<void>((resolve) => {
            const done = () => {
                clearTimeout(timer);
                this.wakeUp = Noop.void;
                resolve();
            };
            const timer = setTimeout(done, ms);
            this.wakeUp = done;
        });
    }
}
