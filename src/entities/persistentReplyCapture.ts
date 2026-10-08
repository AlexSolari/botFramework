import { ActionKey, IActionWithState } from '../types/action';
import { IActionState } from '../types/actionState';
import { CommandTrigger } from '../types/commandTrigger';
import { PersistentReplyHandler } from '../types/handlers';
import { Milliseconds } from '../types/timeValues';

export type PersistentReplyCaptureRecord<TData> = {
    parentMessageIds: number[];
    data: TData;
    chatName: string;
    createdAt: number;
};

export interface PersistentReplyCaptureState<TData> extends IActionState {
    captures: Record<number, PersistentReplyCaptureRecord<TData>>;
}

export class PersistentReplyCapture<TData extends object> {
    readonly storageKey: IActionWithState<PersistentReplyCaptureState<TData>>;
    readonly name: string;
    readonly triggers: CommandTrigger[];
    readonly handler: PersistentReplyHandler<TData>;
    readonly expiresAfter: Milliseconds | undefined;
    readonly maxAllowedSimultaniousExecutions: number;

    constructor(
        name: string,
        triggers: CommandTrigger[],
        handler: PersistentReplyHandler<TData>,
        expiresAfter: Milliseconds | undefined,
        maxAllowedSimultaniousExecutions: number
    ) {
        this.name = name;
        this.triggers = triggers;
        this.handler = handler;
        this.expiresAfter = expiresAfter;
        this.maxAllowedSimultaniousExecutions =
            maxAllowedSimultaniousExecutions;

        this.storageKey = {
            key: `persistentCapture:${this.name.replaceAll('.', '-')}` as ActionKey,
            stateConstructor: () => ({
                lastExecutedDate: 0,
                pinnedMessages: [],
                captures: {}
            })
        };
    }
}
