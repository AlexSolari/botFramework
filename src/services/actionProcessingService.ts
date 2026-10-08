import { Seconds } from '../types/timeValues';
import { IScheduler } from '../types/scheduler';
import { IStorageClient } from '../types/storage';
import { TelegramApiService } from './telegramApi';
import { InlineQueryAction } from '../entities/actions/inlineQueryAction';
import { IActionState } from '../types/actionState';
import { CommandAction } from '../entities/actions/commandAction';
import { ScheduledAction } from '../entities/actions/scheduledAction';
import { buildHelpCommand } from '../builtin/helpAction';
import { CommandActionProcessor } from './actionProcessors/commandActionProcessor';
import { InlineQueryActionProcessor } from './actionProcessors/inlineQueryActionProcessor';
import { ScheduledActionProcessor } from './actionProcessors/scheduledActionProcessor';
import { BotInfo } from '../types/botInfo';
import { BotEventType, TypedEventEmitter } from '../types/events';
import { DEFAULT_SCHEDULED_ACTION_PERIOD_SECONDS } from '../helpers/constants';
import { IncomingMessage } from '../dtos/incomingMessage';
import { BotApiClient } from './telegram/botApiClient';
import { UpdatePoller } from './telegram/updatePoller';
import { createTrace } from '../helpers/traceFactory';
import { PersistentReplyCapture } from '../entities/persistentReplyCapture';

export class ActionProcessingService {
    private readonly eventEmitter: TypedEventEmitter;
    private readonly storage: IStorageClient;
    private readonly commandProcessor: CommandActionProcessor;
    private readonly scheduledProcessor: ScheduledActionProcessor;
    private readonly inlineQueryProcessor: InlineQueryActionProcessor;

    private readonly botName: string;

    private telegramBot!: UpdatePoller;
    private api!: TelegramApiService;
    private polling: Promise<void> = Promise.resolve();

    constructor(
        botName: string,
        chats: Record<string, number>,
        storage: IStorageClient,
        scheduler: IScheduler,
        eventEmitter: TypedEventEmitter
    ) {
        this.storage = storage;
        this.eventEmitter = eventEmitter;

        this.commandProcessor = new CommandActionProcessor(
            botName,
            storage,
            scheduler,
            this.eventEmitter
        );
        this.scheduledProcessor = new ScheduledActionProcessor(
            botName,
            chats,
            storage,
            scheduler,
            this.eventEmitter
        );
        this.inlineQueryProcessor = new InlineQueryActionProcessor(
            botName,
            storage,
            scheduler,
            this.eventEmitter
        );

        this.botName = botName;
    }

    async initialize(
        token: string,
        actions: {
            commands: CommandAction<IActionState>[];
            scheduled: ScheduledAction<IActionState>[];
            inlineQueries: InlineQueryAction[];
            persistentCaptures?: PersistentReplyCapture<object>[];

            messageFilter?: (message: IncomingMessage) => boolean;
        },
        scheduledPeriod?: Seconds
    ) {
        const client = new BotApiClient(token);
        this.telegramBot = new UpdatePoller(client, (error) => {
            this.eventEmitter.emit(BotEventType.error, {
                error,
                traceId: createTrace(this, this.botName, 'Polling')
            });
        });
        this.api = new TelegramApiService(
            this.botName,
            client,
            this.storage,
            this.eventEmitter,
            this.commandProcessor.captures
        );

        const botUser = await client.call('getMe', {});
        if (!botUser.username) {
            throw new Error('getMe returned a bot without username');
        }
        const botInfo: BotInfo = { ...botUser, username: botUser.username };
        const commandActions =
            actions.commands.length > 0
                ? [
                      buildHelpCommand(
                          actions.commands
                              .map((x) => x.readmeFactory(botInfo.username))
                              .filter((x) => !!x),
                          botInfo.username
                      ),
                      ...actions.commands
                  ]
                : [];

        this.commandProcessor.initialize(
            this.api,
            this.telegramBot,
            commandActions,
            botInfo,
            actions.messageFilter,
            actions.persistentCaptures,
            actions.scheduled.length > 0
        );
        this.inlineQueryProcessor.initialize(
            this.api,
            this.telegramBot,
            actions.inlineQueries
        );
        this.scheduledProcessor.initialize(
            this.api,
            actions.scheduled,
            scheduledPeriod ?? DEFAULT_SCHEDULED_ACTION_PERIOD_SECONDS
        );

        this.polling = this.telegramBot.start();
    }

    /**
     * Stops receiving updates and waits until the last received one is confirmed to Telegram.
     * Waits for the processing in progress, then sends the responses that are due.
     */
    async stop() {
        this.telegramBot.stop();
        await this.polling;

        // Handlers only enqueue responses, so they must finish before the queue is drained.
        await Promise.all([
            this.commandProcessor.waitForProcessing(),
            this.inlineQueryProcessor.waitForProcessing(),
            this.scheduledProcessor.waitForProcessing()
        ]);
        await this.api.stop();

        // Sending responses registers, updates and deletes reply captures,
        // and their storage writes are tracked by the command processor.
        await this.commandProcessor.waitForProcessing();

        // Nothing can register a capture past this point, so no new expiry timers can appear.
        this.commandProcessor.captures.stop();
    }
}
