import { ILogger } from '../../types/logger';
import { IScheduler } from '../../types/scheduler';
import { IStorageClient } from '../../types/storage';
import { TelegramApiService } from '../telegramApi';
import { IAction } from '../../types/action';
import { BaseContext } from '../../entities/context/baseContext';

export abstract class BaseActionProcessor {
    protected readonly storage: IStorageClient;
    protected readonly scheduler: IScheduler;
    protected readonly logger: ILogger;

    protected readonly botName: string;

    protected api!: TelegramApiService;

    constructor(
        botName: string,
        storage: IStorageClient,
        scheduler: IScheduler,
        logger: ILogger
    ) {
        this.storage = storage;
        this.scheduler = scheduler;
        this.logger = logger;

        this.botName = botName;
    }

    private defaultErrorHandler<TAction extends IAction>(
        error: Error,
        ctx: BaseContext<TAction>
    ) {
        ctx.logger.errorWithTraceId(error, ctx);
    }

    initializeDependencies(api: TelegramApiService) {
        this.api = api;
    }

    async executeAction<
        TAction extends IAction,
        TActionContext extends BaseContext<TAction>
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
        }
    }
}
