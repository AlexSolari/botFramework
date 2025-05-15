import { Message } from 'telegraf/types';
import { IStorageClient } from '../types/storage';
import { BotResponse, IReplyMessage } from '../types/response';
import { Telegram } from 'telegraf/typings/telegram';
import { setTimeout } from 'timers/promises';
import { Milliseconds } from '../types/timeValues';
import { ILogger } from '../types/logger';

const TELEGRAM_RATELIMIT_DELAY = 35 as Milliseconds;

export class TelegramApiService {
    private readonly telegram: Telegram;
    private readonly storage: IStorageClient;
    private readonly logger: ILogger;

    private readonly botName: string;
    private readonly messageQueue: BotResponse[] = [];
    isFlushing = false;

    constructor(
        botName: string,
        telegram: Telegram,
        storage: IStorageClient,
        logger: ILogger
    ) {
        this.telegram = telegram;
        this.botName = botName;
        this.storage = storage;
        this.logger = logger;
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
                this.logger.errorWithTraceId(
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
