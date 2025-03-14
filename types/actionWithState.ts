import { IActionState } from './actionState';

export interface IActionWithState {
    key: string;
    stateConstructor: () => IActionState;
}
