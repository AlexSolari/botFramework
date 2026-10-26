import { Sema as Semaphore } from 'async-sema';
import { Noop } from '../../helpers/noop';
import { IActionState } from '../../types/actionState';
import { IStorageClient } from '../../types/storage';
import { ReplyContextInternal } from '../context/replyContext';
import { ReplyCaptureActionInternal } from './replyCaptureAction';
import {
    PersistentReplyCapture,
    PersistentReplyCaptureRecord
} from '../persistentReplyCapture';

export type PersistentReplyCaptureAction<TData extends object> = Omit<
    PersistentReplyCaptureActionInternal<TData>,
    'exec'
>;

export class PersistentReplyCaptureActionInternal<
    TData extends object
> extends ReplyCaptureActionInternal<IActionState> {
    readonly definition: PersistentReplyCapture<TData>;
    readonly record: PersistentReplyCaptureRecord<TData>;
    private readonly lock: Semaphore | undefined;

    constructor(
        captureId: number,
        definition: PersistentReplyCapture<TData>,
        record: PersistentReplyCaptureRecord<TData>
    ) {
        super(
            captureId,
            definition.storageKey,
            async (ctx) => {
                const data = structuredClone(record.data);
                await definition.handler(ctx, data);
                record.data = data;
            },
            definition.triggers,
            new AbortController()
        );

        this.definition = definition;
        this.record = record;

        if (definition.maxAllowedSimultaniousExecutions != 0)
            this.lock = new Semaphore(
                definition.maxAllowedSimultaniousExecutions
            );
    }

    get expiresAt() {
        return this.definition.expiresAfter == undefined
            ? undefined
            : this.record.createdAt + this.definition.expiresAfter;
    }

    get isExpired() {
        const expiresAt = this.expiresAt;

        return expiresAt != undefined && Date.now() >= expiresAt;
    }

    tracksMessage(messageId: number | undefined) {
        return (
            messageId != undefined &&
            this.record.parentMessageIds.includes(messageId)
        );
    }

    addParentMessage(messageId: number) {
        if (!this.tracksMessage(messageId))
            this.record.parentMessageIds.push(messageId);
    }

    removeParentMessage(messageId: number) {
        const index = this.record.parentMessageIds.indexOf(messageId);
        if (index != -1) this.record.parentMessageIds.splice(index, 1);
    }

    async save(storage: IStorageClient, chatId: number) {
        if (this.abortController.signal.aborted) return;

        await storage.updateStateFor(
            this.definition.storageKey,
            chatId,
            (state) => {
                state.captures[this.parentMessageId] = structuredClone(
                    this.record
                );
            }
        );
    }

    async exec(ctx: ReplyContextInternal<IActionState>) {
        await this.lock?.acquire();

        try {
            if (this.abortController.signal.aborted) return Noop.NoResponse;

            const responses = await super.exec(ctx);
            await this.save(ctx.storage, ctx.chatInfo.id);

            return responses;
        } finally {
            this.lock?.release();
        }
    }
}
