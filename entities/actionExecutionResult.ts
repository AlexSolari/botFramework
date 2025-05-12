import { IActionState } from '../types/actionState';

export class ActionExecutionResult<TActionState extends IActionState> {
    data: TActionState;
    shouldUpdate: boolean;

    constructor(data: TActionState, shouldUpdate: boolean) {
        this.data = data;
        this.shouldUpdate = shouldUpdate;
    }
}
