import { ChatInfo } from '../dtos/chatInfo';
import { IncomingMessage } from '../dtos/incomingMessage';
import { IncomingInlineQuery } from '../dtos/incomingQuery';
import { ChatContext } from '../entities/context/chatContext';
import { InlineQueryContext } from '../entities/context/inlineQueryContext';
import { MessageContext } from '../entities/context/messageContext';
import { ReplyContext } from '../entities/context/replyContext';
import { IAction, IActionWithState } from './action';
import { IActionState } from './actionState';
import { BotInfo } from './externalAliases';
import { BotResponse } from './response';
import { Milliseconds } from './timeValues';
import { TraceId } from './trace';

export const BotEventType = {
    error: 'error.generic',

    messageRecieved: 'message.recieved',
    messageProcessingStarted: 'message.processingStarted',
    messageProcessingFinished: 'message.processingFinished',

    commandActionExecuting: 'command.actionExecuting',
    commandActionExecuted: 'command.actionExecuted',
    commandActionCaptureStarted: 'command.captionStarted',
    commandActionCaptureAborted: 'command.captionAborted',

    replyActionExecuting: 'reply.actionExecuting',
    replyActionExecuted: 'reply.actionExecuted',

    inlineProcessingStarted: 'inline.processingStarted',
    inlineProcessingFinished: 'inline.processingFinished',
    inlineQueryRecieved: 'inline.queryRecieved',
    inlineActionExecuting: 'inline.actionExecuting',
    inlineActionExecuted: 'inline.actionExecuted',
    inlineProcessingAborting: 'inline.processingAborting',
    inlineProcessingAborted: 'inline.processingAborted',

    scheduledProcessingStarted: 'scheduled.processingStarted',
    scheduledProcessingFinished: 'scheduled.processingFinished',
    scheduledActionExecuting: 'scheduled.actionExecuting',
    scheduledActionExecuted: 'scheduled.actionExecuted',
    scheduledActionCacheValueReturned: 'scheduled.cachedValueReturned',
    scheduledActionCacheValueCreating: 'scheduled.cachedValueCreating',

    apiRequestSending: 'api.requestSending',
    apiRequestSent: 'api.requestSent',

    taskCreated: 'task.created',
    taskRun: 'task.run',

    botStarting: 'bot.starting',
    botStopping: 'bot.stopping'
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
    [BotEventType.commandActionCaptureStarted]: {
        parentMessageId: number;
        chatInfo: ChatInfo;
    };
    [BotEventType.commandActionCaptureAborted]: {
        parentMessageId: number;
        chatInfo: ChatInfo;
    };

    [BotEventType.replyActionExecuting]: {
        action: IAction;
        ctx: ReplyContext<IActionState>;
    };
    [BotEventType.replyActionExecuted]: {
        action: IAction;
        ctx: ReplyContext<IActionState>;
    };

    [BotEventType.inlineProcessingStarted]: {
        botName: string;
    };
    [BotEventType.inlineProcessingFinished]: {
        botName: string;
    };
    [BotEventType.inlineActionExecuting]: {
        action: IAction;
        ctx: InlineQueryContext;
    };
    [BotEventType.inlineActionExecuted]: {
        action: IAction;
        ctx: InlineQueryContext;
    };
    [BotEventType.inlineProcessingAborting]: {
        abortedQuery: IncomingInlineQuery;
        newQuery: IncomingInlineQuery;
    };
    [BotEventType.inlineProcessingAborted]: {
        abortedQuery: IncomingInlineQuery;
    };
    [BotEventType.inlineQueryRecieved]: {
        query: IncomingInlineQuery;
    };

    [BotEventType.scheduledProcessingStarted]: {
        botName: string;
    };
    [BotEventType.scheduledProcessingFinished]: { botName: string };
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

    [BotEventType.taskCreated]: {
        name: string;
        ownerName: string;
        delay?: Milliseconds;
        interval?: Milliseconds;
    };
    [BotEventType.taskRun]: {
        name: string;
        ownerName: string;
        delay?: Milliseconds;
        interval?: Milliseconds;
    };

    [BotEventType.botStarting]: {
        botName: string;
    };
    [BotEventType.botStopping]: {
        botName: string;
    };
};

type FullEventMap<TCustom extends Record<string, unknown>> = BotEventMap &
    TCustom;

type ListenerArgs<
    TMap extends Record<string, unknown>,
    K extends keyof TMap
> = TMap[K] extends undefined
    ? []
    : [
          {
              traceId: TraceId;
          } & TMap[K]
      ];

export type Listener<
    TMap extends Record<string, unknown>,
    K extends keyof TMap
> = (timestamp: number, ...args: ListenerArgs<TMap, K>) => void;

export type EachListener<TMap extends Record<string, unknown> = BotEventMap> = (
    event: keyof TMap & string,
    timestamp: number,
    data: unknown
) => void;

export class TypedEventEmitter<
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    TCustomEvents extends Record<string, unknown> = {}
> {
    private readonly listeners = new Map<
        keyof FullEventMap<TCustomEvents> | '*',
        Set<
            | Listener<
                  FullEventMap<TCustomEvents>,
                  keyof FullEventMap<TCustomEvents>
              >
            | EachListener<FullEventMap<TCustomEvents>>
        >
    >();

    on<K extends keyof FullEventMap<TCustomEvents>>(
        event: K,
        fn: Listener<FullEventMap<TCustomEvents>, K>
    ) {
        const set = this.listeners.get(event) ?? new Set();
        set.add(
            fn as Listener<
                FullEventMap<TCustomEvents>,
                keyof FullEventMap<TCustomEvents>
            >
        );
        this.listeners.set(event, set);
    }

    onEach(fn: EachListener<FullEventMap<TCustomEvents>>) {
        const event = '*';
        const set = this.listeners.get(event) ?? new Set();
        set.add(fn);
        this.listeners.set(event, set);
    }

    emit<K extends keyof FullEventMap<TCustomEvents>>(
        event: K,
        ...args: ListenerArgs<FullEventMap<TCustomEvents>, K>
    ): void {
        const timestamp = Date.now();
        const specific = this.listeners.get(event);
        if (specific) {
            for (const fn of specific) {
                (fn as Listener<FullEventMap<TCustomEvents>, K>)(
                    timestamp,
                    ...args
                );
            }
        }

        const anySet = this.listeners.get('*');
        if (anySet) {
            for (const fn of anySet) {
                (
                    fn as unknown as (
                        e: K,
                        t: number,
                        ...a: ListenerArgs<FullEventMap<TCustomEvents>, K>
                    ) => void
                )(event, timestamp, ...args);
            }
        }
    }

    events(): (keyof FullEventMap<TCustomEvents> | '*')[] {
        return [...this.listeners.keys()];
    }
}
