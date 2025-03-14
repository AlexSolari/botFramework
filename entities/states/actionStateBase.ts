import { IActionState } from '../../types/actionState';

export class ActionStateBase implements IActionState {
    lastExecutedDate = 0;
}
