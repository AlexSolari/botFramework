import { BotResponse } from '../types/response';

/* eslint-disable @typescript-eslint/no-unused-vars */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Noop {
    static NoResponse: BotResponse[] = [];
    static true(arg1: unknown) {
        return true;
    }
    static false(arg1: unknown) {
        return false;
    }

    static async call(arg1: unknown): Promise<void>;
    static async call(arg1: unknown, arg2?: unknown) {}
}
