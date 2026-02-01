import { IScheduler } from '../../types/scheduler';
import { IStorageClient } from '../../types/storage';
import { TelegramApiService } from '../telegramApi';
import { IAction } from '../../types/action';
import { BaseContextInternal } from '../../entities/context/baseContext';
import { BotEventType, TypedEventEmitter } from '../../types/events';

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
            traceId: ctx.traceId
        });
    }

    initializeDependencies(api: TelegramApiService) {
        this.api = api;
    }

    async executeAction<
        TAction extends IAction,
        TActionContext extends BaseContextInternal<TAction>
    >(
        action: TAction,
        ctx: TActionContext,
        errorHandler?: (error: Error, ctx: TActionContext) => void
    ) {
        try {
            const responses = await action.exec(ctx);

            this.api.enqueueBatchedResponses(responses);
        } catch (e) {
            const error = e as Error;

            if (errorHandler) {
                errorHandler(error, ctx);
            } else {
                this.defaultErrorHandler(error, ctx);
            }
        }
    }
}
