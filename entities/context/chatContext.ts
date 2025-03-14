import { resolve } from 'path';
import { IBotApiInteractions } from '../../services/telegramApi';
import { IStorageClient } from '../../types/storage';
import { ImageMessage } from '../responses/imageMessage';
import { TextMessage } from '../responses/textMessage';
import { VideoMessage } from '../responses/videoMessage';
import { UnpinResponse } from '../responses/unpin';

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

    sendTextToChat(
        text: string,
        disableWebPreview?: boolean,
        pinned?: boolean
    ) {
        this.interactions.respond(
            new TextMessage(
                text,
                this.chatId,
                undefined,
                this.traceId,
                disableWebPreview ?? false,
                pinned ?? false,
                this.actionKey
            )
        );
    }

    sendImageToChat(name: string, pinned?: boolean) {
        const filePath = `./content/${name}.png`;
        this.interactions.respond(
            new ImageMessage(
                { source: resolve(filePath) },
                this.chatId,
                undefined,
                this.traceId,
                pinned ?? false,
                this.actionKey
            )
        );
    }

    sendVideoToChat(name: string, pinned?: boolean) {
        const filePath = `./content/${name}.mp4`;
        this.interactions.respond(
            new VideoMessage(
                { source: resolve(filePath) },
                this.chatId,
                undefined,
                this.traceId,
                pinned ?? false,
                this.actionKey
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
