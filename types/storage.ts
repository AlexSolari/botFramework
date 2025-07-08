import { IActionState } from './actionState';
import { ActionKey, IActionWithState } from './action';

export interface IStorageClient {
    updateStateFor<TActionState extends IActionState>(
        action: IActionWithState<TActionState>,
        chatId: number,
        update: (state: TActionState) => Promise<void>
    ): Promise<void>;
    close(): Promise<void>;
    load<TActionState extends IActionState>(
        key: ActionKey
    ): Promise<Record<number, TActionState>>;
    saveMetadata<TActionState extends IActionState>(
        actions: IActionWithState<TActionState>[]
    ): Promise<void>;
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
