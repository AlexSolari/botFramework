import { IActionState } from './actionState';

export type ActionKey = string & { __brand: 'actionKey' };

export interface IActionWithState<TActionState extends IActionState> {
    readonly key: ActionKey;
    readonly stateConstructor: () => TActionState;
}
