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
import { IActionWithState } from '../../types/actionWithState';
import { IActionState } from '../../types/actionState';
import { BotResponse } from '../../types/response';
import { Milliseconds } from '../../types/timeValues';
import { DelayResponse } from '../../dtos/responses/delay';
import { ChatInfo } from '../../dtos/chatInfo';
import { ILogger } from '../../types/logger';
import { IScheduler } from '../../types/scheduler';
import { TraceId } from '../../types/trace';

/**
 * Context of action executed in chat.
 */
export class ChatContext<TActionState extends IActionState> {
    protected action!: IActionWithState<TActionState>;

    /** Storage client instance for the bot executing this action. */
    readonly storage!: IStorageClient;
    /** Logger instance for the bot executing this action */
    readonly logger!: ILogger;
    /** Scheduler instance for the bot executing this action */
    readonly scheduler!: IScheduler;

    /** Trace id of a action execution. */
    traceId!: TraceId;
    /** Name of a bot that executes this action. */
    botName!: string;
    /** Chat information. */
    chatInfo!: ChatInfo;
    /** Ordered collection of responses to be processed  */
    responses: BotResponse[] = [];

    isInitialized = false;

    constructor(
        storage: IStorageClient,
        logger: ILogger,
        scheduler: IScheduler
    ) {
        this.storage = storage;
        this.logger = logger;
        this.scheduler = scheduler;
    }

    initializeChatContext(
        botName: string,
        action: IActionWithState<TActionState>,
        chatInfo: ChatInfo,
        traceId: TraceId
    ) {
        this.botName = botName;
        this.action = action;
        this.chatInfo = chatInfo;
        this.traceId = traceId;

        this.isInitialized = true;
        this.responses = [];

        return this;
    }

    /**
     * Sends text message to chat after action execution is finished.
     * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
     * @param text Message contents.
     * @param options Message sending option.
     */
    sendTextToChat(text: string, options?: TextMessageSendingOptions) {
        this.responses.push(
            new TextMessage(
                text,
                this.chatInfo,
                undefined,
                this.traceId,
                this.action,
                options
            )
        );
    }

    /**
     * Sends image message to chat after action execution is finished.
     * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
     * @param name Message contents.
     * @param options Message sending option.
     */
    sendImageToChat(name: string, options?: MessageSendingOptions) {
        const filePath = `./content/${name}.png`;
        this.responses.push(
            new ImageMessage(
                { source: resolve(filePath) },
                this.chatInfo,
                undefined,
                this.traceId,
                this.action,
                options
            )
        );
    }

    /**
     * Sends video/gif message to chat after action execution is finished.
     * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
     * @param name Message contents.
     * @param options Message sending option.
     */
    sendVideoToChat(name: string, options?: MessageSendingOptions) {
        const filePath = `./content/${name}.mp4`;
        this.responses.push(
            new VideoMessage(
                { source: resolve(filePath) },
                this.chatInfo,
                undefined,
                this.traceId,
                this.action,
                options
            )
        );
    }

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
