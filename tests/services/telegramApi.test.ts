import { describe, test, expect, mock } from 'bun:test';
import { TelegramApiService } from '../../src/services/telegramApi';
import { BotApiClient } from '../../src/services/telegram/botApiClient';
import { TypedEventEmitter } from '../../src/types/events';
import { TextMessage } from '../../src/dtos/responses/textMessage';
import { ChatInfo } from '../../src/dtos/chatInfo';
import { ReplyInfo } from '../../src/dtos/replyInfo';
import { ActionKey, IAction } from '../../src/types/action';
import { TraceId } from '../../src/types/trace';
import { ReplyCapture } from '../../src/types/postSendOperations';
import { TELEGRAM_ERROR_QUOTE_INVALID } from '../../src/helpers/constants';
import { createMockStorage } from './actionProcessors/processorTestHelpers';

describe('TelegramApiService', () => {
    describe('reply error fallback', () => {
        test('should run post-send operations on the message sent without reply info', async () => {
            const call = mock((method: string, params: { reply_parameters?: unknown }) => {
                if (method == 'sendMessage' && params.reply_parameters) {
                    return Promise.reject(
                        new Error(`Bad Request: ${TELEGRAM_ERROR_QUOTE_INVALID}`)
                    );
                }

                return Promise.resolve(
                    method == 'sendMessage' ? { message_id: 42 } : true
                );
            });
            const registerCapture = mock(
                (_capture: ReplyCapture, _parentMessageId: number) => {}
            );
            const api = new TelegramApiService(
                'TestBot',
                { call } as unknown as BotApiClient,
                createMockStorage(),
                new TypedEventEmitter(),
                registerCapture
            );
            const action: IAction = {
                key: 'test:action' as ActionKey,
                exec: () => Promise.resolve([])
            };
            const message = new TextMessage(
                'Hello',
                new ChatInfo(12345, 'Test Chat', []),
                'trace:1' as TraceId,
                action,
                new ReplyInfo(100, 'missing quote')
            );
            const capture: ReplyCapture = {
                kind: 'captureReplies',
                trigger: [],
                handler: () => Promise.resolve(),
                abortController: new AbortController(),
                action
            };
            message.postSendOperations.push({ kind: 'pin' }, capture);

            api.enqueueBatchedResponses([message]);
            await api['queue']['items'][0].callback();

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
});
