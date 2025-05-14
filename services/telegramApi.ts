import { Message } from 'telegraf/types';
import { IStorageClient } from '../types/storage';
import { Logger } from './logger';
import { BotResponse, IReplyMessage } from '../types/response';
import { Telegram } from 'telegraf/typings/telegram';
import { setTimeout } from 'timers/promises';
import { Milliseconds } from '../types/timeValues';

const TELEGRAM_RATELIMIT_DELAY = 35 as Milliseconds;

export class TelegramApiService {
    isFlushing = false;
    readonly messageQueue: BotResponse[] = [];

    readonly botName: string;
    readonly telegram: Telegram;
    readonly storage: IStorageClient;

    constructor(botName: string, telegram: Telegram, storage: IStorageClient) {
        this.telegram = telegram;
        this.botName = botName;
        this.storage = storage;
    }

    enqueueBatchedResponses(responses: BotResponse[]) {
        for (const response of responses) {
            this.messageQueue.push(response);
        }
    }

    async flushResponses() {
        if (this.isFlushing) return;

        this.isFlushing = true;

        while (this.messageQueue.length) {
            const message = this.messageQueue.shift();

            if (!message) break;

            try {
                await this.processResponse(message);
                await setTimeout(TELEGRAM_RATELIMIT_DELAY);
            } catch (error) {
                Logger.errorWithTraceId(
                    this.botName,
                    message.traceId,
                    message.chatInfo.name,
                    error,
                    message
                );
            }
        }

        this.isFlushing = false;
    }

    private async pinIfShould<T>(
        response: IReplyMessage<T>,
        sentMessage: Message
    ) {
        if (response.shouldPin) {
            await this.telegram.pinChatMessage(
                response.chatInfo.id,
                sentMessage.message_id,
                { disable_notification: true }
            );

            await this.storage.updateStateFor(
                response.action,
                response.chatInfo.id,
                async (state) => {
                    state.pinnedMessages.push(sentMessage.message_id);
                }
            );
        }
    }

    private async processResponse(response: BotResponse) {
        let sentMessage: Message;

        switch (response.kind) {
            case 'text':
                sentMessage = await this.telegram.sendMessage(
                    response.chatInfo.id,
                    response.content,
                    {
                        reply_to_message_id: response.replyId,
                        parse_mode: 'MarkdownV2',
                        disable_web_page_preview: response.disableWebPreview
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    } as any
                );

                await this.pinIfShould(response, sentMessage);
                break;
            case 'image':
                sentMessage = await this.telegram.sendPhoto(
                    response.chatInfo.id,
                    response.content,
                    response.replyId
                        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          ({ reply_to_message_id: response.replyId } as any)
                        : undefined
                );

                await this.pinIfShould(response, sentMessage);
                break;
            case 'video':
                sentMessage = await this.telegram.sendVideo(
                    response.chatInfo.id,
                    response.content,
                    response.replyId
                        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          ({ reply_to_message_id: response.replyId } as any)
                        : undefined
                );

                await this.pinIfShould(response, sentMessage);
                break;
            case 'react':
                await this.telegram.setMessageReaction(
                    response.chatInfo.id,
                    response.messageId,
                    [
                        {
                            type: 'emoji',
                            emoji: response.emoji
                        }
                    ],
                    true
                );

                return;
            case 'unpin':
                await this.telegram.unpinChatMessage(
                    response.chatInfo.id,
                    response.messageId
                );

                await this.storage.updateStateFor(
                    response.action,
                    response.chatInfo.id,
                    async (state) => {
                        state.pinnedMessages = state.pinnedMessages.filter(
                            (x) => x != response.messageId
                        );
                    }
                );
                break;
            case 'delay':
                if (response.delay > TELEGRAM_RATELIMIT_DELAY) {
                    await setTimeout(response.delay - TELEGRAM_RATELIMIT_DELAY);
                }
        }
    }
}
