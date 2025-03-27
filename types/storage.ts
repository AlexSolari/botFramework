import { ActionExecutionResult } from '../entities/actionExecutionResult';
import { IActionState } from './actionState';
import { ActionKey, IActionWithState } from './actionWithState';

export interface IStorageClient {
    updateStateFor<TActionState extends IActionState>(
        action: IActionWithState,
        chatId: number,
        update: (state: TActionState) => Promise<void>
    ): Promise<void>;
    close(): Promise<void>;
    load<TActionState extends IActionState>(
        key: ActionKey
    ): Promise<Record<number, TActionState>>;
    saveMetadata(actions: IActionWithState[], botName: string): Promise<void>;
    getActionState<TActionState extends IActionState>(
        action: IActionWithState,
        chatId: number
    ): Promise<TActionState>;
    saveActionExecutionResult(
        action: IActionWithState,
        chatId: number,
        transactionResult: ActionExecutionResult
    ): Promise<void>;
}
