import { ChatInfo } from '../dtos/chatInfo';
import { IncomingMessage } from '../dtos/incomingMessage';
import { PersistentReplyCaptureActionInternal } from '../entities/actions/persistentReplyCaptureAction';
import { ReplyCaptureActionInternal } from '../entities/actions/replyCaptureAction';
import {
    PersistentReplyCapture,
    PersistentReplyCaptureRecord
} from '../entities/persistentReplyCapture';
import { MAX_TIMEOUT_DELAY } from '../helpers/constants';
import { getOrCreateIfNotExists } from '../helpers/mapUtils';
import { checkTriggers } from '../helpers/matchTriggers';
import { createTrace } from '../helpers/traceFactory';
import { ActionKey } from '../types/action';
import { IActionState } from '../types/actionState';
import { BotEventType, TypedEventEmitter } from '../types/events';
import {
    ContinuePersistentReplyCaptureOperation,
    PersistentReplyCaptureOperation,
    ReplyCapture
} from '../types/postSendOperations';
import { IStorageClient } from '../types/storage';
import { TraceId } from '../types/trace';
import { ChatHistory } from './chatHistory';
import { TelegramApiCallbacks } from './telegramApi';

export class ReplyCaptureRegistry implements TelegramApiCallbacks {
    private static readonly fallbackFactory: () => ReplyCaptureActionInternal<IActionState>[] =
        () => [];

    private readonly captures = new Map<
        number,
        ReplyCaptureActionInternal<IActionState>[]
    >();
    private readonly persistentCaptures = new Map<
        ActionKey,
        PersistentReplyCapture<object>
    >();
    private readonly abortListenerRemovers = new Map<
        ReplyCaptureActionInternal<IActionState>,
        () => void
    >();
    private readonly expiryTimers = new Map<
        PersistentReplyCaptureActionInternal<object>,
        NodeJS.Timeout
    >();

    private readonly botName: string;
    private readonly storage: IStorageClient;
    private readonly eventEmitter: TypedEventEmitter;
    private readonly chatHistory: ChatHistory;
    private readonly track: (processing: Promise<unknown>) => void;

    constructor(
        botName: string,
        storage: IStorageClient,
        eventEmitter: TypedEventEmitter,
        chatHistory: ChatHistory,
        track: (processing: Promise<unknown>) => void
    ) {
        this.botName = botName;
        this.storage = storage;
        this.eventEmitter = eventEmitter;
        this.chatHistory = chatHistory;
        this.track = track;
    }

    get hasPersistentCaptures() {
        return this.persistentCaptures.size > 0;
    }

    initialize(persistentCaptures: PersistentReplyCapture<object>[]) {
        for (const definition of persistentCaptures) {
            const registered = this.persistentCaptures.get(
                definition.storageKey.key
            );
            if (registered) {
                throw new Error(
                    registered.name == definition.name
                        ? `Persistent capture ${definition.name} is registered more than once.`
                        : `Persistent captures ${registered.name} and ${definition.name} have the same storage key ${definition.storageKey.key}.`
                );
            }

            this.persistentCaptures.set(definition.storageKey.key, definition);
        }

        this.restorePersistentCaptures();
    }

    stop() {
        for (const timer of this.expiryTimers.values()) {
            clearTimeout(timer);
        }

        this.expiryTimers.clear();
    }

    getCapturesFor(msg: IncomingMessage) {
        const chatCaptures = this.captures.get(msg.chatInfo.id);
        if (!chatCaptures) return [];

        for (const capture of chatCaptures.filter(
            (x) => x instanceof PersistentReplyCaptureActionInternal && x.isExpired
        )) {
            capture.abortController.abort();
        }

        return chatCaptures.filter(
            (capture) =>
                capture.tracksMessage(msg.replyToMessageId) &&
                checkTriggers(capture.triggers, msg.text, msg.type)
        );
    }

    registerCapture(
        capture: ReplyCapture,
        parentMessageId: number,
        chatInfo: ChatInfo,
        traceId: TraceId
    ) {
        const signal = capture.abortController.signal;
        if (signal.aborted) return;

        const replyAction = new ReplyCaptureActionInternal(
            parentMessageId,
            capture.action,
            capture.handler,
            capture.trigger,
            capture.abortController
        );

        this.eventEmitter.emit(BotEventType.commandActionCaptureStarted, {
            parentMessageId,
            chatInfo,
            traceId
        });

        this.getChatCaptures(chatInfo.id).push(replyAction);

        const onAbort = () => {
            this.removeCaptures(
                chatInfo,
                (x) => x.abortController == capture.abortController,
                traceId
            );
        };
        signal.addEventListener('abort', onAbort, { once: true });
        this.abortListenerRemovers.set(replyAction, () => {
            signal.removeEventListener('abort', onAbort);
        });
    }

    registerPersistentCapture(
        capture: PersistentReplyCaptureOperation,
        parentMessageId: number,
        chatInfo: ChatInfo,
        traceId: TraceId
    ) {
        const definition = capture.definition;
        if (
            this.persistentCaptures.get(definition.storageKey.key) != definition
        ) {
            this.eventEmitter.emit(BotEventType.error, {
                error: new Error(
                    `Persistent capture ${definition.name} is not registered in persistentCaptures, replies to message ${parentMessageId} are not captured.`
                ),
                traceId
            });

            return;
        }

        const isDuplicate = this.captures
            .get(chatInfo.id)
            ?.some(
                (x) =>
                    x instanceof PersistentReplyCaptureActionInternal &&
                    x.definition == definition &&
                    x.parentMessageId == parentMessageId
            );
        if (isDuplicate) {
            this.eventEmitter.emit(BotEventType.error, {
                error: new Error(
                    `Persistent capture ${definition.name} is already started for message ${parentMessageId}, the new capture is ignored.`
                ),
                traceId
            });

            return;
        }

        const record: PersistentReplyCaptureRecord<object> = {
            parentMessageIds: [parentMessageId],
            data: capture.data,
            chatName: chatInfo.name,
            createdAt: Date.now()
        };

        const persistentCapture = this.addPersistentCapture(
            definition,
            parentMessageId,
            chatInfo,
            record,
            traceId
        );

        this.eventEmitter.emit(BotEventType.commandActionCaptureStarted, {
            parentMessageId,
            chatInfo,
            traceId
        });

        this.track(
            this.saveNewPersistentCapture(persistentCapture, chatInfo, traceId)
        );
    }

    continuePersistentCapture(
        operation: ContinuePersistentReplyCaptureOperation,
        parentMessageId: number,
        chatInfo: ChatInfo,
        traceId: TraceId
    ) {
        const capture = operation.capture;
        if (capture.abortController.signal.aborted) return;

        capture.addParentMessage(parentMessageId);
        this.track(this.savePersistentCapture(capture, chatInfo, traceId));

        this.eventEmitter.emit(BotEventType.commandActionCaptureStarted, {
            parentMessageId,
            chatInfo,
            traceId
        });
    }

    messageDeleted(chatInfo: ChatInfo, messageId: number, traceId: TraceId) {
        const chatCaptures = this.captures.get(chatInfo.id);
        if (!chatCaptures) return;

        for (const capture of chatCaptures.filter(
            (x): x is PersistentReplyCaptureActionInternal<object> =>
                x instanceof PersistentReplyCaptureActionInternal &&
                x.tracksMessage(messageId)
        )) {
            capture.removeParentMessage(messageId);

            if (capture.record.parentMessageIds.length == 0) {
                capture.abortController.abort();
            } else {
                this.track(
                    this.savePersistentCapture(capture, chatInfo, traceId)
                );
            }
        }

        this.removeCaptures(
            chatInfo,
            (x) =>
                !(x instanceof PersistentReplyCaptureActionInternal) &&
                x.parentMessageId == messageId,
            traceId
        );
    }

    private restorePersistentCaptures() {
        const traceId = createTrace(this, this.botName, 'CaptureRestore');

        for (const definition of this.persistentCaptures.values()) {
            for (const [chatId, state] of Object.entries(
                this.storage.load(definition.storageKey)
            )) {
                for (const [captureId, record] of Object.entries(
                    state.captures
                )) {
                    const chatInfo = new ChatInfo(
                        Number(chatId),
                        record.chatName,
                        this.chatHistory.getFor(Number(chatId))
                    );

                    const capture = this.addPersistentCapture(
                        definition,
                        Number(captureId),
                        chatInfo,
                        structuredClone(record),
                        traceId
                    );

                    this.eventEmitter.emit(
                        BotEventType.commandActionCaptureRestored,
                        {
                            parentMessageId: capture.parentMessageId,
                            chatInfo,
                            traceId
                        }
                    );

                    if (capture.isExpired) capture.abortController.abort();
                }
            }
        }
    }

    private addPersistentCapture(
        definition: PersistentReplyCapture<object>,
        captureId: number,
        chatInfo: ChatInfo,
        record: PersistentReplyCaptureRecord<object>,
        traceId: TraceId
    ) {
        const capture = new PersistentReplyCaptureActionInternal(
            captureId,
            definition,
            record
        );

        this.getChatCaptures(chatInfo.id).push(capture);
        this.scheduleExpiry(capture);

        capture.abortController.signal.addEventListener(
            'abort',
            () => {
                clearTimeout(this.expiryTimers.get(capture));
                this.expiryTimers.delete(capture);
                this.removeCaptures(chatInfo, (x) => x == capture, traceId);
                this.track(
                    this.deletePersistentCapture(capture, chatInfo, traceId)
                );
            },
            { once: true }
        );

        return capture;
    }

    private scheduleExpiry(capture: PersistentReplyCaptureActionInternal<object>) {
        const expiresAt = capture.expiresAt;
        if (expiresAt == undefined) return;

        const delay = Math.min(
            Math.max(expiresAt - Date.now(), 0),
            MAX_TIMEOUT_DELAY
        );
        this.expiryTimers.set(
            capture,
            setTimeout(() => {
                if (capture.isExpired) {
                    capture.abortController.abort();
                } else {
                    this.scheduleExpiry(capture);
                }
            }, delay)
        );
    }

    private async saveNewPersistentCapture(
        capture: PersistentReplyCaptureActionInternal<object>,
        chatInfo: ChatInfo,
        traceId: TraceId
    ) {
        try {
            await capture.save(this.storage, chatInfo.id);
        } catch (error) {
            this.emitError(error, traceId);
            capture.abortController.abort();
        }
    }

    private async savePersistentCapture(
        capture: PersistentReplyCaptureActionInternal<object>,
        chatInfo: ChatInfo,
        traceId: TraceId
    ) {
        try {
            await capture.save(this.storage, chatInfo.id);
        } catch (error) {
            this.emitError(error, traceId);
        }
    }

    private async deletePersistentCapture(
        capture: PersistentReplyCaptureActionInternal<object>,
        chatInfo: ChatInfo,
        traceId: TraceId
    ) {
        try {
            await this.storage.updateStateFor(
                capture.definition.storageKey,
                chatInfo.id,
                (state) => {
                    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                    delete state.captures[capture.parentMessageId];
                }
            );
        } catch (error) {
            this.emitError(error, traceId);
        }
    }

    private getChatCaptures(chatId: number) {
        return getOrCreateIfNotExists(
            this.captures,
            chatId,
            ReplyCaptureRegistry.fallbackFactory
        );
    }

    private removeCaptures(
        chatInfo: ChatInfo,
        predicate: (capture: ReplyCaptureActionInternal<IActionState>) => boolean,
        traceId: TraceId
    ) {
        const chatCaptures = this.captures.get(chatInfo.id);
        if (!chatCaptures) return;

        for (const captureToRemove of chatCaptures.filter(predicate)) {
            chatCaptures.splice(chatCaptures.indexOf(captureToRemove), 1);
            this.abortListenerRemovers.get(captureToRemove)?.();
            this.abortListenerRemovers.delete(captureToRemove);

            this.eventEmitter.emit(BotEventType.commandActionCaptureAborted, {
                parentMessageId: captureToRemove.parentMessageId,
                chatInfo,
                traceId
            });
        }
    }

    private emitError(error: unknown, traceId: TraceId) {
        this.eventEmitter.emit(BotEventType.error, {
            error: error instanceof Error ? error : new Error('Unknown error'),
            traceId
        });
    }
}
