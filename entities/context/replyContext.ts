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
import { ReplyCaptureAction } from '../actions/replyCaptureAction';
import { resolve } from 'path';
import {
    BaseContextInternal,
    BaseContextPropertiesToOmit
} from './baseContext';
import { UserInfo } from '../../dtos/userInfo';
import { MessageInfo } from '../../dtos/messageInfo';
import { TelegramUser, TelegramEmoji } from '../../types/externalAliases';

export type ReplyContext<TActionState extends IActionState> = Omit<
    ReplyContextInternal<TActionState>,
    | BaseContextPropertiesToOmit
    | 'messageId'
    | 'startCooldown'
    | 'customCooldown'
>;

export class ReplyContextInternal<
    TParentActionState extends IActionState
> extends BaseContextInternal<ReplyCaptureAction<TParentActionState>> {
    /** Collection of Regexp match results on a message that triggered this action. Will be empty if trigger is not a Regexp. */
    matchResults!: RegExpExecArray[];
    /** Id of a message that triggered this action. */
    replyMessageId!: number | undefined;
    /** Information about the user that triggered this action */
    userInfo!: UserInfo;
    /** Information about the message that triggered this action */
    messageInfo!: MessageInfo;
    /** Bot info from Telegram */
    botInfo!: TelegramUser;

    isInitialized = false;

    private getQuotePart(quote: boolean | string) {
        if (typeof quote != 'boolean') return quote;

        return this.matchResults.length != 0
            ? this.matchResults[0][1]
            : this.messageInfo.text;
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
            new ReplyInfo(this.messageInfo.id, quote ? quotedPart : undefined),
            options
        );

        this.responses.push(response);

        return this.createCaptureController(response);
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
            new ReplyInfo(this.messageInfo.id, quote ? quotedPart : undefined),
            options
        );

        this.responses.push(response);

        return this.createCaptureController(response);
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
            new ReplyInfo(this.messageInfo.id, quote ? quotedPart : undefined),
            options
        );

        this.responses.push(response);

        return this.createCaptureController(response);
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
            ) => {
                return this.replyWithText(text, quote ?? true, options);
            },
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
            ) => {
                return this.replyWithImage(name, quote ?? true, options);
            },

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
            ) => {
                return this.replyWithVideo(name, quote ?? true, options);
            }
        },

        /**
         * Reply with text message to message that triggered this action after action execution is finished.
         * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
         * @param text Message contents.
         * @param options Message sending option.
         */
        withText: (text: string, options?: TextMessageSendingOptions) => {
            return this.replyWithText(text, false, options);
        },
        /**
         * Reply with image message to message that triggered this action after action execution is finished.
         * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
         * @param text Message contents.
         * @param options Message sending option.
         */
        withImage: (name: string, options?: MessageSendingOptions) => {
            return this.replyWithImage(name, false, options);
        },

        /**
         * Reply with video/gif message to message that triggered this action after action execution is finished.
         * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
         * @param text Message contents.
         * @param options Message sending option.
         */
        withVideo: (name: string, options?: MessageSendingOptions) => {
            return this.replyWithVideo(name, false, options);
        },

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
                    this.messageInfo.id,
                    emoji,
                    this.action
                )
            );
        }
    };
}
