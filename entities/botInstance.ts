import { Seconds } from '../types/timeValues';
import { IStorageClient } from '../types/storage';
import { JsonFileStorage } from '../services/jsonFileStorage';
import { IActionState } from '../types/actionState';
import { CommandAction } from './actions/commandAction';
import { ScheduledAction } from './actions/scheduledAction';
import { JsonLogger } from '../services/jsonLogger';
import { ILogger } from '../types/logger';
import { IScheduler } from '../types/scheduler';
import { NodeTimeoutScheduler } from '../services/nodeTimeoutScheduler';
import { createTrace } from '../helpers/traceFactory';
import { InlineQueryAction } from './actions/inlineQueryAction';
import { ActionProcessingService } from '../services/actionProcessingService';
import { BotEventType, TypedEventEmitter } from '../types/events';

export class BotInstance {
    private readonly storage: IStorageClient;
    private readonly scheduler: IScheduler;
    private readonly logger: ILogger;
    private readonly actionProcessingService: ActionProcessingService;

    readonly name: string;
    readonly eventEmitter = new TypedEventEmitter();

    constructor(options: {
        name: string;
        actions: {
            commands: CommandAction<IActionState>[];
            scheduled: ScheduledAction<IActionState>[];
            inlineQueries: InlineQueryAction[];
        };
        chats: Record<string, number>;
        storagePath?: string;
        services?: {
            storageClient?: IStorageClient;
            logger?: ILogger;
            scheduler?: IScheduler;
        };
    }) {
        const actions = [
            ...options.actions.commands,
            ...options.actions.scheduled
        ];

        this.name = options.name;

        this.logger = options.services?.logger ?? new JsonLogger();
        this.scheduler =
            options.services?.scheduler ??
            new NodeTimeoutScheduler(this.logger, this.eventEmitter);
        this.storage =
            options.services?.storageClient ??
            new JsonFileStorage(
                options.name,
                actions,
                this.eventEmitter,
                options.storagePath
            );
        this.actionProcessingService = new ActionProcessingService(
            this.name,
            options.chats,
            this.storage,
            this.scheduler,
            this.logger,
            this.eventEmitter
        );
    }

    async start(
        token: string,
        actions: {
            commands: CommandAction<IActionState>[];
            scheduled: ScheduledAction<IActionState>[];
            inlineQueries: InlineQueryAction[];
        },
        scheduledPeriod?: Seconds,
        verboseLoggingForIncomingMessage?: boolean
    ) {
        this.logger.logWithTraceId(
            this.name,
            createTrace(this, this.name, 'Start'),
            'System',
            'Starting bot...'
        );
        this.eventEmitter.emit(BotEventType.botStarting, {
            botName: this.name
        });

        await this.actionProcessingService.initialize(
            token,
            actions,
            scheduledPeriod,
            verboseLoggingForIncomingMessage
        );
    }

    async stop() {
        this.logger.logWithTraceId(
            this.name,
            createTrace(this, this.name, 'Stop'),
            'System',
            'Stopping bot...'
        );
        this.eventEmitter.emit(BotEventType.botStopping, {
            botName: this.name
        });

        this.scheduler.stopAll();
        await this.storage.close();
        this.actionProcessingService.stop();
    }
}
