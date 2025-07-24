import { Seconds } from '../types/timeValues';

export class CooldownInfo {
    constructor(
        /** Cooldown configuration */
        readonly cooldown: Seconds,
        /** Cooldown message to be shown */
        readonly message?: string
    ) {}
}
