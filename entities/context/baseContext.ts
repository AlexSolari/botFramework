import { ChatInfo } from '../../dtos/chatInfo';
import { IAction, IActionWithState } from '../../types/action';
import { IActionState } from '../../types/actionState';
import { ICaptureController } from '../../types/capture';
import { CommandTrigger } from '../../types/commandTrigger';
import { IScopedLogger } from '../../types/logger';
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
    | 'logger'
    | 'responses'
    | 'traceId'
    | 'botName';

export abstract class BaseContextInternal<TAction extends IAction> {
    isInitialized = false;
    private _responses: BotResponse[] = [];

    action!: TAction;

    /** Storage client instance for the bot executing this action. */
    readonly storage: IStorageClient;
    /** Scheduler instance for the bot executing this action */
    readonly scheduler: IScheduler;
    logger!: IScopedLogger;
    /** Trace id of a action execution. */
    traceId!: TraceId;
    /** Name of a bot that executes this action. */
    botName!: string;
    /** Chat information. */
    chatInfo!: ChatInfo;
    get actionKey() {
        return this.action.key;
    }

    /** Ordered collection of responses to be processed  */
    public get responses(): BotResponse[] {
        return this._responses;
    }
    public set responses(value: BotResponse[]) {
        this._responses = value;
    }

    constructor(storage: IStorageClient, scheduler: IScheduler) {
        this.storage = storage;
        this.scheduler = scheduler;
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
    async loadStateOf<TAnotherActionState extends IActionState>(
        action: IActionWithState<TAnotherActionState>
    ) {
        const allStates = await this.storage.load(action.key);
        const stateForChat = allStates[this.chatInfo.id];

        if (!stateForChat) {
            return Object.freeze(action.stateConstructor());
        }

        return Object.freeze(stateForChat as TAnotherActionState);
    }
}
