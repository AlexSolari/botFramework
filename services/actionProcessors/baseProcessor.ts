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

    private defaultErrorHandler(error: Error) {
        this.eventEmitter.emit(BotEventType.error, { error });
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
            ctx.isInitialized = false;
        } catch (error) {
            (errorHandler ?? this.defaultErrorHandler)(error as Error, ctx);
            this.eventEmitter.emit(BotEventType.error, {
                error: error as Error
            });
        }
    }
}
