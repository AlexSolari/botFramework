import { IStorageClient } from '../types/storage';
import { BotResponse, BotResponseTypes } from '../types/response';
import { ReplyCapture } from '../types/postSendOperations';
import { QueueItem, ResponseProcessingQueue } from './responseProcessingQueue';
import { TraceId } from '../types/trace';
import { ChatInfo } from '../dtos/chatInfo';
import { Message } from '../types/botApi.generated';
import { BotEventType, TypedEventEmitter } from '../types/events';
import { createTrace } from '../helpers/traceFactory';
import {
    TELEGRAM_ERROR_QUOTE_INVALID,
    TELEGRAM_ERROR_REPLY_NOT_FOUND
} from '../helpers/constants';
import { setTimeout } from 'timers/promises';
import { DeleteMessageResponse } from '../dtos/responses/deleteMessage';
import { PinResponse } from '../dtos/responses/pin';
import { IActionState } from '../types/actionState';
import { IActionWithState } from '../types/action';
import { BotApiClient, BotApiMethod } from './telegram/botApiClient';

export class TelegramApiService {
    private readonly queue = new ResponseProcessingQueue();
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
        keyof typeof BotResponseTypes,
        BotApiMethod | null
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

    readonly client: BotApiClient;

    constructor(
        botName: string,
        client: BotApiClient,
        storage: IStorageClient,
        eventEmitter: TypedEventEmitter,
        captureRegistrationCallback: (
            capture: ReplyCapture,
            parentMessageId: number,
            chatInfo: ChatInfo,
            traceId: TraceId
        ) => void
    ) {
        this.client = client;
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

                        const isRecoverableReplyError =
                            'messageWithoutReplyInfo' in response &&
                            (error.message.includes(
                                TELEGRAM_ERROR_QUOTE_INVALID
                            ) ||
                                error.message.includes(
                                    TELEGRAM_ERROR_REPLY_NOT_FOUND
                                ));

                        if (isRecoverableReplyError) {
                            await this.retryWithFallback(
                                response.messageWithoutReplyInfo,
                                'Reply error received, retrying without reply info',
                                response.traceId
                            );
                        } else {
                            this.eventEmitter.emit(BotEventType.error, {
                                error,
                                traceId: response.traceId
                            });
                        }
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

    private async retryWithFallback(
        fallback: BotResponse,
        warningMessage: string,
        traceId: TraceId
    ) {
        this.eventEmitter.emit(BotEventType.error, {
            error: new Error(warningMessage),
            traceId
        });
        try {
            await this.processResponse(fallback);
        } catch (reason) {
            this.eventEmitter.emit(BotEventType.error, {
                error:
                    reason instanceof Error
                        ? reason
                        : new Error('Unknown error'),
                traceId
            });
        }
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
    ): Promise<Message | null> {
        this.eventEmitter.emit(BotEventType.apiRequestSending, {
            response,
            telegramMethod: this.methodMap[response.kind],
            traceId: response.traceId
        });

        try {
            switch (response.kind) {
                case 'text':
                    return await this.client.call('sendMessage', {
                        chat_id: response.chatInfo.id,
                        text: response.content,
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
                    });
                case 'image':
                    return await this.client.call('sendPhoto', {
                        chat_id: response.chatInfo.id,
                        photo: response.content,
                        reply_parameters: response.replyInfo
                            ? { message_id: response.replyInfo.id }
                            : undefined
                    });
                case 'video':
                    return await this.client.call('sendVideo', {
                        chat_id: response.chatInfo.id,
                        video: response.content,
                        reply_parameters: response.replyInfo
                            ? { message_id: response.replyInfo.id }
                            : undefined
                    });
                case 'react':
                    await this.client.call('setMessageReaction', {
                        chat_id: response.chatInfo.id,
                        message_id: response.messageId,
                        reaction: [
                            {
                                type: 'emoji',
                                emoji: response.emoji
                            }
                        ]
                    });

                    return null;
                case 'unpin':
                    await this.client.call('unpinChatMessage', {
                        chat_id: response.chatInfo.id,
                        message_id: response.messageId
                    });

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
                    await this.client.call('pinChatMessage', {
                        chat_id: response.chatInfo.id,
                        message_id: response.messageId,
                        disable_notification: true
                    });

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
                    await this.client.call('answerInlineQuery', {
                        inline_query_id: response.queryId,
                        results: response.queryResults,
                        cache_time: 0
                    });

                    return null;
                case 'deleteMessage':
                    await this.client.call('deleteMessage', {
                        chat_id: response.chatInfo.id,
                        message_id: response.messageId
                    });

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
