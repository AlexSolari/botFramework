import { IActionState } from './actionState';

export type ActionKey = string & { __brand: 'actionKey' };

export interface IActionWithState {
    key: ActionKey;
    stateConstructor: () => IActionState;
}
