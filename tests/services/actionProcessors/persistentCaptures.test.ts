import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { setTimeout } from 'timers/promises';
import { CommandActionProcessor } from '../../../src/services/actionProcessors/commandActionProcessor';
import { JsonFileStorage } from '../../../src/services/jsonFileStorage';
import { BotEventType, TypedEventEmitter } from '../../../src/types/events';
import { PersistentReplyCaptureBuilder } from '../../../src/helpers/builders/persistentReplyCaptureBuilder';
import { PersistentReplyCapture } from '../../../src/entities/persistentReplyCapture';
import { ChatInfo } from '../../../src/dtos/chatInfo';
import { TraceId } from '../../../src/types/trace';
import { Milliseconds } from '../../../src/types/timeValues';
import type { Message } from '../../../src/types/botApi.generated';
import type { BotInfo } from '../../../src/types/botInfo';
import type { CommandTrigger } from '../../../src/types/commandTrigger';
import type { ReplyContext } from '../../../src/entities/context/replyContext';
import type { IActionState } from '../../../src/types/actionState';
import type { TextMessage } from '../../../src/dtos/responses/textMessage';
import type { ContinuePersistentReplyCaptureOperation } from '../../../src/types/postSendOperations';
import {
    createMockAction,
    createMockScheduler,
    createMockTelegramApi
} from './processorTestHelpers';

type GuessData = { secret: number; attempts: number };

const STORAGE_ROOT = 'test-storage-persistent-captures';
let testRun = 0;
let STORAGE_PATH = STORAGE_ROOT;
const BOT_NAME = 'capture-bot';
const CHAT_ID = 12345;
const PARENT_MESSAGE_ID = 42;
const traceId = 'trace:test' as TraceId;
const chatInfo = new ChatInfo(CHAT_ID, 'Test Chat', []);

const botInfo = {
    id: 111,
    is_bot: true,
    first_name: 'TestBot',
    username: 'testbot'
} as unknown as BotInfo;

function capturePath(name: string) {
    return `${STORAGE_PATH}/${BOT_NAME}/persistentCapture/${name}.json`;
}

type SavedRecord = { parentMessageIds: number[]; data: GuessData; createdAt: number };

function readCaptures(name: string) {
    const content = JSON.parse(readFileSync(capturePath(name), 'utf-8')) as
        Record<number, { captures: Record<number, SavedRecord> }>;

    return content[CHAT_ID].captures;
}

function buildGuessCapture(
    handler: (ctx: ReplyContext<IActionState>, data: GuessData) => Promise<void> | void,
    expiresAfter?: Milliseconds
) {
    const builder = new PersistentReplyCaptureBuilder<GuessData>('guess')
        .on([/\d+/])
        .do(handler);
    if (expiresAfter != undefined) builder.expiresAfter(expiresAfter);

    return builder.build();
}

function guessHandler(ctx: ReplyContext<IActionState>, data: GuessData) {
    data.attempts++;
    if (Number(ctx.messageInfo.text) == data.secret) ctx.stopCapture();
}

function continuingGuessHandler(ctx: ReplyContext<IActionState>, data: GuessData) {
    data.attempts++;
    if (Number(ctx.messageInfo.text) == data.secret) {
        ctx.stopCapture();
    } else {
        ctx.reply.withText('Wrong, try again').captureReplies({ continueCapture: true });
    }
}

function replyMessage(text: string, replyTo = PARENT_MESSAGE_ID): Message {
    return {
        message_id: 100,
        date: Math.floor(Date.now() / 1000),
        chat: { id: CHAT_ID, type: 'private' as const },
        from: { id: 1, is_bot: false, first_name: 'User' },
        text,
        reply_to_message: { message_id: replyTo }
    } as unknown as Message;
}

function startBot(
    definitions: PersistentReplyCapture<object>[],
    eventEmitter = new TypedEventEmitter()
) {
    const storage = new JsonFileStorage(
        BOT_NAME,
        definitions.map((x) => x.storageKey),
        STORAGE_PATH
    );
    const processor = new CommandActionProcessor(
        BOT_NAME,
        storage,
        createMockScheduler(),
        eventEmitter
    );
    let onMessage: ((message: Message) => void) | undefined;
    const telegram = {
        on: (_event: string, handler: (message: Message) => void) => {
            onMessage = handler;
        }
    };

    const api = createMockTelegramApi();
    processor.initialize(
        api,
        telegram as unknown as Parameters<typeof processor.initialize>[1],
        [],
        botInfo,
        undefined,
        definitions
    );

    return {
        storage,
        processor,
        hasMessageListener: () => onMessage != undefined,
        // Simulates Telegram sending the last queued response as `messageId`.
        sendLastResponseAs: async (messageId: number) => {
            const response = api.getEnqueueLastArgs()?.[0] as TextMessage;
            for (const operation of response.postSendOperations) {
                if (operation.kind != 'continuePersistentReplies') continue;

                processor.captures.continuePersistentCapture(
                    operation as ContinuePersistentReplyCaptureOperation,
                    messageId,
                    chatInfo,
                    traceId
                );
            }
            await processor.waitForProcessing();
        },
        receive: async (message: Message) => {
            onMessage?.(message);
            await processor.waitForProcessing();
        },
        stop: async () => {
            await processor.waitForProcessing();
            processor.captures.stop();
            await storage.close();
        }
    };
}

async function startCapture(
    processor: CommandActionProcessor,
    definition: PersistentReplyCapture<object>,
    data: object,
    parentMessageId = PARENT_MESSAGE_ID
) {
    processor.captures.registerPersistentCapture(
        { kind: 'capturePersistentReplies', definition, data },
        parentMessageId,
        chatInfo,
        traceId
    );
    await processor.waitForProcessing();
}

describe('persistent reply captures', () => {
    beforeEach(() => {
        STORAGE_PATH = `${STORAGE_ROOT}/${++testRun}`;
    });

    afterEach(() => {
        rmSync(STORAGE_ROOT, { recursive: true, force: true });
    });

    test('should register a message listener when only persistent captures are provided', async () => {
        const bot = startBot([buildGuessCapture(guessHandler)]);

        expect(bot.hasMessageListener()).toBe(true);
        await bot.stop();
    });

    test('should save a started capture with its data and chat name', async () => {
        const definition = buildGuessCapture(guessHandler);
        const bot = startBot([definition]);

        await startCapture(bot.processor, definition, { secret: 5, attempts: 0 });

        const content = JSON.parse(readFileSync(capturePath('guess'), 'utf-8')) as
            Record<number, { captures: Record<number, { data: GuessData; chatName: string; createdAt: number }> }>;
        const record = content[CHAT_ID].captures[PARENT_MESSAGE_ID];
        expect(record.data).toEqual({ secret: 5, attempts: 0 });
        expect(record.chatName).toBe('Test Chat');
        expect(typeof record.createdAt).toBe('number');
        await bot.stop();
    });

    test('should save data changes after each handled reply', async () => {
        const definition = buildGuessCapture(guessHandler);
        const bot = startBot([definition]);
        await startCapture(bot.processor, definition, { secret: 5, attempts: 0 });

        await bot.receive(replyMessage('3'));
        await bot.receive(replyMessage('4'));

        expect(readCaptures('guess')[PARENT_MESSAGE_ID].data).toEqual({
            secret: 5,
            attempts: 2
        });
        await bot.stop();
    });

    test('should survive a restart and stop only when the handler calls stopCapture', async () => {
        const firstDefinition = buildGuessCapture(guessHandler);
        const firstRun = startBot([firstDefinition]);
        await startCapture(firstRun.processor, firstDefinition, {
            secret: 5,
            attempts: 0
        });
        await firstRun.receive(replyMessage('1'));
        await firstRun.stop();

        const handler = mock(guessHandler);
        const eventEmitter = new TypedEventEmitter();
        const restored: unknown[] = [];
        eventEmitter.on(BotEventType.commandActionCaptureRestored, (_ts, data) => {
            restored.push(data);
        });
        const secondRun = startBot([buildGuessCapture(handler)], eventEmitter);

        expect(restored).toHaveLength(1);
        expect(restored[0]).toMatchObject({
            parentMessageId: PARENT_MESSAGE_ID,
            chatInfo: { id: CHAT_ID, name: 'Test Chat' }
        });

        await secondRun.receive(replyMessage('2'));
        expect(handler.mock.calls[0][1]).toEqual({ secret: 5, attempts: 2 });

        await secondRun.receive(replyMessage('5'));
        expect(readCaptures('guess')).toEqual({});

        await secondRun.receive(replyMessage('5'));
        expect(handler).toHaveBeenCalledTimes(2);
        await secondRun.stop();
    });

    test('should drop expired captures on restore', async () => {
        const definition = buildGuessCapture(guessHandler, 1000 as Milliseconds);
        const filePath = capturePath('guess');
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(
            filePath,
            JSON.stringify({
                [CHAT_ID]: {
                    lastExecutedDate: 0,
                    pinnedMessages: [],
                    captures: {
                        [PARENT_MESSAGE_ID]: {
                            parentMessageIds: [PARENT_MESSAGE_ID],
                            data: { secret: 5, attempts: 0 },
                            chatName: 'Test Chat',
                            createdAt: Date.now() - 5000
                        },
                        43: {
                            parentMessageIds: [43],
                            data: { secret: 6, attempts: 0 },
                            chatName: 'Test Chat',
                            createdAt: Date.now()
                        }
                    }
                }
            })
        );
        const eventEmitter = new TypedEventEmitter();
        const aborted: unknown[] = [];
        eventEmitter.on(BotEventType.commandActionCaptureAborted, (_ts, data) => {
            aborted.push(data);
        });

        const bot = startBot([definition], eventEmitter);
        await bot.processor.waitForProcessing();

        expect(aborted).toEqual([
            { parentMessageId: PARENT_MESSAGE_ID, chatInfo: expect.anything(), traceId: expect.anything() }
        ]);
        expect(Object.keys(readCaptures('guess'))).toEqual(['43']);
        await bot.stop();
    });

    test('should stop expired captures when a message arrives in the chat', async () => {
        const handler = mock(guessHandler);
        const definition = buildGuessCapture(handler, 10 as Milliseconds);
        const bot = startBot([definition]);
        await startCapture(bot.processor, definition, { secret: 5, attempts: 0 });

        await setTimeout(20);
        await bot.receive(replyMessage('5'));

        expect(handler).not.toHaveBeenCalled();
        expect(readCaptures('guess')).toEqual({});
        await bot.stop();
    });

    describe('withRatelimit', () => {
        async function measureConcurrentReplies(ratelimit?: number) {
            let running = 0;
            let maxRunning = 0;
            const builder = new PersistentReplyCaptureBuilder<GuessData>('guess')
                .on([/\d+/])
                .do(async (_ctx, data) => {
                    running++;
                    maxRunning = Math.max(maxRunning, running);
                    await setTimeout(10);
                    data.attempts++;
                    running--;
                });
            if (ratelimit != undefined) builder.withRatelimit(ratelimit);
            const definition = builder.build();
            const bot = startBot([definition]);
            await startCapture(bot.processor, definition, { secret: 5, attempts: 0 });

            await Promise.all([
                bot.receive(replyMessage('1')),
                bot.receive(replyMessage('2'))
            ]);

            const attempts = readCaptures('guess')[PARENT_MESSAGE_ID].data.attempts;
            await bot.stop();

            return { maxRunning, attempts };
        }

        test('should run replies to the same capture concurrently by default', async () => {
            expect(await measureConcurrentReplies()).toEqual({
                maxRunning: 2,
                attempts: 2
            });
        });

        test('should run replies to the same capture one at a time with withRatelimit(1)', async () => {
            expect(await measureConcurrentReplies(1)).toEqual({
                maxRunning: 1,
                attempts: 2
            });
        });

        test('should skip replies waiting for the lock once the handler stopped the capture', async () => {
            const handler = mock(
                async (ctx: ReplyContext<IActionState>, data: GuessData) => {
                    await setTimeout(10);
                    guessHandler(ctx, data);
                }
            );
            const definition = new PersistentReplyCaptureBuilder<GuessData>('guess')
                .on([/\d+/])
                .withRatelimit(1)
                .do(handler)
                .build();
            const bot = startBot([definition]);
            await startCapture(bot.processor, definition, { secret: 5, attempts: 0 });

            await Promise.all([
                bot.receive(replyMessage('5')),
                bot.receive(replyMessage('5'))
            ]);

            expect(handler).toHaveBeenCalledTimes(1);
            expect(readCaptures('guess')).toEqual({});
            await bot.stop();
        });
    });

    test('should emit an error and save nothing for an unregistered capture', async () => {
        const eventEmitter = new TypedEventEmitter();
        const errors: Error[] = [];
        eventEmitter.on(BotEventType.error, (_ts, { error }) => {
            errors.push(error);
        });
        const bot = startBot([buildGuessCapture(guessHandler)], eventEmitter);
        const unregistered = new PersistentReplyCaptureBuilder<GuessData>('other')
            .on([/\d+/])
            .build();

        await startCapture(bot.processor, unregistered, { secret: 5, attempts: 0 });

        expect(errors).toHaveLength(1);
        expect(errors[0].message).toContain('other');
        expect(existsSync(capturePath('other'))).toBe(false);
        await bot.stop();
    });

    test('should handle a reply that arrives while the started capture is being saved', async () => {
        const handler = mock(guessHandler);
        const definition = buildGuessCapture(handler);
        const bot = startBot([definition]);

        const starting = startCapture(bot.processor, definition, { secret: 5, attempts: 0 });
        await bot.receive(replyMessage('1'));
        await starting;

        expect(handler).toHaveBeenCalledTimes(1);
        expect(readCaptures('guess')[PARENT_MESSAGE_ID].data).toEqual({ secret: 5, attempts: 1 });
        await bot.stop();
    });

    test('should not save a capture whose message is deleted while it is being saved', async () => {
        const definition = buildGuessCapture(guessHandler);
        const bot = startBot([definition]);

        const starting = startCapture(bot.processor, definition, { secret: 5, attempts: 0 });
        bot.processor.captures.messageDeleted(chatInfo, PARENT_MESSAGE_ID, traceId);
        await starting;
        await bot.processor.waitForProcessing();

        expect(readCaptures('guess')).toEqual({});
        await bot.stop();
    });

    test('should emit an error and keep the first capture when the same capture is started twice for a message', async () => {
        const eventEmitter = new TypedEventEmitter();
        const errors: Error[] = [];
        eventEmitter.on(BotEventType.error, (_ts, { error }) => {
            errors.push(error);
        });
        const handler = mock(guessHandler);
        const definition = buildGuessCapture(handler);
        const bot = startBot([definition], eventEmitter);

        await startCapture(bot.processor, definition, { secret: 5, attempts: 0 });
        await startCapture(bot.processor, definition, { secret: 7, attempts: 0 });
        await bot.receive(replyMessage('1'));

        expect(errors).toHaveLength(1);
        expect(errors[0].message).toContain('already started');
        expect(handler).toHaveBeenCalledTimes(1);
        expect(readCaptures('guess')[PARENT_MESSAGE_ID].data).toEqual({ secret: 5, attempts: 1 });
        await bot.stop();
    });

    test('should not save when the handler leaves the data unchanged', async () => {
        const handler = mock(() => {});
        const definition = buildGuessCapture(handler);
        const bot = startBot([definition]);
        await startCapture(bot.processor, definition, { secret: 5, attempts: 0 });
        const updateStateFor = spyOn(bot.storage, 'updateStateFor');

        await bot.receive(replyMessage('1'));

        expect(handler).toHaveBeenCalledTimes(1);
        expect(updateStateFor).not.toHaveBeenCalled();
        await bot.stop();
    });

    test('should discard data changes of a handler that throws', async () => {
        const definition = buildGuessCapture((_ctx, data) => {
            data.attempts++;
            if (_ctx.messageInfo.text == '9') throw new Error('Handler failed');
        });
        const bot = startBot([definition]);
        await startCapture(bot.processor, definition, { secret: 5, attempts: 0 });

        await bot.receive(replyMessage('9'));
        await bot.receive(replyMessage('1'));

        expect(readCaptures('guess')[PARENT_MESSAGE_ID].data).toEqual({ secret: 5, attempts: 1 });
        await bot.stop();
    });

    test('should stop an expired capture without waiting for a message', async () => {
        const definition = buildGuessCapture(guessHandler, 10 as Milliseconds);
        const bot = startBot([definition]);
        await startCapture(bot.processor, definition, { secret: 5, attempts: 0 });

        await setTimeout(30);
        await bot.processor.waitForProcessing();

        expect(readCaptures('guess')).toEqual({});
        await bot.stop();
    });

    test('should keep a capture whose expiration is longer than the maximum timer delay', async () => {
        const definition = buildGuessCapture(guessHandler, (30 * 24 * 60 * 60 * 1000) as Milliseconds);
        const bot = startBot([definition]);
        await startCapture(bot.processor, definition, { secret: 5, attempts: 0 });

        await setTimeout(20);
        await bot.processor.waitForProcessing();

        expect(readCaptures('guess')[PARENT_MESSAGE_ID]).toBeDefined();
        await bot.stop();
    });

    test('should not stop expired captures after the registry is stopped', async () => {
        const definition = buildGuessCapture(guessHandler, 10 as Milliseconds);
        const bot = startBot([definition]);
        const starting = startCapture(bot.processor, definition, { secret: 5, attempts: 0 });
        bot.processor.captures.stop();
        await starting;

        await setTimeout(30);
        await bot.processor.waitForProcessing();

        expect(readCaptures('guess')[PARENT_MESSAGE_ID]).toBeDefined();
        await bot.stop();
    });

    test('should skip a capture stopped by another capture on the same message', async () => {
        const bot = startBot([buildGuessCapture(guessHandler)]);
        const abortController = new AbortController();
        const registerSimple = (handler: () => Promise<void>) => {
            bot.processor.captures.registerCapture(
                {
                    kind: 'captureReplies',
                    action: createMockAction('parent-action'),
                    handler,
                    trigger: [/\d+/],
                    abortController
                },
                PARENT_MESSAGE_ID,
                chatInfo,
                traceId
            );
        };
        const secondHandler = mock(() => Promise.resolve());
        registerSimple(() => {
            abortController.abort();
            return Promise.resolve();
        });
        registerSimple(secondHandler);

        await bot.receive(replyMessage('1'));

        expect(secondHandler).not.toHaveBeenCalled();
        await bot.stop();
    });

    test('should not save unfinished data changes when another capture of the same definition is saved', async () => {
        const definition = buildGuessCapture(async (_ctx, data) => {
            data.attempts++;
            if (data.secret == 1) {
                await setTimeout(30);
                throw new Error('Handler failed');
            }
        });
        const bot = startBot([definition]);
        await startCapture(bot.processor, definition, { secret: 1, attempts: 0 }, 42);
        await startCapture(bot.processor, definition, { secret: 2, attempts: 0 }, 43);

        await Promise.all([
            bot.receive(replyMessage('1', 42)),
            bot.receive(replyMessage('1', 43))
        ]);

        expect(readCaptures('guess')[42].data).toEqual({ secret: 1, attempts: 0 });
        expect(readCaptures('guess')[43].data).toEqual({ secret: 2, attempts: 1 });
        await bot.stop();
    });

    test('should throw when two capture names have the same storage key', () => {
        const build = (name: string) =>
            new PersistentReplyCaptureBuilder<GuessData>(name).on([/\d+/]).build();

        expect(() => startBot([build('game.guess'), build('game-guess')])).toThrow(
            'Persistent captures game.guess and game-guess have the same storage key'
        );
    });

    test('should throw when two captures share a name', () => {
        expect(() =>
            startBot([buildGuessCapture(guessHandler), buildGuessCapture(guessHandler)])
        ).toThrow('Persistent capture guess is registered more than once.');
    });

    test('should stop persistent and simple captures of a deleted message', async () => {
        const persistentHandler = mock(guessHandler);
        const definition = buildGuessCapture(persistentHandler);
        const bot = startBot([definition]);
        await startCapture(bot.processor, definition, { secret: 5, attempts: 0 });

        const simpleHandler = mock(() => Promise.resolve());
        const otherMessageHandler = mock(() => Promise.resolve());
        const registerSimple = (
            handler: () => Promise<void>,
            parentMessageId: number,
            trigger: CommandTrigger[]
        ) => {
            bot.processor.captures.registerCapture(
                {
                    kind: 'captureReplies',
                    action: createMockAction('parent-action'),
                    handler,
                    trigger,
                    abortController: new AbortController()
                },
                parentMessageId,
                chatInfo,
                traceId
            );
        };
        registerSimple(simpleHandler, PARENT_MESSAGE_ID, [/\d+/]);
        registerSimple(otherMessageHandler, 43, [/\d+/]);

        bot.processor.captures.messageDeleted(chatInfo, PARENT_MESSAGE_ID, traceId);
        await bot.receive(replyMessage('5'));
        await bot.receive(replyMessage('5', 43));

        expect(persistentHandler).not.toHaveBeenCalled();
        expect(simpleHandler).not.toHaveBeenCalled();
        expect(otherMessageHandler).toHaveBeenCalledTimes(1);
        expect(readCaptures('guess')).toEqual({});
        await bot.stop();
    });

    describe('continueCapture', () => {
        test('should handle replies to added messages with the same data, also after a restart', async () => {
            const firstDefinition = buildGuessCapture(continuingGuessHandler);
            const firstRun = startBot([firstDefinition]);
            await startCapture(firstRun.processor, firstDefinition, {
                secret: 5,
                attempts: 0
            });
            const createdAt = readCaptures('guess')[PARENT_MESSAGE_ID].createdAt;

            await firstRun.receive(replyMessage('1'));
            await firstRun.sendLastResponseAs(43);
            await firstRun.receive(replyMessage('2', 43));
            await firstRun.sendLastResponseAs(44);

            expect(readCaptures('guess')).toEqual({
                [PARENT_MESSAGE_ID]: expect.objectContaining({
                    parentMessageIds: [PARENT_MESSAGE_ID, 43, 44],
                    data: { secret: 5, attempts: 2 },
                    createdAt
                })
            });
            await firstRun.stop();

            const handler = mock(continuingGuessHandler);
            const secondRun = startBot([buildGuessCapture(handler)]);

            await secondRun.receive(replyMessage('5', 44));
            expect(handler.mock.calls[0][1]).toEqual({ secret: 5, attempts: 3 });
            expect(readCaptures('guess')).toEqual({});

            await secondRun.receive(replyMessage('5', PARENT_MESSAGE_ID));
            expect(handler).toHaveBeenCalledTimes(1);
            await secondRun.stop();
        });

        test('should emit captureStarted for each added message', async () => {
            const eventEmitter = new TypedEventEmitter();
            const started: number[] = [];
            eventEmitter.on(BotEventType.commandActionCaptureStarted, (_ts, data) => {
                started.push(data.parentMessageId);
            });
            const definition = buildGuessCapture(continuingGuessHandler);
            const bot = startBot([definition], eventEmitter);
            await startCapture(bot.processor, definition, { secret: 5, attempts: 0 });

            await bot.receive(replyMessage('1'));
            await bot.sendLastResponseAs(43);

            expect(started).toEqual([PARENT_MESSAGE_ID, 43]);
            await bot.stop();
        });

        test('should ignore a message added by a handler that also stopped the capture', async () => {
            const definition = buildGuessCapture((ctx) => {
                ctx.stopCapture();
                ctx.reply.withText('Bye').captureReplies({ continueCapture: true });
            });
            const bot = startBot([definition]);
            await startCapture(bot.processor, definition, { secret: 5, attempts: 0 });

            await bot.receive(replyMessage('1'));
            await bot.sendLastResponseAs(43);
            await bot.processor.waitForProcessing();

            expect(readCaptures('guess')).toEqual({});
            await bot.stop();
        });

        test('should keep the capture until all of its messages are deleted', async () => {
            const eventEmitter = new TypedEventEmitter();
            const aborted: unknown[] = [];
            eventEmitter.on(BotEventType.commandActionCaptureAborted, (_ts, data) => {
                aborted.push(data);
            });
            const handler = mock(continuingGuessHandler);
            const definition = buildGuessCapture(handler);
            const bot = startBot([definition], eventEmitter);
            await startCapture(bot.processor, definition, { secret: 5, attempts: 0 });
            await bot.receive(replyMessage('1'));
            await bot.sendLastResponseAs(43);

            bot.processor.captures.messageDeleted(chatInfo, PARENT_MESSAGE_ID, traceId);
            await bot.processor.waitForProcessing();

            expect(aborted).toEqual([]);
            expect(readCaptures('guess')[PARENT_MESSAGE_ID].parentMessageIds).toEqual([43]);
            await bot.receive(replyMessage('2', PARENT_MESSAGE_ID));
            expect(handler).toHaveBeenCalledTimes(1);
            await bot.receive(replyMessage('2', 43));
            expect(handler).toHaveBeenCalledTimes(2);

            bot.processor.captures.messageDeleted(chatInfo, 43, traceId);
            await bot.processor.waitForProcessing();

            expect(aborted).toHaveLength(1);
            expect(readCaptures('guess')).toEqual({});
            await bot.stop();
        });
    });
});

