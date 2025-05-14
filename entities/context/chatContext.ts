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

/**
 * Context of action executed in chat.
 */
export class ChatContext<TActionState extends IActionState> {
    protected action!: IActionWithState<TActionState>;
    updateActions: Array<(state: TActionState) => void> = [];
    /** Trace id of a action execution. */
    traceId!: number | string;
    /** Name of a bot that executes this action. */
    botName!: string;
    /** Chat information. */
    chatInfo!: ChatInfo;
    /** Storage client instance for this bot. */
    storage!: IStorageClient;
    /** Ordered collection of responses to be processed  */
    responses: BotResponse[] = [];

    isInitialized = false;

    constructor() {}

    initializeChatContext(
        botName: string,
        action: IActionWithState<TActionState>,
        chatInfo: ChatInfo,
        traceId: number | string,
        storage: IStorageClient
    ) {
        this.botName = botName;
        this.action = action;
        this.chatInfo = chatInfo;
        this.traceId = traceId;
        this.storage = storage;

        this.updateActions = [];
        this.isInitialized = true;
        this.responses = [];

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
     * Delays next response by specified amount of time.
     * @param delay Delay in milliseconds.
     */
    delayNextResponse(delay: Milliseconds) {
        this.responses.push(
            new DelayResponse(delay, this.chatInfo, this.traceId, this.action)
        );
    }
}
