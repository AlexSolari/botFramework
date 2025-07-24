import { PropertyProvider } from '../types/propertyProvider';
import { Seconds } from '../types/timeValues';

export type Cooldown =
    | { seconds: Seconds }
    | { provider: PropertyProvider<Seconds> };

export class CooldownInfo {
    constructor(
        /** Cooldown configuration */
        readonly cooldown: Cooldown,
        /** Cooldown message to be shown */
        readonly message?: string
    ) {}
}
