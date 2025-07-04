import { TelegramEmoji } from 'telegraf/types';
import { ReplyInfo } from '../../dtos/replyInfo';
import { ImageMessage } from '../../dtos/responses/imageMessage';
import { Reaction } from '../../dtos/responses/reaction';
import { TextMessage } from '../../dtos/responses/textMessage';
import { VideoMessage } from '../../dtos/responses/videoMessage';
import { IActionState } from '../../types/actionState';
import {
    TextMessageSendingOptions,
    MessageSendingOptions
} from '../../types/messageSendingOptions';
import {
    MessageTypeValue,
    TelegrafContextMessage
} from '../../types/messageTypes';
import { IScheduler } from '../../types/scheduler';
import { IStorageClient } from '../../types/storage';
import { ReplyCaptureAction } from '../actions/replyCaptureAction';
import { resolve } from 'path';
import { BaseContext } from './baseContext';

export class ReplyContext<
    TParentActionState extends IActionState
> extends BaseContext<ReplyCaptureAction<TParentActionState>> {
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
        super(storage, scheduler);
    }

    private getQuotePart(quote: boolean | string) {
        return typeof quote == 'boolean'
            ? this.matchResults.length != 0
                ? this.matchResults[0][1]
                : this.messageText
            : quote;
    }

    private replyWithText(
        text: string,
        quote: boolean | string,
        options?: TextMessageSendingOptions
    ) {
        const quotedPart = this.getQuotePart(quote);

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
        quote: boolean | string,
        options?: MessageSendingOptions
    ) {
        const quotedPart = this.getQuotePart(quote);

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
        quote: boolean | string,
        options?: MessageSendingOptions
    ) {
        const quotedPart = this.getQuotePart(quote);

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
            withText: (
                text: string,
                quote?: string,
                options?: TextMessageSendingOptions
            ) => this.replyWithText(text, quote ?? true, options),
            /**
             * Reply with image message to message that triggered this action after action execution is finished.
             * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
             * @param text Message contents.
             * @param options Message sending option.
             */
            withImage: (
                name: string,
                quote?: string,
                options?: MessageSendingOptions
            ) => this.replyWithImage(name, quote ?? true, options),

            /**
             * Reply with video/gif message to message that triggered this action after action execution is finished.
             * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
             * @param text Message contents.
             * @param options Message sending option.
             */
            withVideo: (
                name: string,
                quote?: string,
                options?: MessageSendingOptions
            ) => this.replyWithVideo(name, quote ?? true, options)
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
