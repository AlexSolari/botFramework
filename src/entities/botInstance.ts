import { Seconds } from '../types/timeValues';
import { IStorageClient } from '../types/storage';
import { JsonFileStorage } from '../services/jsonFileStorage';
import { IActionState } from '../types/actionState';
import { CommandAction } from './actions/commandAction';
import { ScheduledAction } from './actions/scheduledAction';
import { IScheduler } from '../types/scheduler';
import { NodeTimeoutScheduler } from '../services/nodeTimeoutScheduler';
import { InlineQueryAction } from './actions/inlineQueryAction';
import { ActionProcessingService } from '../services/actionProcessingService';
import { BotEventType, TypedEventEmitter } from '../types/events';
import { createTrace } from '../helpers/traceFactory';

export class BotInstance {
    private readonly storage: IStorageClient;
    private readonly scheduler: IScheduler;
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
            scheduler?: IScheduler;
        };
    }) {
        const actions = [
            ...options.actions.commands,
            ...options.actions.scheduled
        ];

        this.name = options.name;

        this.scheduler =
            options.services?.scheduler ??
            new NodeTimeoutScheduler(this.eventEmitter, this.name);
        this.storage =
            options.services?.storageClient ??
            new JsonFileStorage(options.name, actions, options.storagePath);
        this.actionProcessingService = new ActionProcessingService(
            this.name,
            options.chats,
            this.storage,
            this.scheduler,
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
        scheduledPeriod?: Seconds
    ) {
        this.eventEmitter.emit(BotEventType.botStarting, {
            botName: this.name,
            traceId: createTrace(this, this.name, 'startup')
        });

        await this.actionProcessingService.initialize(
            token,
            actions,
            scheduledPeriod
        );
    }

    async stop() {
        this.eventEmitter.emit(BotEventType.botStopping, {
            botName: this.name,
            traceId: createTrace(this, this.name, 'stop')
        });

        this.scheduler.stopAll();
        await this.storage.close();
        this.actionProcessingService.stop();
    }
}
