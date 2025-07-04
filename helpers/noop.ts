import { BotResponse } from '../types/response';

/* eslint-disable @typescript-eslint/no-unused-vars */
export class Noop {
    static NoResponse: BotResponse[] = [];
    static true<T1>(arg1: T1) {
        return true;
    }
    static false<T1>(arg1: T1) {
        return false;
    }

    static async call<T1>(arg1: T1): Promise<void>;
    static async call<T1, T2>(arg1: T1, arg2: T2): Promise<void>;
    static async call(arg1: unknown, arg2?: unknown) {}
}
