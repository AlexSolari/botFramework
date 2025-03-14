import { ActionExecutionResult } from '../entities/actionExecutionResult';
import { IActionState } from './actionState';
import { IActionWithState } from './actionWithState';

export interface IStorageClient {
    updateStateFor<TActionState extends IActionState>(
        sourceActionKey: string,
        chatId: number,
        update: (state: TActionState) => Promise<void>
    ): Promise<void>;
    close(): Promise<void>;
    load<TActionState extends IActionState>(
        key: string
    ): Promise<Record<number, TActionState>>;
    saveMetadata(actions: IActionWithState[], botName: string): Promise<void>;
    getActionState<TActionState extends IActionState>(
        entity: IActionWithState,
        chatId: number
    ): Promise<TActionState>;
    saveActionExecutionResult(
        action: IActionWithState,
        chatId: number,
        transactionResult: ActionExecutionResult
    ): Promise<void>;
}
