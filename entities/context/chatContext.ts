import { resolve } from 'path';
import { IBotApiInteractions } from '../../services/telegramApi';
import { IStorageClient } from '../../types/storage';
import { ImageMessage } from '../responses/imageMessage';
import { TextMessage } from '../responses/textMessage';
import { VideoMessage } from '../responses/videoMessage';
import { UnpinResponse } from '../responses/unpin';
import {
    MessageSendingOptions,
    TextMessageSendingOptions
} from '../../types/messageSendingOptions';
import { IActionWithState } from '../../types/actionWithState';

/**
 * Context of action executed in chat.
 */
export class ChatContext<TActionState> {
    protected action!: IActionWithState;
    protected interactions!: IBotApiInteractions;
    updateActions: Array<(state: TActionState) => void> = [];
    /** Trace id of a action execution. */
    traceId!: number | string;
    /** Name of a bot that executes this action. */
    botName!: string;
    /** Id of a chat that action is executed in. */
    chatId!: number;
    /** Name of a chat that action is executed in. */
    chatName!: string;
    /** Storage client instance for this bot. */
    storage!: IStorageClient;

    isInitialized = false;

    constructor() {}

    initializeChatContext(
        botName: string,
        action: IActionWithState,
        interactions: IBotApiInteractions,
        chatId: number,
        chatName: string,
        traceId: number | string,
        storage: IStorageClient
    ) {
        this.botName = botName;
        this.action = action;
        this.interactions = interactions;
        this.chatId = chatId;
        this.chatName = chatName;
        this.traceId = traceId;
        this.storage = storage;

        this.updateActions = [];
        this.isInitialized = true;

        return this;
    }

    /**
     * Manually update the state of an action.
     * @param stateUpdateAction Function that will modify state.
     */
    updateState(stateUpdateAction: (state: TActionState) => void) {
        this.updateActions.push(stateUpdateAction);
    }

    /**
     * Sends text message to chat.
     * @param text Message contents.
     * @param options Message sending option.
     */
    sendTextToChat(text: string, options?: TextMessageSendingOptions) {
        this.interactions.respond(
            new TextMessage(
                text,
                this.chatId,
                undefined,
                this.traceId,
                this.action,
                options
            )
        );
    }

    /**
     * Sends image message to chat.
     * @param name Message contents.
     * @param options Message sending option.
     */
    sendImageToChat(name: string, options?: MessageSendingOptions) {
        const filePath = `./content/${name}.png`;
        this.interactions.respond(
            new ImageMessage(
                { source: resolve(filePath) },
                this.chatId,
                undefined,
                this.traceId,
                this.action,
                options
            )
        );
    }

    /**
     * Sends video/gif message to chat.
     * @param name Message contents.
     * @param options Message sending option.
     */
    sendVideoToChat(name: string, options?: MessageSendingOptions) {
        const filePath = `./content/${name}.mp4`;
        this.interactions.respond(
            new VideoMessage(
                { source: resolve(filePath) },
                this.chatId,
                undefined,
                this.traceId,
                this.action,
                options
            )
        );
    }

    /**
     * Unpins message.
     * @param messageId Message id.
     */
    unpinMessage(messageId: number) {
        this.interactions.unpin(
            new UnpinResponse(messageId, this.chatId, this.traceId, this.action)
        );
    }
}
