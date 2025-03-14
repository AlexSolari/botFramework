import { IActionState } from '../types/actionState';

export class ActionExecutionResult {
    data: IActionState;
    shouldUpdate: boolean;

    constructor(data: IActionState, shouldUpdate: boolean) {
        this.data = data;
        this.shouldUpdate = shouldUpdate;
    }
}
