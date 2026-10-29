import { BotResponse } from '../types/response';

export class Noop {
    static readonly NoResponse: BotResponse[] = [];
    static true(arg1: unknown) {
        return true;
    }
    static false(arg1: unknown) {
        return false;
    }
    static void() {
        return;
    }
    static emptyString() {
        return '';
    }
    static async call(arg1: unknown): Promise<void>;
    static async call(arg1: unknown, arg2?: unknown) {
        return Promise.resolve();
    }
}
