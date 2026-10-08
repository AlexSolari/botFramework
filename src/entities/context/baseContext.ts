import { ChatInfo } from '../../dtos/chatInfo';
import { copyPersistentData } from '../../helpers/copyPersistentData';
import { BotApiClient } from '../../services/telegram/botApiClient';
import { IAction, IActionWithState } from '../../types/action';
import { IActionState } from '../../types/actionState';
import { TypedEventEmitter } from '../../types/events';
import {
    ContinueReplyCaptureOptions,
    IPostSendOperationController,
    PersistentReplyCaptureOptions,
    ReplyCaptureOptions
} from '../../types/postSendOperations';
import { PersistentReplyCaptureActionInternal } from '../actions/persistentReplyCaptureAction';
import { BotResponse, IReplyResponse } from '../../types/response';
import { IScheduler } from '../../types/scheduler';
import { IStorageClient } from '../../types/storage';
import { Milliseconds } from '../../types/timeValues';
import { TraceId } from '../../types/trace';

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

    /** Telegram API client instance for the bot executing this action. */
    readonly telegramApiClient: BotApiClient;

    get actionKey() {
        return this.action.key;
    }

    constructor(
        storage: IStorageClient,
        scheduler: IScheduler,
        eventEmitter: TypedEventEmitter,
        telegramApiClient: BotApiClient,
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
        this.telegramApiClient = telegramApiClient;
        this.observability = {
            eventEmitter,
            traceId
        };
    }

    protected createPostSendOperationController(
        response: IReplyResponse
    ): IPostSendOperationController {
        return {
            captureReplies: (
                options:
                    | ReplyCaptureOptions<IActionState>
                    | PersistentReplyCaptureOptions<object>
                    | ContinueReplyCaptureOptions
            ) => {
                if ('continueCapture' in options) {
                    if (
                        !(
                            this.action instanceof
                            PersistentReplyCaptureActionInternal
                        )
                    ) {
                        throw new Error(
                            'continueCapture can only be used in a persistent capture handler.'
                        );
                    }

                    response.postSendOperations.push({
                        kind: 'continuePersistentReplies',
                        capture: this.action
                    });

                    return;
                }

                if ('persistent' in options) {
                    response.postSendOperations.push({
                        kind: 'capturePersistentReplies',
                        definition: options.persistent,
                        data: copyPersistentData(
                            options.data,
                            options.persistent.name
                        )
                    });

                    return;
                }

                response.postSendOperations.push({
                    kind: 'captureReplies',
                    trigger: options.trigger,
                    handler: options.handler,
                    abortController:
                        options.abortController ?? new AbortController(),
                    action: this.action
                });
            },
            pin: () => {
                response.postSendOperations.push({
                    kind: 'pin'
                });
            },
            deleteAfter: (timeout: number) => {
                response.postSendOperations.push({
                    kind: 'deleteAfterTimeout',
                    timeout: timeout as Milliseconds
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
        const stateForChat = {
            ...action.stateConstructor(),
            ...allStates[this.chatInfo.id]
        };

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
