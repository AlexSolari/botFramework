import { BaseContext } from '../entities/context/baseContext';
import { IActionState } from './actionState';
import { BotResponse } from './response';

export type ActionKey = string & { __brand: 'actionKey' };

export interface IActionWithState<TActionState extends IActionState>
    extends IAction {
    readonly stateConstructor: () => TActionState;
}

export interface IAction {
    readonly key: ActionKey;
    exec(ctx: BaseContext<IAction>): Promise<BotResponse[]>;
}
