import { IActionState } from './actionState';

export type ActionKey = string & { __brand: 'actionKey' };

export interface IActionWithState<TActionState extends IActionState>
    extends IAction {
    readonly stateConstructor: () => TActionState;
}

export interface IAction {
    readonly key: ActionKey;
}
