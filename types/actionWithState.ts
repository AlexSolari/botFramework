import { IActionState } from './actionState';

export type ActionKey = string & { __brand: 'actionKey' };

export interface IActionWithState<TActionState extends IActionState> {
    key: ActionKey;
    stateConstructor: () => TActionState;
}
