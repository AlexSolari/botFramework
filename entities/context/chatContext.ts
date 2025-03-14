import { resolve } from 'path';
import { IBotApiInteractions } from '../../services/telegramApi';
import { IStorageClient } from '../../types/storage';
import { ImageMessage } from '../responses/imageMessage';
import { TextMessage } from '../responses/textMessage';
import { VideoMessage } from '../responses/videoMessage';

export class ChatContext {
    botName: string;
    interactions: IBotApiInteractions;
    chatId: number;
    chatName: string;
    traceId: number | string;
    storage: IStorageClient;

    constructor(
        botName: string,
        interactions: IBotApiInteractions,
        chatId: number,
        chatName: string,
        traceId: number | string,
        storage: IStorageClient
    ) {
        this.botName = botName;
        this.interactions = interactions;
        this.chatId = chatId;
        this.chatName = chatName;
        this.traceId = traceId;
        this.storage = storage;
    }

    sendTextToChat(text: string, disableWebPreview?: boolean) {
        this.interactions.respond(
            new TextMessage(
                text,
                this.chatId,
                undefined,
                this.traceId,
                disableWebPreview ?? false
            )
        );
    }

    sendImageToChat(name: string) {
        const filePath = `./content/${name}.png`;
        this.interactions.respond(
            new ImageMessage(
                { source: resolve(filePath) },
                this.chatId,
                undefined,
                this.traceId
            )
        );
    }

    sendVideoToChat(name: string) {
        const filePath = `./content/${name}.mp4`;
        this.interactions.respond(
            new VideoMessage(
                { source: resolve(filePath) },
                this.chatId,
                undefined,
                this.traceId
            )
        );
    }
}
