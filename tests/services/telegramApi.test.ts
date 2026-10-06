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
import { ReplyCapture } from '../../src/types/postSendOperations';
import { TELEGRAM_ERROR_QUOTE_INVALID } from '../../src/helpers/constants';
import { createMockStorage } from './actionProcessors/processorTestHelpers';

type CallParams = { reply_parameters?: unknown; message_id?: number };

const action: IAction = {
    key: 'test:action' as ActionKey,
    exec: () => Promise.resolve([])
};

function createApi(
    call: (method: string, params: CallParams) => Promise<unknown>
) {
    const eventEmitter = new TypedEventEmitter();
    const registerCapture = mock(
        (_capture: ReplyCapture, _parentMessageId: number) => {}
    );
    const api = new TelegramApiService(
        'TestBot',
        { call } as unknown as BotApiClient,
        createMockStorage(),
        eventEmitter,
        registerCapture
    );

    return { api, eventEmitter, registerCapture };
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
    await api['queue']['items'][0].callback();
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
});
