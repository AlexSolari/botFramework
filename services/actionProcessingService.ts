import { hoursToSeconds } from '../helpers/timeConvertions';
import { Seconds, Milliseconds, Hours } from '../types/timeValues';
import { Telegraf } from 'telegraf';
import { ILogger } from '../types/logger';
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

export class ActionProcessingService {
    private readonly storage: IStorageClient;
    private readonly logger: ILogger;

    private readonly commandProcessor: CommandActionProcessor;
    private readonly scheduledProcessor: ScheduledActionProcessor;
    private readonly inlineQueryProcessor: InlineQueryActionProcessor;

    private readonly botName: string;

    private telegraf!: Telegraf;

    constructor(
        botName: string,
        chats: Record<string, number>,
        storage: IStorageClient,
        scheduler: IScheduler,
        logger: ILogger
    ) {
        this.storage = storage;
        this.logger = logger;

        this.commandProcessor = new CommandActionProcessor(
            botName,
            storage,
            scheduler,
            logger
        );
        this.scheduledProcessor = new ScheduledActionProcessor(
            botName,
            chats,
            storage,
            scheduler,
            logger
        );
        this.inlineQueryProcessor = new InlineQueryActionProcessor(
            botName,
            storage,
            scheduler,
            logger
        );

        this.botName = botName;
    }

    async initialize(
        token: string,
        actions: {
            commands: CommandAction<IActionState>[];
            scheduled: ScheduledAction<IActionState>[];
            inlineQueries: InlineQueryAction[];
        },
        scheduledPeriod?: Seconds,
        verboseLoggingForIncomingMessage?: boolean
    ) {
        this.telegraf = new Telegraf(token);
        const api = new TelegramApiService(
            this.botName,
            this.telegraf.telegram,
            this.storage,
            this.logger,
            (capture, id, chatInfo, traceId) =>
                this.commandProcessor.captureRegistrationCallback(
                    capture,
                    id,
                    chatInfo,
                    traceId
                )
        );

        const botInfo = await this.telegraf.telegram.getMe();

        this.commandProcessor.initialize(
            api,
            this.telegraf,
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
                : [],
            verboseLoggingForIncomingMessage ?? false
        );
        this.inlineQueryProcessor.initialize(
            api,
            this.telegraf,
            actions.inlineQueries,
            1000 as Milliseconds
        );
        this.scheduledProcessor.initialize(
            api,
            actions.scheduled,
            scheduledPeriod ?? hoursToSeconds(1 as Hours)
        );

        this.telegraf.launch();
    }

    stop(code: string) {
        this.telegraf.stop(code);
    }
}
