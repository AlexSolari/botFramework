import { describe, test, expect, mock } from 'bun:test';
import { setTimeout } from 'timers/promises';
import { TelegramApiService } from '../../src/services/telegramApi';
import { BotApiClient } from '../../src/services/telegram/botApiClient';
import { BotEventType, TypedEventEmitter } from '../../src/types/events';
import { TextMessage } from '../../src/dtos/responses/textMessage';
import { ChatInfo } from '../../src/dtos/chatInfo';
import { ReplyInfo } from '../../src/dtos/replyInfo';
import { ActionKey, IAction } from '../../src/types/action';
import { TraceId } from '../../src/types/trace';
import { Milliseconds } from '../../src/types/timeValues';
import {
    ContinuePersistentReplyCaptureOperation,
    PersistentReplyCaptureOperation,
    ReplyCapture
} from '../../src/types/postSendOperations';
import { PersistentReplyCaptureActionInternal } from '../../src/entities/actions/persistentReplyCaptureAction';
import { TELEGRAM_ERROR_QUOTE_INVALID } from '../../src/helpers/constants';
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
    const api = new TelegramApiService(
        'TestBot',
        { call } as unknown as BotApiClient,
        createMockStorage(),
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

async function process(api: TelegramApiService, message: TextMessage) {
    api.enqueueBatchedResponses([message]);
    await api['queue']['items'].shift()!.callback();
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
