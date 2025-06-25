import { TelegramEmoji } from 'telegraf/types';
import { ChatInfo } from '../../dtos/chatInfo';
import { ReplyInfo } from '../../dtos/replyInfo';
import { ImageMessage } from '../../dtos/responses/imageMessage';
import { Reaction } from '../../dtos/responses/reaction';
import { TextMessage } from '../../dtos/responses/textMessage';
import { VideoMessage } from '../../dtos/responses/videoMessage';
import { IActionState } from '../../types/actionState';
import { IScopedLogger } from '../../types/logger';
import {
    TextMessageSendingOptions,
    MessageSendingOptions
} from '../../types/messageSendingOptions';
import {
    MessageTypeValue,
    TelegrafContextMessage
} from '../../types/messageTypes';
import { BotResponse } from '../../types/response';
import { IScheduler } from '../../types/scheduler';
import { IStorageClient } from '../../types/storage';
import { TraceId } from '../../types/trace';
import { ReplyCaptureAction } from '../actions/replyCaptureAction';
import { resolve } from 'path';

export class ReplyContext<TParentActionState extends IActionState> {
    action!: ReplyCaptureAction<TParentActionState>;

    /** Storage client instance for the bot executing this action. */
    readonly storage: IStorageClient;
    /** Scheduler instance for the bot executing this action */
    readonly scheduler: IScheduler;

    /** Trace id of a action execution. */
    traceId!: TraceId;
    /** Name of a bot that executes this action. */
    botName!: string;
    /** Logger instance for the bot executing this action */
    logger!: IScopedLogger;

    /** Ordered collection of responses to be processed  */
    responses: BotResponse[] = [];
    /** Chat information. */
    chatInfo!: ChatInfo;
    /** Collection of Regexp match results on a message that triggered this action. Will be empty if trigger is not a Regexp. */
    matchResults!: RegExpExecArray[];
    /** Id of a message that triggered this action. */
    replyMessageId!: number | undefined;
    /** Id of a message that triggered this action. */
    messageId!: number;
    /** Type of message being received */
    messageType!: MessageTypeValue;
    /** Text of a message that triggered this action. */
    messageText!: string;
    /** Id of a user that sent a message that triggered this action. */
    fromUserId: number | undefined;
    /** Name of a user that sent a message that triggered this action. */
    fromUserName!: string;
    /** Message object recieved from Telegram */
    messageUpdateObject!: TelegrafContextMessage;

    isInitialized = false;

    constructor(storage: IStorageClient, scheduler: IScheduler) {
        this.storage = storage;
        this.scheduler = scheduler;
    }

    private replyWithText(
        text: string,
        quote: boolean,
        options?: TextMessageSendingOptions
    ) {
        const quotedPart =
            this.matchResults.length != 0
                ? this.matchResults[0][1]
                : this.messageText;

        const response = new TextMessage(
            text,
            this.chatInfo,
            this.traceId,
            this.action,
            new ReplyInfo(this.messageId, quote ? quotedPart : undefined),
            options
        );

        this.responses.push(response);
    }

    private replyWithImage(
        name: string,
        quote: boolean,
        options?: MessageSendingOptions
    ) {
        const quotedPart =
            this.matchResults.length != 0
                ? this.matchResults[0][1]
                : this.messageText;

        const response = new ImageMessage(
            { source: resolve(`./content/${name}.png`) },
            this.chatInfo,
            this.traceId,
            this.action,
            new ReplyInfo(this.messageId, quote ? quotedPart : undefined),
            options
        );

        this.responses.push(response);
    }

    private replyWithVideo(
        name: string,
        quote: boolean,
        options?: MessageSendingOptions
    ) {
        const quotedPart =
            this.matchResults.length != 0
                ? this.matchResults[0][1]
                : this.messageText;

        const response = new VideoMessage(
            { source: resolve(`./content/${name}.mp4`) },
            this.chatInfo,
            this.traceId,
            this.action,
            new ReplyInfo(this.messageId, quote ? quotedPart : undefined),
            options
        );

        this.responses.push(response);
    }

    /**
     * Stops capturing replies and removes this action
     */
    stopCapture() {
        this.action.abortController.abort();
    }

    /**
     * Collection of actions that can be done as a reply to a message that triggered this action
     */
    reply = {
        /**
         * Collection of actions that can be done as a reply to a message, quoting the part that triggered this action
         * If regex is matched, first match will be quoted
         */
        andQuote: {
            /**
             * Reply with text message to message that triggered this action after action execution is finished.
             * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
             * @param text Message contents.
             * @param options Message sending option.
             */
            withText: (text: string, options?: TextMessageSendingOptions) =>
                this.replyWithText(text, true, options),
            /**
             * Reply with image message to message that triggered this action after action execution is finished.
             * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
             * @param text Message contents.
             * @param options Message sending option.
             */
            withImage: (name: string, options?: MessageSendingOptions) =>
                this.replyWithImage(name, true, options),

            /**
             * Reply with video/gif message to message that triggered this action after action execution is finished.
             * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
             * @param text Message contents.
             * @param options Message sending option.
             */
            withVideo: (name: string, options?: MessageSendingOptions) =>
                this.replyWithVideo(name, true, options)
        },

        /**
         * Reply with text message to message that triggered this action after action execution is finished.
         * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
         * @param text Message contents.
         * @param options Message sending option.
         */
        withText: (text: string, options?: TextMessageSendingOptions) =>
            this.replyWithText(text, false, options),
        /**
         * Reply with image message to message that triggered this action after action execution is finished.
         * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
         * @param text Message contents.
         * @param options Message sending option.
         */
        withImage: (name: string, options?: MessageSendingOptions) =>
            this.replyWithImage(name, false, options),

        /**
         * Reply with video/gif message to message that triggered this action after action execution is finished.
         * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
         * @param text Message contents.
         * @param options Message sending option.
         */
        withVideo: (name: string, options?: MessageSendingOptions) =>
            this.replyWithVideo(name, false, options),

        /**
         * React to the message that triggered this action after action execution is finished.
         * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
         * @param emoji Telegram emoji to react with.
         */
        withReaction: (emoji: TelegramEmoji) => {
            this.responses.push(
                new Reaction(
                    this.traceId,
                    this.chatInfo,
                    this.messageId,
                    emoji,
                    this.action
                )
            );
        }
    };
}
