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
    private startedExecutions = 0;
    private runningExecutions = 0;

    constructor(
        captureId: number,
        definition: PersistentReplyCapture<TData>,
        record: PersistentReplyCaptureRecord<TData>
    ) {
        super(
            captureId,
            definition.storageKey,
            async (ctx) => {
                await definition.handler(ctx, record.data);
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

            return await this.execTransactionally(ctx);
        } finally {
            this.lock?.release();
        }
    }

    private async execTransactionally(ctx: ReplyContextInternal<IActionState>) {
        const serializedDataBefore = JSON.stringify(this.record.data);

        const transaction = this.startTransaction();

        let responses;
        try {
            responses = await super.exec(ctx);
        } catch (error) {
            this.tryRollback(transaction, serializedDataBefore);

            throw error;
        } finally {
            await this.commitTransaction(serializedDataBefore, ctx);
        }

        return responses;
    }

    private startTransaction() {
        const isOnlyExecution = this.runningExecutions == 0;
        const executionNumber = ++this.startedExecutions;
        this.runningExecutions++;

        return { isOnlyExecution, executionNumber };
    }

    private tryRollback(
        transaction: { isOnlyExecution: boolean; executionNumber: number },
        serializedDataBefore: string
    ) {
        if (
            transaction.isOnlyExecution &&
            transaction.executionNumber == this.startedExecutions
        )
            this.record.data = JSON.parse(serializedDataBefore) as TData;
    }

    private async commitTransaction(
        serializedDataBefore: string,
        ctx: ReplyContextInternal<IActionState>
    ) {
        this.runningExecutions--;

        if (JSON.stringify(this.record.data) != serializedDataBefore)
            await this.save(ctx.storage, ctx.chatInfo.id);
    }
}
