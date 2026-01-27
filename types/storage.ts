import { IActionState } from './actionState';
import { IActionWithState } from './action';

export interface IStorageClient {
    updateStateFor<TActionState extends IActionState>(
        action: IActionWithState<TActionState>,
        chatId: number,
        update: (state: TActionState) => Promise<void> | void
    ): Promise<void>;
    close(): Promise<void>;
    load<TActionState extends IActionState>(
        action: IActionWithState<TActionState>
    ): Promise<Record<number, TActionState>>;
    getActionState<TActionState extends IActionState>(
        action: IActionWithState<TActionState>,
        chatId: number
    ): Promise<TActionState>;
    saveActionExecutionResult<TActionState extends IActionState>(
        action: IActionWithState<TActionState>,
        chatId: number,
        state: TActionState
    ): Promise<void>;
}
