import { Seconds } from '../types/timeValues';

export class CooldownInfo {
    constructor(public seconds: Seconds, public message: string | undefined) {}
}
