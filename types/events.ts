import { IncomingMessage } from '../dtos/incomingMessage';
import { IncomingInlineQuery } from '../dtos/incomingQuery';
import { CommandAction } from '../entities/actions/commandAction';
import { ChatContext } from '../entities/context/chatContext';
import { InlineQueryContext } from '../entities/context/inlineQueryContext';
import { MessageContext } from '../entities/context/messageContext';
import { ReplyContext } from '../entities/context/replyContext';
import { ActionKey, IAction, IActionWithState } from './action';
import { IActionState } from './actionState';
import { BotInfo } from './externalAliases';
import { BotResponse } from './response';

export const BotEventType = {
    error: 'error.generic',

    messageRecieved: 'message.recieved',
    messageProcessingStarted: 'message.processingStarted',
    messageProcessingFinished: 'message.processingFinished',

    beforeActionsExecuting: 'message.beforeActionsExecuting',

    commandActionExecuting: 'command.actionExecuting',
    commandActionExecuted: 'command.actionExecuted',

    replyActionExecuting: 'reply.actionExecuting',
    replyActionExecuted: 'reply.actionExecuted',

    inlineActionExecuting: 'inline.actionExecuting',
    inlineActionExecuted: 'inline.actionExecuted',

    inlineProcessingStarted: 'inline.processingStarted',
    inlineProcessingAborting: 'inline.processingAborting',
    inlineProcessingAborted: 'inline.processingAborted',

    scheduledActionExecuting: 'scheduled.actionExecuting',
    scheduledActionExecuted: 'scheduled.actionExecuted',
    scheduledActionCacheValueReturned: 'scheduled.cachedValueReturned',
    scheduledActionCacheValueCreating: 'scheduled.cachedValueCreating',

    apiRequestSending: 'api.requestSending',
    apiRequestSent: 'api.requestSent',

    storageLockAcquiring: 'storage.lockAcquiring',
    storageLockAcquired: 'storage.lockAcquired',
    storageLockReleased: 'storage.lockReleased',
    storageStateSaving: 'storage.stateSaving',
    storageStateSaved: 'storage.stateSaved',
    storageStateLoading: 'storage.stateLoading',
    storageStateLoaded: 'storage.stateLoaded'
} as const;

type BotEventTypeKeys = (typeof BotEventType)[keyof typeof BotEventType];
// Exhaustiveness validation
const _checkBotEventMapExhaustive: Record<BotEventTypeKeys, unknown> =
    null as unknown as BotEventMap;

export type BotEventMap = {
    [BotEventType.error]: {
        error: Error;
    };

    [BotEventType.messageRecieved]: {
        botInfo: BotInfo;
        message: IncomingMessage;
    };

    [BotEventType.messageProcessingStarted]: {
        botInfo: BotInfo;
        message: IncomingMessage;
    };

    [BotEventType.messageProcessingFinished]: {
        botInfo: BotInfo;
        message: IncomingMessage;
    };

    [BotEventType.beforeActionsExecuting]: {
        botInfo: BotInfo;
        message: IncomingMessage;
        commands: Set<CommandAction<IActionState>>;
    };

    [BotEventType.commandActionExecuting]: {
        action: IActionWithState<IActionState>;
        ctx: MessageContext<IActionState>;
        state: IActionState;
    };

    [BotEventType.commandActionExecuted]: {
        action: IActionWithState<IActionState>;
        ctx: MessageContext<IActionState>;
        state: IActionState;
    };

    [BotEventType.replyActionExecuting]: {
        action: IAction;
        ctx: ReplyContext<IActionState>;
    };

    [BotEventType.replyActionExecuted]: {
        action: IAction;
        ctx: ReplyContext<IActionState>;
    };

    [BotEventType.inlineActionExecuting]: {
        action: IAction;
        ctx: InlineQueryContext;
    };

    [BotEventType.inlineActionExecuted]: {
        action: IAction;
        ctx: InlineQueryContext;
    };

    [BotEventType.inlineProcessingStarted]: {
        query: IncomingInlineQuery;
    };

    [BotEventType.inlineProcessingAborting]: {
        abortedQuery: IncomingInlineQuery;
        newQuery: IncomingInlineQuery;
    };

    [BotEventType.inlineProcessingAborted]: {
        abortedQuery: IncomingInlineQuery;
    };

    [BotEventType.scheduledActionExecuting]: {
        action: IAction;
        ctx: ChatContext<IActionState>;
        state: IActionState;
    };

    [BotEventType.scheduledActionExecuted]: {
        action: IAction;
        ctx: ChatContext<IActionState>;
        state: IActionState;
    };

    [BotEventType.scheduledActionCacheValueCreating]: {
        action: IAction;
        ctx: ChatContext<IActionState>;
        key: string;
    };

    [BotEventType.scheduledActionCacheValueReturned]: {
        action: IAction;
        ctx: ChatContext<IActionState>;
        key: string;
    };

    [BotEventType.apiRequestSending]: {
        response: BotResponse | null;
        telegramMethod: string | null;
    };

    [BotEventType.apiRequestSent]: {
        response: BotResponse | null;
        telegramMethod: string | null;
    };

    [BotEventType.storageLockAcquiring]: ActionKey;
    [BotEventType.storageLockAcquired]: ActionKey;
    [BotEventType.storageLockReleased]: ActionKey;
    [BotEventType.storageStateSaved]: {
        key: ActionKey;
        data: Record<number, unknown>;
    };
    [BotEventType.storageStateSaving]: {
        key: ActionKey;
        data: Record<number, unknown>;
    };
    [BotEventType.storageStateLoading]: {
        action: IActionWithState<IActionState>;
        chatId: number;
    };
    [BotEventType.storageStateLoaded]: {
        action: IActionWithState<IActionState>;
        chatId: number;
        state: IActionState;
    };
};

type ListenerArgs<K extends keyof BotEventMap> = BotEventMap[K] extends
    | undefined
    ? []
    : [BotEventMap[K]];

export type Listener<K extends keyof BotEventMap> = (
    ...args: ListenerArgs<K>
) => void;

export type EachListener = (event: BotEventTypeKeys, data: unknown) => void;

export class TypedEventEmitter {
    private readonly listeners = new Map<
        keyof BotEventMap | '*',
        Set<Listener<keyof BotEventMap> | EachListener>
    >();

    on<K extends keyof BotEventMap>(event: K, fn: Listener<K>) {
        const set = this.listeners.get(event) ?? new Set();
        set.add(fn as Listener<keyof BotEventMap>);
        this.listeners.set(event, set);
    }

    onEach(fn: EachListener) {
        const event = '*';
        const set = this.listeners.get(event) ?? new Set();
        set.add(fn);
        this.listeners.set(event, set);
    }

    emit<K extends keyof BotEventMap>(
        event: K,
        ...args: ListenerArgs<K>
    ): void {
        const specific = this.listeners.get(event);
        if (specific) {
            for (const fn of specific) {
                (fn as Listener<K>)(...args);
            }
        }

        const anySet = this.listeners.get('*');
        if (anySet) {
            for (const fn of anySet) {
                (fn as unknown as (e: K, ...a: ListenerArgs<K>) => void)(
                    event,
                    ...args
                );
            }
        }
    }

    events(): (keyof BotEventMap | '*')[] {
        return [...this.listeners.keys()];
    }
}
