import { Seconds } from './timeValues';

export interface IActionState {
    lastExecutedDate: number;
    pinnedMessages: number[];
    customCooldown?: Seconds;
}
