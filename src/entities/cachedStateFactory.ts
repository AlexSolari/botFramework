import { Hours } from '../types/timeValues';

export class CachedStateFactory {
    readonly getValue: () => Promise<unknown>;
    readonly invalidationTimeoutInHours: Hours;

    constructor(
        itemFactory: () => Promise<unknown>,
        invalidationTimeout: Hours
    ) {
        this.getValue = itemFactory;
        this.invalidationTimeoutInHours = invalidationTimeout;
    }
}
