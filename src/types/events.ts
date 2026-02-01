import { ChatInfo } from '../dtos/chatInfo';
import { IncomingMessage } from '../dtos/incomingMessage';
import { IncomingInlineQuery } from '../dtos/incomingQuery';
import { CommandAction } from '../entities/actions/commandAction';
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
    beforeActionsExecuting: 'message.beforeActionsExecuting',

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

type ListenerArgs<K extends keyof BotEventMap> =
    BotEventMap[K] extends undefined
        ? []
        : [
              {
                  traceId: TraceId;
              } & BotEventMap[K]
          ];

export type Listener<K extends keyof BotEventMap> = (
    timestamp: number,
    ...args: ListenerArgs<K>
) => void;

export type EachListener = (
    event: BotEventTypeKeys,
    timestamp: number,
    data: unknown
) => void;

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
        const timestamp = Date.now();
        const specific = this.listeners.get(event);
        if (specific) {
            for (const fn of specific) {
                (fn as Listener<K>)(timestamp, ...args);
            }
        }

        const anySet = this.listeners.get('*');
        if (anySet) {
            for (const fn of anySet) {
                (
                    fn as unknown as (
                        e: K,
                        t: number,
                        ...a: ListenerArgs<K>
                    ) => void
                )(event, timestamp, ...args);
            }
        }
    }

    events(): (keyof BotEventMap | '*')[] {
        return [...this.listeners.keys()];
    }
}
