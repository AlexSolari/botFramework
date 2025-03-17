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

export class ChatContext {
    botName: string;
    actionKey: string;
    interactions: IBotApiInteractions;
    chatId: number;
    chatName: string;
    traceId: number | string;
    storage: IStorageClient;

    constructor(
        botName: string,
        actionKey: string,
        interactions: IBotApiInteractions,
        chatId: number,
        chatName: string,
        traceId: number | string,
        storage: IStorageClient
    ) {
        this.botName = botName;
        this.actionKey = actionKey;
        this.interactions = interactions;
        this.chatId = chatId;
        this.chatName = chatName;
        this.traceId = traceId;
        this.storage = storage;
    }

    sendTextToChat(text: string, options?: TextMessageSendingOptions) {
        this.interactions.respond(
            new TextMessage(
                text,
                this.chatId,
                undefined,
                this.traceId,
                this.actionKey,
                options
            )
        );
    }

    sendImageToChat(name: string, options?: MessageSendingOptions) {
        const filePath = `./content/${name}.png`;
        this.interactions.respond(
            new ImageMessage(
                { source: resolve(filePath) },
                this.chatId,
                undefined,
                this.traceId,
                this.actionKey,
                options
            )
        );
    }

    sendVideoToChat(name: string, options?: MessageSendingOptions) {
        const filePath = `./content/${name}.mp4`;
        this.interactions.respond(
            new VideoMessage(
                { source: resolve(filePath) },
                this.chatId,
                undefined,
                this.traceId,
                this.actionKey,
                options
            )
        );
    }

    unpinMessage(messageId: number) {
        this.interactions.unpin(
            new UnpinResponse(
                messageId,
                this.chatId,
                this.traceId,
                this.actionKey
            )
        );
    }
}
