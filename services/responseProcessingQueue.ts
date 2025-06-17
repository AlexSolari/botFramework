import { setTimeout } from 'timers/promises';
import { Milliseconds } from '../types/timeValues';

export type QueueItem = {
    priority: number;
    callback: () => Promise<void>;
};

const TELEGRAM_RATELIMIT_DELAY = 35 as Milliseconds;

export class ResponseProcessingQueue {
    items: QueueItem[] = [];
    isFlushing = false;

    enqueue(item: QueueItem) {
        if (
            this.items.length === 0 ||
            item.priority >= this.items[this.items.length - 1]!.priority
        ) {
            this.items.push(item);
            return;
        }

        let insertIndex = this.items.length;
        while (
            insertIndex > 0 &&
            this.items[insertIndex - 1]!.priority > item.priority
        ) {
            insertIndex--;
        }
        this.items.splice(insertIndex, 0, item);
    }

    async flushReadyItems() {
        if (this.isFlushing) return;

        this.isFlushing = true;

        while (this.items.length) {
            if (Date.now() >= this.items[0].priority) {
                const item = this.items.shift()!;

                await item.callback();
            } else {
                await setTimeout(TELEGRAM_RATELIMIT_DELAY);
            }
        }

        this.isFlushing = false;
    }
}
