import { describe, test, expect, mock } from 'bun:test';
import { setTimeout } from 'timers/promises';
import { TelegramApiService } from '../../src/services/telegramApi';
import { BotApiClient } from '../../src/services/telegram/botApiClient';
import { BotEventType, TypedEventEmitter } from '../../src/types/events';
import { TextMessage } from '../../src/dtos/responses/textMessage';
import { ImageMessage } from '../../src/dtos/responses/imageMessage';
import { VideoMessage } from '../../src/dtos/responses/videoMessage';
import { Reaction } from '../../src/dtos/responses/reaction';
import { PinResponse } from '../../src/dtos/responses/pin';
import { UnpinResponse } from '../../src/dtos/responses/unpin';
import { InlineQueryResponse } from '../../src/dtos/responses/inlineQueryResponse';
import { DelayResponse } from '../../src/dtos/responses/delay';
import { ChatInfo } from '../../src/dtos/chatInfo';
import { ReplyInfo } from '../../src/dtos/replyInfo';
import { ActionKey, IAction, IActionWithState } from '../../src/types/action';
import { IActionState } from '../../src/types/actionState';
import { BotResponse } from '../../src/types/response';
import { IStorageClient } from '../../src/types/storage';
import { InlineQueryResult } from '../../src/types/botApi.generated';
import { InlineQueryActionInternal } from '../../src/entities/actions/inlineQueryAction';
import { TraceId } from '../../src/types/trace';
import { Milliseconds } from '../../src/types/timeValues';
import {
    ContinuePersistentReplyCaptureOperation,
    PersistentReplyCaptureOperation,
    ReplyCapture
} from '../../src/types/postSendOperations';
import { PersistentReplyCaptureActionInternal } from '../../src/entities/actions/persistentReplyCaptureAction';
import {
    TELEGRAM_ERROR_QUOTE_INVALID,
    TELEGRAM_ERROR_REPLY_NOT_FOUND
} from '../../src/helpers/constants';
import { createMockStorage } from './actionProcessors/processorTestHelpers';
import { PersistentReplyCaptureBuilder } from '../../src/helpers/builders/persistentReplyCaptureBuilder';

type CallParams = { reply_parameters?: unknown; message_id?: number };

const action: IAction = {
    key: 'test:action' as ActionKey
};

function createApi(
    call: (method: string, params: CallParams) => Promise<unknown>
) {
    const eventEmitter = new TypedEventEmitter();
    const registerCapture = mock(
        (_capture: ReplyCapture, _parentMessageId: number) => {}
    );
    const registerPersistentCapture = mock(
        (_capture: PersistentReplyCaptureOperation, _parentMessageId: number) => {}
    );
    const continuePersistentCapture = mock(
        (
            _operation: ContinuePersistentReplyCaptureOperation,
            _parentMessageId: number
        ) => {}
    );
    const messageDeleted = mock((_chatInfo: ChatInfo, _messageId: number) => {});
    const storage = createMockStorage();
    const api = new TelegramApiService(
        'TestBot',
        { call } as unknown as BotApiClient,
        storage,
        eventEmitter,
        {
            registerCapture,
            registerPersistentCapture,
            continuePersistentCapture,
            messageDeleted
        }
    );

    return {
        api,
        eventEmitter,
        storage,
        registerCapture,
        registerPersistentCapture,
        continuePersistentCapture,
        messageDeleted
    };
}

function createMessage(replyInfo?: ReplyInfo) {
    return new TextMessage(
        'Hello',
        new ChatInfo(12345, 'Test Chat', []),
        'trace:1' as TraceId,
        action,
        replyInfo
    );
}

function createCapture(): ReplyCapture {
    return {
        kind: 'captureReplies',
        trigger: [],
        handler: () => Promise.resolve(),
        abortController: new AbortController(),
        action
    };
}

async function process(api: TelegramApiService, response: BotResponse) {
    api.enqueueBatchedResponses([response]);
    await api['queue']['items'].shift()!.callback();
}

function collectErrors(eventEmitter: TypedEventEmitter) {
    const errors: Error[] = [];
    eventEmitter.on(BotEventType.error, (_timestamp, { error }) => {
        errors.push(error);
    });

    return errors;
}

const chatInfo = new ChatInfo(12345, 'Test Chat', []);
const traceId = 'trace:1' as TraceId;
const statefulAction = {
    key: 'test:stateful' as ActionKey,
    stateConstructor: () => ({ lastExecutedDate: 0, pinnedMessages: [] })
} as IActionWithState<IActionState>;

/** Runs the state update passed to `updateStateFor` on the given state. */
function applyStateUpdate(storage: IStorageClient, state: IActionState) {
    const update = (storage.updateStateFor as ReturnType<typeof mock>).mock
        .calls[0][2] as (state: IActionState) => void;
    update(state);

    return state;
}

describe('TelegramApiService', () => {
    describe('reply error fallback', () => {
        test('should run post-send operations on the message sent without reply info', async () => {
            const call = mock((method: string, params: CallParams) => {
                if (method == 'sendMessage' && params.reply_parameters) {
                    return Promise.reject(
                        new Error(`Bad Request: ${TELEGRAM_ERROR_QUOTE_INVALID}`)
                    );
                }

                return Promise.resolve(
                    method == 'sendMessage' ? { message_id: 42 } : true
                );
            });
            const { api, registerCapture } = createApi(call);
            const message = createMessage(new ReplyInfo(100, 'missing quote'));
            const capture = createCapture();
            message.postSendOperations.push({ kind: 'pin' }, capture);

            await process(api, message);

            expect(call.mock.calls.map(([method]) => method)).toEqual([
                'sendMessage',
                'sendMessage',
                'pinChatMessage'
            ]);
            expect(call.mock.calls[2][1]).toMatchObject({ message_id: 42 });
            expect(registerCapture).toHaveBeenCalledTimes(1);
            expect(registerCapture.mock.calls[0][0]).toBe(capture);
            expect(registerCapture.mock.calls[0][1]).toBe(42);
        });

        test('should retry without reply info when the replied message is not found', async () => {
            const call = mock((_method: string, params: CallParams) =>
                params.reply_parameters
                    ? Promise.reject(
                          new Error(`Bad Request: ${TELEGRAM_ERROR_REPLY_NOT_FOUND}`)
                      )
                    : Promise.resolve({ message_id: 42 })
            );
            const { api, eventEmitter } = createApi(call);
            const errors = collectErrors(eventEmitter);

            await process(api, createMessage(new ReplyInfo(100)));

            expect(call).toHaveBeenCalledTimes(2);
            expect(call.mock.calls[1][1].reply_parameters).toBeUndefined();
            expect(errors.map((x) => x.message)).toEqual([
                'Reply error received, retrying without reply info'
            ]);
        });

        test('should report a failure of the message sent without reply info', async () => {
            const fallbackError = new Error('Forbidden: bot was blocked');
            const call = mock((_method: string, params: CallParams) =>
                Promise.reject(
                    params.reply_parameters
                        ? new Error(`Bad Request: ${TELEGRAM_ERROR_QUOTE_INVALID}`)
                        : fallbackError
                )
            );
            const { api, eventEmitter } = createApi(call);
            const errors = collectErrors(eventEmitter);

            await process(api, createMessage(new ReplyInfo(100, 'quote')));

            expect(errors).toEqual([
                new Error('Reply error received, retrying without reply info'),
                fallbackError
            ]);
        });

        test('should wrap a non-Error failure of the message sent without reply info', async () => {
            const call = mock((_method: string, params: CallParams) =>
                params.reply_parameters
                    ? Promise.reject(
                          new Error(`Bad Request: ${TELEGRAM_ERROR_QUOTE_INVALID}`)
                      )
                    : Promise.reject('not an error')
            );
            const { api, eventEmitter } = createApi(call);
            const errors = collectErrors(eventEmitter);

            await process(api, createMessage(new ReplyInfo(100, 'quote')));

            expect(errors.at(-1)).toEqual(new Error('Unknown error'));
        });
    });

    describe('errors', () => {
        test('should report other errors without retrying', async () => {
            const error = new Error('Forbidden: bot was blocked');
            const call = mock(() => Promise.reject(error));
            const { api, eventEmitter } = createApi(call);
            const errors = collectErrors(eventEmitter);

            await process(api, createMessage(new ReplyInfo(100)));

            expect(call).toHaveBeenCalledTimes(1);
            expect(errors).toEqual([error]);
        });

        test('should wrap non-Error failures', async () => {
            const call = mock(() => Promise.reject('not an error'));
            const { api, eventEmitter } = createApi(call);
            const errors = collectErrors(eventEmitter);

            await process(api, createMessage());

            expect(errors).toEqual([new Error('Unknown error')]);
        });
    });

    describe('response types', () => {
        const ok = () => Promise.resolve({ message_id: 42 });

        test('should send an image', async () => {
            const call = mock((_method: string, _params: object) => ok());
            const { api } = createApi(call);
            const image = { source: 'picture.png' };

            await process(
                api,
                new ImageMessage(image, chatInfo, traceId, action, new ReplyInfo(7))
            );

            expect(call.mock.calls[0]).toEqual([
                'sendPhoto',
                {
                    chat_id: 12345,
                    photo: image,
                    reply_parameters: { message_id: 7 }
                }
            ]);
        });

        test('should send a video', async () => {
            const call = mock((_method: string, _params: object) => ok());
            const { api } = createApi(call);
            const video = { source: 'clip.mp4' };

            await process(api, new VideoMessage(video, chatInfo, traceId, action));

            expect(call.mock.calls[0]).toEqual([
                'sendVideo',
                { chat_id: 12345, video, reply_parameters: undefined }
            ]);
        });

        test('should send an image without reply and a video as a reply', async () => {
            const call = mock((_method: string, _params: object) => ok());
            const { api } = createApi(call);
            const image = { source: 'picture.png' };
            const video = { source: 'clip.mp4' };

            await process(api, new ImageMessage(image, chatInfo, traceId, action));
            await process(
                api,
                new VideoMessage(video, chatInfo, traceId, action, new ReplyInfo(7))
            );

            expect(call.mock.calls.map(([, params]) => params)).toEqual([
                { chat_id: 12345, photo: image, reply_parameters: undefined },
                { chat_id: 12345, video, reply_parameters: { message_id: 7 } }
            ]);
        });

        test('should quote the trigger text in image and video replies', async () => {
            const call = mock((_method: string, _params: object) => ok());
            const { api } = createApi(call);
            const image = { source: 'picture.png' };
            const video = { source: 'clip.mp4' };

            await process(
                api,
                new ImageMessage(
                    image,
                    chatInfo,
                    traceId,
                    action,
                    new ReplyInfo(7, 'hello')
                )
            );
            await process(
                api,
                new VideoMessage(
                    video,
                    chatInfo,
                    traceId,
                    action,
                    new ReplyInfo(7, 'hello')
                )
            );

            expect(
                call.mock.calls.map(([, params]) => params)
            ).toMatchObject([
                { reply_parameters: { message_id: 7, quote: 'hello' } },
                { reply_parameters: { message_id: 7, quote: 'hello' } }
            ]);
        });

        test('should resend an image without reply info when its quote is invalid', async () => {
            const call = mock((_method: string, params: CallParams) =>
                params.reply_parameters
                    ? Promise.reject(
                          new Error(`Bad Request: ${TELEGRAM_ERROR_QUOTE_INVALID}`)
                      )
                    : ok()
            );
            const { api } = createApi(call);

            await process(
                api,
                new ImageMessage(
                    { source: 'picture.png' },
                    chatInfo,
                    traceId,
                    action,
                    new ReplyInfo(7, 'not in the message')
                )
            );

            expect(call).toHaveBeenCalledTimes(2);
            expect(call.mock.calls[1][1].reply_parameters).toBeUndefined();
        });

        test('should set a reaction', async () => {
            const call = mock((_method: string, _params: object) => ok());
            const { api } = createApi(call);

            await process(api, new Reaction(traceId, chatInfo, 7, '👍', action));

            expect(call.mock.calls[0]).toEqual([
                'setMessageReaction',
                {
                    chat_id: 12345,
                    message_id: 7,
                    reaction: [{ type: 'emoji', emoji: '👍' }]
                }
            ]);
        });

        test('should pin a message and remember it in the action state', async () => {
            const call = mock((_method: string, _params: object) => ok());
            const { api, storage } = createApi(call);

            await process(
                api,
                new PinResponse(7, chatInfo, traceId, statefulAction)
            );

            expect(call.mock.calls[0]).toEqual([
                'pinChatMessage',
                { chat_id: 12345, message_id: 7, disable_notification: true }
            ]);
            expect(
                applyStateUpdate(storage, {
                    lastExecutedDate: 0,
                    pinnedMessages: [5]
                }).pinnedMessages
            ).toEqual([5, 7]);
        });

        test('should not update the state when pinning for an action without state', async () => {
            const call = mock((_method: string, _params: object) => ok());
            const { api, storage } = createApi(call);

            await process(api, new PinResponse(7, chatInfo, traceId, action));

            expect(storage.updateStateFor).not.toHaveBeenCalled();
        });

        test('should unpin a message and forget it in the action state', async () => {
            const call = mock((_method: string, _params: object) => ok());
            const { api, storage } = createApi(call);

            await process(
                api,
                new UnpinResponse(7, chatInfo, traceId, statefulAction)
            );

            expect(call.mock.calls[0]).toEqual([
                'unpinChatMessage',
                { chat_id: 12345, message_id: 7 }
            ]);
            expect(
                applyStateUpdate(storage, {
                    lastExecutedDate: 0,
                    pinnedMessages: [5, 7]
                }).pinnedMessages
            ).toEqual([5]);
        });

        test('should answer an inline query', async () => {
            const call = mock((_method: string, _params: object) => ok());
            const { api } = createApi(call);
            const results = [
                {
                    type: 'article',
                    id: '1',
                    title: 'Result',
                    input_message_content: { message_text: 'Result' }
                }
            ] as InlineQueryResult[];

            await process(
                api,
                new InlineQueryResponse(
                    results,
                    'query-1',
                    traceId,
                    action as InlineQueryActionInternal
                )
            );

            expect(call.mock.calls[0]).toEqual([
                'answerInlineQuery',
                { inline_query_id: 'query-1', results, cache_time: 0 }
            ]);
        });

        test('should emit events around each request', async () => {
            const call = mock((_method: string, _params: object) => ok());
            const { api, eventEmitter } = createApi(call);
            const events: string[] = [];
            eventEmitter.on(
                BotEventType.apiRequestSending,
                (_timestamp, { telegramMethod }) => {
                    events.push(`sending ${telegramMethod}`);
                }
            );
            eventEmitter.on(
                BotEventType.apiRequestSent,
                (_timestamp, { telegramMethod }) => {
                    events.push(`sent ${telegramMethod}`);
                }
            );

            await process(api, new Reaction(traceId, chatInfo, 7, '👍', action));

            expect(events).toEqual([
                'sending setMessageReaction',
                'sent setMessageReaction'
            ]);
        });
    });

    describe('queue', () => {
        test('should send the responses after a delay that much later', () => {
            const { api } = createApi(() => Promise.resolve({ message_id: 42 }));
            const first = createMessage();
            const second = createMessage();

            api.enqueueBatchedResponses([
                first,
                new DelayResponse(
                    1000 as Milliseconds,
                    chatInfo,
                    traceId,
                    statefulAction
                ),
                second
            ]);

            expect(
                api['queue']['items'].map((x) => x.priority)
            ).toEqual([first.createdAt, second.createdAt + 1000]);
        });

        test('should send the queued responses when flushed', async () => {
            const call = mock((_method: string, _params: CallParams) =>
                Promise.resolve({ message_id: 42 })
            );
            const { api } = createApi(call);

            api.enqueueBatchedResponses([createMessage()]);
            api.flushResponses();
            await setTimeout(20);

            expect(call.mock.calls.map(([method]) => method)).toEqual([
                'sendMessage'
            ]);
        });

        test('should report a failure of the flush', async () => {
            const { api, eventEmitter } = createApi(() =>
                Promise.resolve({ message_id: 42 })
            );
            const errors = collectErrors(eventEmitter);
            const flushError = new Error('flush failed');
            api['queue'].flushReadyItems = () => Promise.reject(flushError);

            api.flushResponses();
            await setTimeout(0);

            expect(errors).toEqual([flushError]);
        });

        test('should wrap a non-Error failure of the flush', async () => {
            const { api, eventEmitter } = createApi(() =>
                Promise.resolve({ message_id: 42 })
            );
            const errors = collectErrors(eventEmitter);
            api['queue'].flushReadyItems = () =>
                Promise.reject('not an error');

            api.flushResponses();
            await setTimeout(0);

            expect(errors).toEqual([new Error('Unknown error')]);
        });
    });

    describe('persistent captures', () => {
        test('should register a persistent capture for the sent message before the next operation', async () => {
            const call = mock((method: string, _params: CallParams) =>
                Promise.resolve(
                    method == 'sendMessage' ? { message_id: 42 } : true
                )
            );
            const { api, registerPersistentCapture } = createApi(call);
            let registered = false;
            registerPersistentCapture.mockImplementation(() => {
                registered = true;
            });
            const message = createMessage();
            const capture: PersistentReplyCaptureOperation = {
                kind: 'capturePersistentReplies',
                definition: new PersistentReplyCaptureBuilder('guess').build(),
                data: { secret: 5 }
            };
            let registeredBeforePin = false;
            call.mockImplementation((method: string) => {
                if (method == 'pinChatMessage') registeredBeforePin = registered;

                return Promise.resolve(
                    method == 'sendMessage' ? { message_id: 42 } : true
                );
            });
            message.postSendOperations.push(capture, { kind: 'pin' });

            await process(api, message);

            expect(registerPersistentCapture).toHaveBeenCalledTimes(1);
            expect(registerPersistentCapture.mock.calls[0][0]).toBe(capture);
            expect(registerPersistentCapture.mock.calls[0][1]).toBe(42);
            expect(registeredBeforePin).toBe(true);
        });
    });

    describe('continued persistent captures', () => {
        test('should add the sent message to the capture', async () => {
            const call = mock((method: string, _params: CallParams) =>
                Promise.resolve(
                    method == 'sendMessage' ? { message_id: 43 } : true
                )
            );
            const { api, continuePersistentCapture } = createApi(call);
            const message = createMessage();
            const operation: ContinuePersistentReplyCaptureOperation = {
                kind: 'continuePersistentReplies',
                capture: new PersistentReplyCaptureActionInternal(
                    42,
                    new PersistentReplyCaptureBuilder('guess').build(),
                    { parentMessageIds: [42], data: {}, chatName: '', createdAt: 0 }
                )
            };
            message.postSendOperations.push(operation);

            await process(api, message);

            expect(continuePersistentCapture).toHaveBeenCalledTimes(1);
            expect(continuePersistentCapture.mock.calls[0][0]).toBe(operation);
            expect(continuePersistentCapture.mock.calls[0][1]).toBe(43);
        });
    });

    describe('message deletion', () => {
        test('should report the deleted message after deleteAfter', async () => {
            const call = mock((method: string, _params: CallParams) =>
                Promise.resolve(
                    method == 'sendMessage' ? { message_id: 42 } : true
                )
            );
            const { api, messageDeleted } = createApi(call);
            const message = createMessage();
            message.postSendOperations.push({
                kind: 'deleteAfterTimeout',
                timeout: 0 as Milliseconds
            });

            await process(api, message);
            await setTimeout(20);

            expect(messageDeleted).toHaveBeenCalledTimes(1);
            expect(messageDeleted.mock.calls[0][0]).toBe(message.chatInfo);
            expect(messageDeleted.mock.calls[0][1]).toBe(42);
        });

        test('should not report a message that failed to delete', async () => {
            const call = mock((method: string, _params: CallParams) =>
                method == 'deleteMessage'
                    ? Promise.reject(new Error('Bad Request'))
                    : Promise.resolve({ message_id: 42 })
            );
            const { api, messageDeleted } = createApi(call);
            const message = createMessage();
            message.postSendOperations.push({
                kind: 'deleteAfterTimeout',
                timeout: 0 as Milliseconds
            });

            await process(api, message);
            await setTimeout(20);

            expect(messageDeleted).not.toHaveBeenCalled();
        });

        test('should report a message that was already deleted', async () => {
            const call = mock((method: string, _params: CallParams) =>
                method == 'deleteMessage'
                    ? Promise.reject(new Error('400: Bad Request: message to delete not found'))
                    : Promise.resolve({ message_id: 42 })
            );
            const { api, messageDeleted } = createApi(call);
            const message = createMessage();
            message.postSendOperations.push({
                kind: 'deleteAfterTimeout',
                timeout: 0 as Milliseconds
            });

            await process(api, message);
            await setTimeout(20);

            expect(messageDeleted).toHaveBeenCalledTimes(1);
            expect(messageDeleted.mock.calls[0][1]).toBe(42);
        });
    });

    describe('deleteAfter', () => {
        test('should not delay the operations after it', async () => {
            const call = mock((method: string, _params: CallParams) =>
                Promise.resolve(
                    method == 'sendMessage' ? { message_id: 42 } : true
                )
            );
            const { api, registerCapture } = createApi(call);
            const message = createMessage();
            message.postSendOperations.push(
                {
                    kind: 'deleteAfterTimeout',
                    timeout: 20 as Milliseconds
                },
                { kind: 'pin' },
                createCapture()
            );

            await process(api, message);

            expect(call.mock.calls.map(([method]) => method)).toEqual([
                'sendMessage',
                'pinChatMessage'
            ]);
            expect(registerCapture).toHaveBeenCalledTimes(1);

            await setTimeout(40);

            expect(call.mock.calls.map(([method]) => method)).toEqual([
                'sendMessage',
                'pinChatMessage',
                'deleteMessage'
            ]);
            expect(call.mock.calls[2][1]).toMatchObject({ message_id: 42 });
        });

        test('should emit an error event when the delete fails', async () => {
            const deleteError = new Error('Bad Request: message to delete not found');
            const call = mock((method: string, _params: CallParams) =>
                method == 'deleteMessage'
                    ? Promise.reject(deleteError)
                    : Promise.resolve({ message_id: 42 })
            );
            const { api, eventEmitter } = createApi(call);
            const errors: Error[] = [];
            eventEmitter.on(BotEventType.error, (_timestamp, { error }) => {
                errors.push(error);
            });
            const message = createMessage();
            message.postSendOperations.push({
                kind: 'deleteAfterTimeout',
                timeout: 0 as Milliseconds
            });

            await process(api, message);
            await setTimeout(20);

            expect(errors).toEqual([deleteError]);
        });

        test('should wrap a non-Error failure of the delete', async () => {
            const call = mock((method: string, _params: CallParams) =>
                method == 'deleteMessage'
                    ? Promise.reject('not an error')
                    : Promise.resolve({ message_id: 42 })
            );
            const { api, eventEmitter } = createApi(call);
            const errors = collectErrors(eventEmitter);
            const message = createMessage();
            message.postSendOperations.push({
                kind: 'deleteAfterTimeout',
                timeout: 0 as Milliseconds
            });

            await process(api, message);
            await setTimeout(20);

            expect(errors).toEqual([new Error('Unknown error')]);
        });
    });

    describe('pin', () => {
        test('should run the operations after a failed pin and report the error', async () => {
            const pinError = new Error('Bad Request: not enough rights to pin a message');
            const call = mock((method: string, _params: CallParams) =>
                method == 'pinChatMessage'
                    ? Promise.reject(pinError)
                    : Promise.resolve({ message_id: 42 })
            );
            const { api, eventEmitter, registerCapture } = createApi(call);
            const errors = collectErrors(eventEmitter);
            const message = createMessage(new ReplyInfo(100));
            message.postSendOperations.push(
                { kind: 'pin' },
                createCapture(),
                {
                    kind: 'deleteAfterTimeout',
                    timeout: 0 as Milliseconds
                }
            );

            await process(api, message);
            await setTimeout(20);

            expect(errors).toEqual([pinError]);
            expect(registerCapture).toHaveBeenCalledTimes(1);
            expect(call.mock.calls.map(([method]) => method)).toEqual([
                'sendMessage',
                'pinChatMessage',
                'deleteMessage'
            ]);
        });

        test('should wrap a non-Error failure of the pin', async () => {
            const call = mock((method: string, _params: CallParams) =>
                method == 'pinChatMessage'
                    ? Promise.reject('not an error')
                    : Promise.resolve({ message_id: 42 })
            );
            const { api, eventEmitter } = createApi(call);
            const errors = collectErrors(eventEmitter);
            const message = createMessage();
            message.postSendOperations.push({ kind: 'pin' });

            await process(api, message);

            expect(errors).toEqual([new Error('Unknown error')]);
        });
    });

    describe('stop', () => {
        test('should cancel pending deleteAfter timers and leave the messages', async () => {
            const call = mock((method: string, _params: CallParams) =>
                Promise.resolve(
                    method == 'sendMessage' ? { message_id: 42 } : true
                )
            );
            const { api, eventEmitter } = createApi(call);
            const errors: Error[] = [];
            eventEmitter.on(BotEventType.error, (_timestamp, { error }) => {
                errors.push(error);
            });
            const message = createMessage();
            message.postSendOperations.push({
                kind: 'deleteAfterTimeout',
                timeout: 20 as Milliseconds
            });

            await process(api, message);
            await api.stop();
            await setTimeout(40);

            expect(call.mock.calls.map(([method]) => method)).toEqual([
                'sendMessage'
            ]);
            expect(errors).toEqual([]);
        });

        test('should send the queued responses that are due', async () => {
            const call = mock((method: string, _params: CallParams) =>
                Promise.resolve(
                    method == 'sendMessage' ? { message_id: 42 } : true
                )
            );
            const { api } = createApi(call);

            api.enqueueBatchedResponses([createMessage()]);
            await api.stop();

            expect(call.mock.calls.map(([method]) => method)).toEqual([
                'sendMessage'
            ]);
        });
    });
});
