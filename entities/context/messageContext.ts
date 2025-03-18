import { resolve } from 'path';
import { IBotApiInteractions } from '../../services/telegramApi';
import { TelegramEmoji } from 'telegraf/types';
import { IStorageClient } from '../../types/storage';
import { IActionState } from '../../types/actionState';
import { ImageMessage } from '../responses/imageMessage';
import { Reaction } from '../responses/reaction';
import { TextMessage } from '../responses/textMessage';
import { VideoMessage } from '../responses/videoMessage';
import { ActionStateBase } from '../states/actionStateBase';
import { ChatContext } from './chatContext';
import {
    MessageSendingOptions,
    TextMessageSendingOptions
} from '../../types/messageSendingOptions';

/**
 * Context of action executed in chat, in response to a message
 */
export class MessageContext<
    TActionState extends IActionState
> extends ChatContext {
    updateActions: Array<(state: TActionState) => void> = [];
    /** Id of a message that triggered this action. */
    messageId: number;
    /** Text of a message that triggered this action. */
    messageText: string;
    /** Collection of Regexp match results on a message that triggered this action. Will be empty if trigger is not a Regexp. */
    matchResults: RegExpMatchArray[] = [];
    /** Id of a user that sent a message that triggered this action. */
    fromUserId: number | undefined;
    /** Indicates if cooldown should be started after action is executed. Set to `true` by default. */
    startCooldown: boolean = true;
    /** Name of a user that sent a message that triggered this action. */
    fromUserName: string;

    constructor(
        botName: string,
        scheduledKey: string,
        interactions: IBotApiInteractions,
        chatId: number,
        chatName: string,
        messageId: number,
        messageText: string,
        fromUserId: number | undefined,
        traceId: number | string,
        fromUserName: string,
        storage: IStorageClient
    ) {
        super(
            botName,
            scheduledKey,
            interactions,
            chatId,
            chatName,
            traceId,
            storage
        );

        this.messageId = messageId;
        this.messageText = messageText;
        this.fromUserId = fromUserId;
        this.fromUserName = fromUserName;
    }

    /**
     * Loads state of another action. Changes to the loaded state will no affect actual state of other action.
     * @param commandName Name of an action to load state of.
     * @template TAnotherActionState - Type of a state that is used by another action.
     */
    async loadStateOf<TAnotherActionState extends IActionState>(
        commandName: string
    ): Promise<TAnotherActionState> {
        return (
            ((
                await this.storage.load(
                    `command:${commandName.replace('.', '-')}`
                )
            )[this.chatId] as TAnotherActionState) ?? new ActionStateBase()
        );
    }

    /**
     * Manually update the state of an action.
     * @param stateUpdateAction Function that will modify state.
     */
    updateState(stateUpdateAction: (state: TActionState) => void) {
        this.updateActions.push(
            stateUpdateAction as (state: TActionState) => void
        );
    }

    /**
     * Reply with text message to message that triggered this action.
     * @param text Message contents.
     * @param options Message sending option.
     */
    replyWithText(text: string, options?: TextMessageSendingOptions) {
        this.interactions.respond(
            new TextMessage(
                text,
                this.chatId,
                this.messageId,
                this.traceId,
                this.actionKey,
                options
            )
        );
    }

    /**
     * Reply with image message to message that triggered this action.
     * @param text Message contents.
     * @param options Message sending option.
     */
    replyWithImage(name: string, options?: MessageSendingOptions) {
        const filePath = `./content/${name}.png`;
        this.interactions.respond(
            new ImageMessage(
                { source: resolve(filePath) },
                this.chatId,
                this.messageId,
                this.traceId,
                this.actionKey,
                options
            )
        );
    }

    /**
     * Reply with video/gif message to message that triggered this action.
     * @param text Message contents.
     * @param options Message sending option.
     */
    replyWithVideo(name: string, options?: MessageSendingOptions) {
        const filePath = `./content/${name}.mp4`;
        this.interactions.respond(
            new VideoMessage(
                { source: resolve(filePath) },
                this.chatId,
                this.messageId,
                this.traceId,
                this.actionKey,
                options
            )
        );
    }

    /**
     * React to the message that triggered this action.
     * @param emoji Telegram emoji to react with.
     */
    react(emoji: TelegramEmoji) {
        this.interactions.react(
            new Reaction(
                this.traceId,
                this.chatId,
                this.messageId,
                emoji,
                this.actionKey
            )
        );
    }
}
