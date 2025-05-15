import { Milliseconds } from './timeValues';

export interface IScheduler {
    stopAll(): void;

    createTask(
        name: string,
        action: () => void,
        interval: Milliseconds,
        executeRightAway: boolean,
        ownerName: string
    ): void;

    createOnetimeTask(
        name: string,
        action: () => void,
        delay: Milliseconds,
        ownerName: string
    ): void;
}
