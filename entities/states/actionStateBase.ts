import { IActionState } from '../../types/actionState';

export class ActionStateBase implements IActionState {
    pinnedMessages: number[] = [];
    lastExecutedDate = 0;
}
