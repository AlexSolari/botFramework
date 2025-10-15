import { resolve } from 'path';
import { IActionState } from '../../types/actionState';
import { ImageMessage } from '../../dtos/responses/imageMessage';
import { Reaction } from '../../dtos/responses/reaction';
import { TextMessage } from '../../dtos/responses/textMessage';
import { VideoMessage } from '../../dtos/responses/videoMessage';
import { ChatContextInternal } from './chatContext';
import {
    MessageSendingOptions,
    TextMessageSendingOptions
} from '../../types/messageSendingOptions';
import { ReplyInfo } from '../../dtos/replyInfo';
import { CommandAction } from '../actions/commandAction';
import { Seconds } from '../../types/timeValues';
import { BaseContextPropertiesToOmit } from './baseContext';
import { MessageInfo } from '../../dtos/messageInfo';
import { UserInfo } from '../../dtos/userInfo';
import { BotInfo, TelegramEmoji } from '../../types/externalAliases';

export type MessageContext<TActionState extends IActionState> = Omit<
    MessageContextInternal<TActionState>,
    BaseContextPropertiesToOmit | 'startCooldown' | 'customCooldown'
>;

/**
 * Context of action executed in chat, in response to a message
 */
export class MessageContextInternal<
    TActionState extends IActionState
> extends ChatContextInternal<TActionState, CommandAction<TActionState>> {
    /** Information about the user that triggered this action */
    userInfo!: UserInfo;
    /** Information about the message that triggered this action */
    messageInfo!: MessageInfo;
    /** Collection of Regexp match results on a message that triggered this action. Will be empty if trigger is not a Regexp. */
    matchResults: RegExpMatchArray[] = [];
    /** Indicates if cooldown should be started after action is executed. Set to `true` by default. */
    startCooldown: boolean = true;
    /** Bot info from Telegram */
    botInfo!: BotInfo;
    customCooldown: Seconds | undefined;

    private getQuotePart(quote: boolean | string) {
        if (typeof quote != 'boolean') return quote;

        return this.matchResults.length == 0
            ? this.messageInfo.text
            : this.matchResults[0][1];
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

    skipCooldown() {
        this.startCooldown = false;
    }

    startCustomCooldown(customCooldown: Seconds) {
        this.startCooldown = true;
        this.customCooldown = customCooldown;
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
                    this.messageInfo.id,
                    emoji,
                    this.action
                )
            );
        }
    };
}
