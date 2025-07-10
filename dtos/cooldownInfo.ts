import { Seconds } from '../types/timeValues';

export class CooldownInfo {
    constructor(
        /** New one-time cooldown in seconds */
        readonly seconds: Seconds,
        /** Cooldown message to be shown */
        readonly message: string | undefined
    ) {}
}
