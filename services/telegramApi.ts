import { Message } from 'telegraf/types';
import { IStorageClient } from '../types/storage';
import { BotResponse, IReplyMessage } from '../types/response';
import { Telegram } from 'telegraf/typings/telegram';
import { ILogger } from '../types/logger';
import { QueueItem, ResponseProcessingQueue } from './responseProcessingQueue';

export class TelegramApiService {
    private readonly queue = new ResponseProcessingQueue();
    private readonly telegram: Telegram;
    private readonly storage: IStorageClient;
    private readonly logger: ILogger;

    private readonly botName: string;

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
        let offset = 0;
        for (const response of responses) {
            if (response.kind == 'delay') {
                offset += response.delay;
                continue;
            }

            const queueItem: QueueItem = {
                callback: async () => {
                    try {
                        await this.processResponse(response);
                    } catch (error) {
                        this.logger.errorWithTraceId(
                            this.botName,
                            response.traceId,
                            'chatInfo' in response
                                ? response.chatInfo.name
                                : 'Unknown',
                            error,
                            response
                        );
                    }
                },
                priority: response.createdAt + offset
            };
            this.queue.enqueue(queueItem);
        }
    }

    flushResponses() {
        this.queue.flushReadyItems();
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
            case 'inlineQuery':
                await this.telegram.answerInlineQuery(
                    response.queryId,
                    response.queryResults,
                    { cache_time: 0 }
                );
                break;
            case 'delay':
                break;
        }
    }
}
