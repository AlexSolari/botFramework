import { ChatInfo } from '../../dtos/chatInfo';
import { IAction, IActionWithState } from '../../types/action';
import { IActionState } from '../../types/actionState';
import { ICaptureController } from '../../types/capture';
import { CommandTrigger } from '../../types/commandTrigger';
import { TypedEventEmitter } from '../../types/events';
import { BotResponse, IReplyResponse } from '../../types/response';
import { IScheduler } from '../../types/scheduler';
import { IStorageClient } from '../../types/storage';
import { TraceId } from '../../types/trace';
import { ReplyContext } from './replyContext';

export type BaseContextPropertiesToOmit =
    | 'action'
    | 'isInitialized'
    | 'storage'
    | 'scheduler'
    | 'responses';

export abstract class BaseContextInternal<TAction extends IAction> {
    readonly responses: BotResponse[] = [];
    readonly action: TAction;
    /** Storage client instance for the bot executing this action. */
    readonly storage: IStorageClient;
    /** Scheduler instance for the bot executing this action */
    readonly scheduler: IScheduler;
    /** Name of a bot that executes this action. */
    readonly botName: string;
    /** Chat information. */
    readonly chatInfo: ChatInfo;

    readonly observability: {
        /** Event emitter for emitting events related to action execution. */
        eventEmitter: TypedEventEmitter;
        /** Trace id of a action execution. */
        traceId: TraceId;
    };

    get actionKey() {
        return this.action.key;
    }

    constructor(
        storage: IStorageClient,
        scheduler: IScheduler,
        eventEmitter: TypedEventEmitter,
        action: TAction,
        chatInfo: ChatInfo,
        traceId: TraceId,
        botName: string
    ) {
        this.storage = storage;
        this.scheduler = scheduler;
        this.botName = botName;
        this.action = action;
        this.chatInfo = chatInfo;
        this.observability = {
            eventEmitter,
            traceId
        };
    }

    protected createCaptureController(
        response: IReplyResponse
    ): ICaptureController {
        return {
            captureReplies: (
                trigger: CommandTrigger[],
                handler: (
                    replyContext: ReplyContext<IActionState>
                ) => Promise<void>,
                abortController?: AbortController
            ) => {
                response.captures.push({
                    trigger,
                    handler,
                    abortController: abortController ?? new AbortController(),
                    action: this.action
                });
            }
        };
    }

    /**
     * Loads state of another action for current chat.
     * @param action Action to load state of.
     * @template TAnotherActionState - Type of a state that is used by another action.
     */
    loadStateOf<TAnotherActionState extends IActionState>(
        action: IActionWithState<TAnotherActionState>
    ) {
        const allStates = this.storage.load(action);
        const stateForChat =
            allStates[this.chatInfo.id] ?? action.stateConstructor();

        return Object.freeze(structuredClone(stateForChat));
    }

    /**
     * Mutates state of another action for current chat.
     * @param action Action to load state of.
     * @param mutation Fuction that mutates the state.
     * @template TAnotherActionState - Type of a state that is used by another action.
     */
    async updateStateOf<TAnotherActionState extends IActionState>(
        action: IActionWithState<TAnotherActionState>,
        mutation: (state: TAnotherActionState) => Promise<void>
    ) {
        await this.storage.updateStateFor(action, this.chatInfo.id, mutation);
    }
}
