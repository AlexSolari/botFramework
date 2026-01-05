import { IStorageClient } from '../types/storage';
import {
    BotResponse,
    BotResponseTypes,
    IReplyResponse
} from '../types/response';
import { ILogger } from '../types/logger';
import { QueueItem, ResponseProcessingQueue } from './responseProcessingQueue';
import { IReplyCapture } from '../types/capture';
import { IActionWithState } from '../types/action';
import { IActionState } from '../types/actionState';
import { TraceId } from '../types/trace';
import { ChatInfo } from '../dtos/chatInfo';
import { TelegramApiClient, TelegramMessage } from '../types/externalAliases';
import { BotEventType, TypedEventEmitter } from '../types/events';

export const TELEGRAM_ERROR_QUOTE_INVALID = 'QUOTE_TEXT_INVALID';

export class TelegramApiService {
    private readonly queue = new ResponseProcessingQueue();
    private readonly telegram: TelegramApiClient;
    private readonly storage: IStorageClient;
    private readonly logger: ILogger;
    private readonly eventEmitter: TypedEventEmitter;
    private readonly captureRegistrationCallback: (
        capture: IReplyCapture,
        parentMessageId: number,
        chatInfo: ChatInfo,
        traceId: TraceId
    ) => void;

    private readonly botName: string;

    private readonly methodMap: Record<
        'pin' | keyof typeof BotResponseTypes,
        string | null
    > = {
        inlineQuery: 'answerInlineQuery',
        text: 'sendMessage',
        react: 'setMessageReaction',
        unpin: 'unpinChatMessage',
        pin: 'pinChatMessage',
        image: 'sendPhoto',
        video: 'sendVideo',
        delay: null
    };

    constructor(
        botName: string,
        telegram: TelegramApiClient,
        storage: IStorageClient,
        logger: ILogger,
        eventEmitter: TypedEventEmitter,
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
        this.eventEmitter = eventEmitter;
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
                    const scopedLogger = this.logger.createScope(
                        this.botName,
                        response.traceId,
                        'chatInfo' in response
                            ? response.chatInfo.name
                            : 'Unknown'
                    );

                    try {
                        await this.processResponse(response);
                    } catch (error) {
                        if ('message' in (error as { message?: string })) {
                            const telegramResponse = error as {
                                message: string;
                            };

                            if (
                                telegramResponse.message.includes(
                                    TELEGRAM_ERROR_QUOTE_INVALID
                                )
                            ) {
                                this.eventEmitter.emit(BotEventType.error, {
                                    error: new Error(
                                        'Quote error recieved, retrying without quote'
                                    )
                                });
                                scopedLogger.logWithTraceId(
                                    'Quote error recieved, retrying without quote'
                                );
                                try {
                                    await this.processResponse(response, true);
                                } catch (error) {
                                    scopedLogger.errorWithTraceId(
                                        error,
                                        response
                                    );
                                    this.eventEmitter.emit(BotEventType.error, {
                                        error: error as Error
                                    });
                                }

                                return;
                            }
                        }

                        scopedLogger.errorWithTraceId(error, response);
                        this.eventEmitter.emit(BotEventType.error, {
                            error: error as Error
                        });
                    }
                },
                priority: response.createdAt + offset
            };
            this.queue.enqueue(queueItem);
        }
    }

    flushResponses() {
        void this.queue.flushReadyItems();
    }

    private async pinIfShould(
        response: IReplyResponse,
        message: TelegramMessage
    ) {
        if (response.shouldPin) {
            this.eventEmitter.emit(BotEventType.apiRequestSending, {
                response: null,
                telegramMethod: this.methodMap['pin']
            });
            await this.telegram.pinChatMessage(
                response.chatInfo.id,
                message.message_id,
                { disable_notification: true }
            );
            this.eventEmitter.emit(BotEventType.apiRequestSent, {
                response: null,
                telegramMethod: this.methodMap['pin']
            });

            await this.storage.updateStateFor(
                response.action as IActionWithState<IActionState>,
                response.chatInfo.id,
                (state) => {
                    state.pinnedMessages.push(message.message_id);
                }
            );
        }
    }

    private async processResponse(response: BotResponse, ignoreQuote = false) {
        const sentMessage = await this.sendApiRequest(response, ignoreQuote);
        this.eventEmitter.emit(BotEventType.apiRequestSent, {
            response,
            telegramMethod: this.methodMap[response.kind]
        });

        if (sentMessage && 'content' in response) {
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

    private async sendApiRequest(
        response: BotResponse,
        ignoreQuote: boolean
    ): Promise<TelegramMessage | null> {
        this.eventEmitter.emit(BotEventType.apiRequestSending, {
            response,
            telegramMethod: this.methodMap[response.kind]
        });

        switch (response.kind) {
            case 'text':
                return await this.telegram.sendMessage(
                    response.chatInfo.id,
                    response.content,
                    {
                        reply_parameters: response.replyInfo
                            ? {
                                  message_id: response.replyInfo.id,
                                  quote: ignoreQuote
                                      ? undefined
                                      : response.replyInfo.quote
                              }
                            : undefined,
                        parse_mode: 'MarkdownV2',
                        link_preview_options: {
                            is_disabled: response.disableWebPreview
                        },
                        reply_markup: response.keyboard
                            ? {
                                  inline_keyboard: response.keyboard
                              }
                            : undefined
                    }
                );
            case 'image':
                return await this.telegram.sendPhoto(
                    response.chatInfo.id,
                    response.content,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                    response.replyInfo?.id
                        ? ({
                              reply_to_message_id: response.replyInfo.id // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          } as any)
                        : undefined
                );
            case 'video':
                return await this.telegram.sendVideo(
                    response.chatInfo.id,
                    response.content,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                    response.replyInfo?.id
                        ? ({
                              reply_to_message_id: response.replyInfo.id // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          } as any)
                        : undefined
                );
            case 'react':
                await this.telegram.setMessageReaction(
                    response.chatInfo.id,
                    response.messageId,
                    [
                        {
                            type: 'emoji',
                            emoji: response.emoji
                        }
                    ]
                );

                return null;
            case 'unpin':
                await this.telegram.unpinChatMessage(
                    response.chatInfo.id,
                    response.messageId
                );

                await this.storage.updateStateFor(
                    response.action,
                    response.chatInfo.id,
                    (state) => {
                        state.pinnedMessages = state.pinnedMessages.filter(
                            (x) => x != response.messageId
                        );
                    }
                );

                return null;
            case 'inlineQuery':
                await this.telegram.answerInlineQuery(
                    response.queryId,
                    response.queryResults,
                    { cache_time: 0 }
                );

                return null;
            case 'delay':
                return null;
        }
    }
}
