import { Message } from 'telegraf/types';
import { IStorageClient } from '../types/storage';
import { BotResponse, IReplyResponse } from '../types/response';
import { Telegram } from 'telegraf/typings/telegram';
import { ILogger } from '../types/logger';
import { QueueItem, ResponseProcessingQueue } from './responseProcessingQueue';
import { IReplyCapture } from '../types/capture';
import { IActionWithState } from '../types/action';
import { IActionState } from '../types/actionState';
import { TraceId } from '../types/trace';
import { ChatInfo } from '../dtos/chatInfo';

export class TelegramApiService {
    private readonly queue = new ResponseProcessingQueue();
    private readonly telegram: Telegram;
    private readonly storage: IStorageClient;
    private readonly logger: ILogger;
    private readonly captureRegistrationCallback: (
        capture: IReplyCapture,
        parentMessageId: number,
        chatInfo: ChatInfo,
        traceId: TraceId
    ) => void;

    private readonly botName: string;

    constructor(
        botName: string,
        telegram: Telegram,
        storage: IStorageClient,
        logger: ILogger,
        captureRegistrationCallback: (
            capture: IReplyCapture,
            parentMessageId: number,
            chatInfo: ChatInfo,
            traceId: TraceId
        ) => void
    ) {
        this.telegram = telegram;
        this.botName = botName;
        this.storage = storage;
        this.logger = logger;
        this.captureRegistrationCallback = captureRegistrationCallback;
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

    private async pinIfShould(response: IReplyResponse, sentMessage: Message) {
        if (response.shouldPin) {
            await this.telegram.pinChatMessage(
                response.chatInfo.id,
                sentMessage.message_id,
                { disable_notification: true }
            );

            await this.storage.updateStateFor(
                response.action as IActionWithState<IActionState>,
                response.chatInfo.id,
                async (state) => {
                    state.pinnedMessages.push(sentMessage.message_id);
                }
            );
        }
    }

    private async processResponse(response: BotResponse) {
        let sentMessage: Message | null = null;

        switch (response.kind) {
            case 'text':
                sentMessage = await this.telegram.sendMessage(
                    response.chatInfo.id,
                    response.content,
                    {
                        reply_parameters: response.replyInfo
                            ? {
                                  message_id: response.replyInfo.id,
                                  quote: response.replyInfo.quote
                              }
                            : undefined,
                        parse_mode: 'MarkdownV2',
                        link_preview_options: {
                            is_disabled: response.disableWebPreview
                        }
                    }
                );
                break;
            case 'image':
                sentMessage = await this.telegram.sendPhoto(
                    response.chatInfo.id,
                    response.content,
                    response.replyInfo?.id
                        ? ({
                              reply_to_message_id: response.replyInfo?.id // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          } as any)
                        : undefined
                );
                break;
            case 'video':
                sentMessage = await this.telegram.sendVideo(
                    response.chatInfo.id,
                    response.content,
                    response.replyInfo?.id
                        ? ({
                              reply_to_message_id: response.replyInfo?.id // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          } as any)
                        : undefined
                );
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

        if ('content' in response && sentMessage) {
            await this.pinIfShould(response, sentMessage);

            for (const capture of response.captures) {
                this.captureRegistrationCallback(
                    capture,
                    sentMessage.message_id,
                    response.chatInfo,
                    response.traceId
                );
            }
        }
    }
}
