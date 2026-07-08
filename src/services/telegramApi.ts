import { IStorageClient } from '../types/storage';
import { BotResponse, BotResponseTypes } from '../types/response';
import { ReplyCapture } from '../types/postSendOperations';
import { QueueItem, ResponseProcessingQueue } from './responseProcessingQueue';
import { TraceId } from '../types/trace';
import { ChatInfo } from '../dtos/chatInfo';
import { TelegramApiClient, TelegramMessage } from '../types/externalAliases';
import { BotEventType, TypedEventEmitter } from '../types/events';
import { createTrace } from '../helpers/traceFactory';
import { TELEGRAM_ERROR_QUOTE_INVALID } from '../helpers/constants';
import { setTimeout } from 'timers/promises';
import { DeleteMessageResponse } from '../dtos/responses/deleteMessage';
import { PinResponse } from '../dtos/responses/pin';
import { IActionState } from '../types/actionState';
import { IActionWithState } from '../types/action';

export class TelegramApiService {
    private readonly queue = new ResponseProcessingQueue();
    private readonly telegram: TelegramApiClient;
    private readonly storage: IStorageClient;
    private readonly eventEmitter: TypedEventEmitter;
    private readonly captureRegistrationCallback: (
        capture: ReplyCapture,
        parentMessageId: number,
        chatInfo: ChatInfo,
        traceId: TraceId
    ) => void;

    private readonly TELEGRAM_API_SERVICE_ERROR_TRACEID: TraceId;

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
        deleteMessage: 'deleteMessage',
        delay: null
    };

    constructor(
        botName: string,
        telegram: TelegramApiClient,
        storage: IStorageClient,
        eventEmitter: TypedEventEmitter,
        captureRegistrationCallback: (
            capture: ReplyCapture,
            parentMessageId: number,
            chatInfo: ChatInfo,
            traceId: TraceId
        ) => void
    ) {
        this.telegram = telegram;
        this.storage = storage;
        this.eventEmitter = eventEmitter;
        this.captureRegistrationCallback = captureRegistrationCallback;

        this.TELEGRAM_API_SERVICE_ERROR_TRACEID = createTrace(
            this,
            botName,
            'Error'
        );
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
                    } catch (reason) {
                        const error =
                            reason instanceof Error
                                ? reason
                                : new Error('Unknown error');

                        if (
                            'quotelessReply' in response &&
                            'message' in error &&
                            error.message.includes(TELEGRAM_ERROR_QUOTE_INVALID)
                        ) {
                            this.eventEmitter.emit(BotEventType.error, {
                                error: new Error(
                                    'Quote error recieved, retrying without quote'
                                ),
                                traceId: response.traceId
                            });

                            try {
                                await this.processResponse(
                                    response.quotelessReply
                                );
                            } catch (reason) {
                                const error =
                                    reason instanceof Error
                                        ? reason
                                        : new Error('Unknown error');
                                this.eventEmitter.emit(BotEventType.error, {
                                    error,
                                    traceId: response.traceId
                                });
                            }

                            return;
                        }

                        this.eventEmitter.emit(BotEventType.error, {
                            error,
                            traceId: response.traceId
                        });
                    }
                },
                priority: response.createdAt + offset
            };
            this.queue.enqueue(queueItem);
        }
    }

    flushResponses() {
        void this.queue.flushReadyItems().catch((reason: unknown) => {
            this.eventEmitter.emit(BotEventType.error, {
                error:
                    reason instanceof Error
                        ? reason
                        : new Error('Unknown error'),
                traceId: this.TELEGRAM_API_SERVICE_ERROR_TRACEID
            });
        });
    }

    private async processResponse(response: BotResponse) {
        const sentMessage = await this.sendApiRequest(response);

        if (sentMessage && 'content' in response) {
            for (const operation of response.postSendOperations) {
                switch (operation.kind) {
                    case 'captureReplies':
                        this.captureRegistrationCallback(
                            operation,
                            sentMessage.message_id,
                            response.chatInfo,
                            response.traceId
                        );
                        break;
                    case 'deleteAfterTimeout':
                        await setTimeout(operation.timeout);
                        await this.sendApiRequest(
                            new DeleteMessageResponse(
                                sentMessage.message_id,
                                response.chatInfo,
                                response.traceId,
                                response.action
                            )
                        );
                        break;
                    case 'pin':
                        await this.sendApiRequest(
                            new PinResponse(
                                sentMessage.message_id,
                                response.chatInfo,
                                response.traceId,
                                response.action
                            )
                        );
                        break;
                }
            }
        }
    }

    private async sendApiRequest(
        response: BotResponse
    ): Promise<TelegramMessage | null> {
        this.eventEmitter.emit(BotEventType.apiRequestSending, {
            response,
            telegramMethod: this.methodMap[response.kind],
            traceId: response.traceId
        });

        try {
            switch (response.kind) {
                case 'text':
                    return await this.telegram.sendMessage(
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
                            },
                            reply_markup: {
                                inline_keyboard: response.keyboard ?? []
                            }
                        }
                    );
                case 'image':
                    return await this.telegram.sendPhoto(
                        response.chatInfo.id,
                        response.content,
                        {
                            // @ts-expect-error reply_parameters is bugged in sendPhoto,
                            // fallback to reply_to_message_id which is deprecated but still functional
                            reply_to_message_id: response.replyInfo?.id
                        }
                    );
                case 'video':
                    return await this.telegram.sendVideo(
                        response.chatInfo.id,
                        response.content,
                        {
                            // @ts-expect-error reply_parameters is bugged in sendPhoto,
                            // fallback to reply_to_message_id which is deprecated but still functional
                            reply_to_message_id: response.replyInfo?.id
                        }
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
                case 'pin':
                    await this.telegram.pinChatMessage(
                        response.chatInfo.id,
                        response.messageId,
                        { disable_notification: true }
                    );

                    if ('stateConstructor' in response.action) {
                        await this.storage.updateStateFor(
                            response.action as IActionWithState<IActionState>,
                            response.chatInfo.id,
                            (state) => {
                                state.pinnedMessages.push(response.messageId);
                            }
                        );
                    }

                    return null;
                case 'inlineQuery':
                    await this.telegram.answerInlineQuery(
                        response.queryId,
                        response.queryResults,
                        { cache_time: 0 }
                    );

                    return null;
                case 'deleteMessage':
                    await this.telegram.deleteMessage(
                        response.chatInfo.id,
                        response.messageId
                    );

                    return null;
                case 'delay':
                    return null;
            }
        } finally {
            this.eventEmitter.emit(BotEventType.apiRequestSent, {
                response,
                telegramMethod: this.methodMap[response.kind],
                traceId: response.traceId
            });
        }
    }
}
