import { Hours } from '../types/timeValues';

export class CachedStateFactory {
    getValue: () => Promise<unknown>;
    invalidationTimeoutInHours: Hours;

    constructor(
        itemFactory: () => Promise<unknown>,
        invalidationTimeout: Hours
    ) {
        this.getValue = itemFactory;
        this.invalidationTimeoutInHours = invalidationTimeout;
    }
}
