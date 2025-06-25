import { resolve } from 'path';
import { IStorageClient } from '../../types/storage';
import { ImageMessage } from '../../dtos/responses/imageMessage';
import { TextMessage } from '../../dtos/responses/textMessage';
import { VideoMessage } from '../../dtos/responses/videoMessage';
import { UnpinResponse } from '../../dtos/responses/unpin';
import {
    MessageSendingOptions,
    TextMessageSendingOptions
} from '../../types/messageSendingOptions';
import { IActionWithState } from '../../types/action';
import { IActionState } from '../../types/actionState';
import { BotResponse, IReplyResponse } from '../../types/response';
import { Milliseconds } from '../../types/timeValues';
import { DelayResponse } from '../../dtos/responses/delay';
import { ChatInfo } from '../../dtos/chatInfo';
import { IScopedLogger } from '../../types/logger';
import { IScheduler } from '../../types/scheduler';
import { TraceId } from '../../types/trace';
import { ICaptureController } from '../../types/capture';
import { CommandTrigger } from '../../types/commandTrigger';
import { ReplyContext } from './replyContext';

/**
 * Context of action executed in chat.
 */
export class ChatContext<TActionState extends IActionState> {
    action!: IActionWithState<TActionState>;

    /** Storage client instance for the bot executing this action. */
    readonly storage: IStorageClient;
    /** Logger instance for the bot executing this action */
    /** Scheduler instance for the bot executing this action */
    readonly scheduler: IScheduler;

    logger!: IScopedLogger;
    /** Trace id of a action execution. */
    traceId!: TraceId;
    /** Name of a bot that executes this action. */
    botName!: string;
    /** Chat information. */
    chatInfo!: ChatInfo;
    /** Ordered collection of responses to be processed  */
    responses: BotResponse[] = [];

    isInitialized = false;

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
                    replyContext: ReplyContext<TActionState>
                ) => Promise<void>,
                abortController: AbortController
            ) => {
                response.captures.push({
                    trigger,
                    handler,
                    abortController,
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

    /**
     * Collection of actions that send something to chat as a standalone message.
     */
    send = {
        /**
         * Sends text message to chat after action execution is finished.
         * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
         * @param text Message contents.
         * @param options Message sending option.
         */
        text: (text: string, options?: TextMessageSendingOptions) => {
            const response = new TextMessage(
                text,
                this.chatInfo,
                this.traceId,
                this.action,
                undefined,
                options
            );

            this.responses.push(response);

            return this.createCaptureController(response);
        },

        /**
         * Sends image message to chat after action execution is finished.
         * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
         * @param name Message contents.
         * @param options Message sending option.
         */
        image: (name: string, options?: MessageSendingOptions) => {
            const response = new ImageMessage(
                { source: resolve(`./content/${name}.png`) },
                this.chatInfo,
                this.traceId,
                this.action,
                undefined,
                options
            );

            this.responses.push(response);

            return this.createCaptureController(response);
        },

        /**
         * Sends video/gif message to chat after action execution is finished.
         * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
         * @param name Message contents.
         * @param options Message sending option.
         */
        video: (name: string, options?: MessageSendingOptions) => {
            const response = new VideoMessage(
                { source: resolve(`./content/${name}.mp4`) },
                this.chatInfo,
                this.traceId,
                this.action,
                undefined,
                options
            );

            this.responses.push(response);

            return this.createCaptureController(response);
        }
    };

    /**
     * Unpins message after action execution is finished.
     * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
     * @param messageId Message id.
     */
    unpinMessage(messageId: number) {
        this.responses.push(
            new UnpinResponse(
                messageId,
                this.chatInfo,
                this.traceId,
                this.action
            )
        );
    }

    /**
     * Delays next responses by specified amount of time.
     * @param delay Delay in milliseconds.
     */
    wait(delay: Milliseconds) {
        this.responses.push(
            new DelayResponse(delay, this.chatInfo, this.traceId, this.action)
        );
    }
}
