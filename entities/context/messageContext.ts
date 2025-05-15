import { resolve } from 'path';
import { TelegramEmoji } from 'telegraf/types';
import { IStorageClient } from '../../types/storage';
import { IActionState } from '../../types/actionState';
import { ImageMessage } from '../../dtos/responses/imageMessage';
import { Reaction } from '../../dtos/responses/reaction';
import { TextMessage } from '../../dtos/responses/textMessage';
import { VideoMessage } from '../../dtos/responses/videoMessage';
import { ActionStateBase } from '../states/actionStateBase';
import { ChatContext } from './chatContext';
import { IncomingMessage } from '../../dtos/incomingMessage';
import {
    MessageSendingOptions,
    TextMessageSendingOptions
} from '../../types/messageSendingOptions';
import { IActionWithState, ActionKey } from '../../types/actionWithState';
import { MessageTypeValue } from '../../types/messageTypes';
import { ILogger } from '../../types/logger';
import { IScheduler } from '../../types/scheduler';
/**
 * Context of action executed in chat, in response to a message
 */
export class MessageContext<
    TActionState extends IActionState
> extends ChatContext<TActionState> {
    /** Id of a message that triggered this action. */
    messageId!: number;
    /** Text of a message that triggered this action. */
    messageText!: string;
    /** Collection of Regexp match results on a message that triggered this action. Will be empty if trigger is not a Regexp. */
    matchResults: RegExpMatchArray[] = [];
    /** Id of a user that sent a message that triggered this action. */
    fromUserId: number | undefined;
    /** Indicates if cooldown should be started after action is executed. Set to `true` by default. */
    startCooldown: boolean = true;
    /** Name of a user that sent a message that triggered this action. */
    fromUserName!: string;
    /** Type of message being received */
    messageType!: MessageTypeValue;

    constructor(
        storage: IStorageClient,
        logger: ILogger,
        scheduler: IScheduler
    ) {
        super(storage, logger, scheduler);
    }

    initializeMessageContext(
        botName: string,
        action: IActionWithState<TActionState>,
        message: IncomingMessage
    ) {
        this.messageId = message.message_id;
        this.messageText = message.text ?? '';
        this.messageType = message.type;
        this.fromUserId = message.from?.id;
        this.fromUserName =
            (message.from?.first_name ?? 'Unknown user') +
            (message.from?.last_name ? ` ${message.from.last_name}` : '');

        this.matchResults = [];
        this.startCooldown = true;

        return this.initializeChatContext(
            botName,
            action,
            message.chatInfo,
            message.traceId
        );
    }

    /**
     * Loads state of another action. Changes to the loaded state will no affect actual state of other action.
     * @param commandName Name of an action to load state of.
     * @template TAnotherActionState - Type of a state that is used by another action.
     */
    async loadStateOf<TAnotherActionState extends IActionState>(
        commandName: string
    ): Promise<TAnotherActionState> {
        const storageKey = `command:${commandName.replace(
            '.',
            '-'
        )}` as ActionKey;
        const allStates = await this.storage.load(storageKey);
        const stateForChat = allStates[this.chatInfo.id];

        if (!stateForChat) {
            return new ActionStateBase() as TAnotherActionState;
        }

        return stateForChat as TAnotherActionState;
    }

    /**
     * Reply with text message to message that triggered this action after action execution is finished.
     * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
     * @param text Message contents.
     * @param options Message sending option.
     */
    replyWithText(text: string, options?: TextMessageSendingOptions) {
        this.responses.push(
            new TextMessage(
                text,
                this.chatInfo,
                this.messageId,
                this.traceId,
                this.action,
                options
            )
        );
    }

    /**
     * Reply with image message to message that triggered this action after action execution is finished.
     * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
     * @param text Message contents.
     * @param options Message sending option.
     */
    replyWithImage(name: string, options?: MessageSendingOptions) {
        const filePath = `./content/${name}.png`;
        this.responses.push(
            new ImageMessage(
                { source: resolve(filePath) },
                this.chatInfo,
                this.messageId,
                this.traceId,
                this.action,
                options
            )
        );
    }

    /**
     * Reply with video/gif message to message that triggered this action after action execution is finished.
     * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
     * @param text Message contents.
     * @param options Message sending option.
     */
    replyWithVideo(name: string, options?: MessageSendingOptions) {
        const filePath = `./content/${name}.mp4`;
        this.responses.push(
            new VideoMessage(
                { source: resolve(filePath) },
                this.chatInfo,
                this.messageId,
                this.traceId,
                this.action,
                options
            )
        );
    }

    /**
     * React to the message that triggered this action after action execution is finished.
     * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
     * @param emoji Telegram emoji to react with.
     */
    react(emoji: TelegramEmoji) {
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
}
