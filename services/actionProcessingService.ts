import { hoursToSeconds } from '../helpers/timeConvertions';
import { Seconds, Milliseconds, Hours } from '../types/timeValues';
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
import { TelegramBot } from '../types/externalAliases';
import { Telegraf } from 'telegraf';
import { TypedEventEmitter } from '../types/events';

export class ActionProcessingService {
    private readonly eventEmitter: TypedEventEmitter;
    private readonly storage: IStorageClient;
    private readonly commandProcessor: CommandActionProcessor;
    private readonly scheduledProcessor: ScheduledActionProcessor;
    private readonly inlineQueryProcessor: InlineQueryActionProcessor;

    private readonly botName: string;

    private telegramBot!: TelegramBot;

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
        },
        scheduledPeriod?: Seconds
    ) {
        this.telegramBot = new Telegraf(token);
        const api = new TelegramApiService(
            this.botName,
            this.telegramBot.telegram,
            this.storage,
            this.eventEmitter,
            (capture, id, chatInfo) => {
                this.commandProcessor.captureRegistrationCallback(
                    capture,
                    id,
                    chatInfo
                );
            }
        );

        const botInfo = await this.telegramBot.telegram.getMe();
        const commandActions =
            actions.commands.length > 0 && botInfo.username
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
            api,
            this.telegramBot,
            commandActions,
            botInfo
        );
        this.inlineQueryProcessor.initialize(
            api,
            this.telegramBot,
            actions.inlineQueries,
            300 as Milliseconds
        );
        this.scheduledProcessor.initialize(
            api,
            actions.scheduled,
            scheduledPeriod ?? hoursToSeconds(1 as Hours)
        );

        void this.telegramBot.launch();
    }

    stop() {
        this.telegramBot.stop();
    }
}
