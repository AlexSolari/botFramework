import { IScheduler } from '../../types/scheduler';
import { IStorageClient } from '../../types/storage';
import { TelegramApiService } from '../telegramApi';
import { IAction } from '../../types/action';
import { BaseContextInternal } from '../../entities/context/baseContext';
import { BotEventType, TypedEventEmitter } from '../../types/events';
import { BotResponse } from '../../types/response';

export abstract class BaseActionProcessor {
    protected readonly storage: IStorageClient;
    protected readonly scheduler: IScheduler;
    protected readonly eventEmitter: TypedEventEmitter;

    protected readonly botName: string;

    protected api!: TelegramApiService;

    constructor(
        botName: string,
        storage: IStorageClient,
        scheduler: IScheduler,
        eventEmitter: TypedEventEmitter
    ) {
        this.storage = storage;
        this.scheduler = scheduler;
        this.eventEmitter = eventEmitter;

        this.botName = botName;
    }

    private defaultErrorHandler(
        error: Error,
        ctx: BaseContextInternal<IAction>
    ) {
        console.error(error);
        this.eventEmitter.emit(BotEventType.error, {
            error,
            traceId: ctx.observability.traceId
        });
    }

    initializeDependencies(api: TelegramApiService) {
        this.api = api;
    }

    async executeActionAndQueueResponses<
        TAction extends IAction,
        TActionContext extends BaseContextInternal<TAction>
    >(
        action: TAction,
        ctx: TActionContext,
        errorHandler?: (error: Error, ctx: TActionContext) => void
    ) {
        const responses = await this.runAction(action, ctx, errorHandler);

        this.api.enqueueBatchedResponses(responses);

        return responses;
    }

    protected async runAction<
        TAction extends IAction,
        TActionContext extends BaseContextInternal<TAction>
    >(
        action: TAction,
        ctx: TActionContext,
        errorHandler?: (error: Error, ctx: TActionContext) => void
    ): Promise<BotResponse[]> {
        try {
            return await action.exec(ctx);
        } catch (e) {
            const error = e as Error;

            if (errorHandler) {
                errorHandler(error, ctx);
            } else {
                this.defaultErrorHandler(error, ctx);
            }

            return [];
        }
    }
}
