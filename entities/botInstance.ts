import { Telegraf } from 'telegraf';
import {
    hoursToSeconds,
    secondsToMilliseconds
} from '../helpers/timeConvertions';
import { Hours, Milliseconds, Seconds } from '../types/timeValues';
import { IStorageClient } from '../types/storage';
import { JsonFileStorage } from '../services/jsonFileStorage';
import { TelegramApiService } from '../services/telegramApi';
import { IActionState } from '../types/actionState';
import { CommandAction } from './actions/commandAction';
import { ScheduledAction } from './actions/scheduledAction';
import { JsonLogger } from '../services/jsonLogger';
import { IncomingMessage } from '../dtos/incomingMessage';
import moment from 'moment';
import { ChatContext } from './context/chatContext';
import { MessageContext } from './context/messageContext';
import { ChatInfo } from '../dtos/chatInfo';
import { ILogger } from '../types/logger';
import { IScheduler } from '../types/scheduler';
import { NodeTimeoutScheduler } from '../services/nodeTimeoutScheduler';
import { createTrace } from '../helpers/traceFactory';

export class BotInstance {
    private readonly api: TelegramApiService;
    private readonly storage: IStorageClient;
    private readonly scheduler: IScheduler;
    private readonly logger: ILogger;

    readonly name: string;
    private readonly telegraf: Telegraf;
    private readonly commands: CommandAction<IActionState>[];
    private readonly scheduled: ScheduledAction<IActionState>[];
    private readonly chats: Record<string, number>;

    constructor(options: {
        name: string;
        token: string;
        commands: CommandAction<IActionState>[];
        scheduled: ScheduledAction<IActionState>[];
        chats: Record<string, number>;
        storagePath?: string;
        scheduledPeriod?: Seconds;
        verboseLoggingForIncomingMessage?: boolean;
        services?: {
            storageClient?: IStorageClient;
            logger?: ILogger;
            scheduler?: IScheduler;
        };
    }) {
        this.name = options.name;
        this.commands = options.commands;
        this.scheduled = options.scheduled;
        this.chats = options.chats;

        const actions = [...this.commands, ...this.scheduled];
        this.telegraf = new Telegraf(options.token);
        this.logger = options.services?.logger ?? new JsonLogger();
        this.scheduler =
            options.services?.scheduler ??
            new NodeTimeoutScheduler(this.logger);
        this.storage =
            options.services?.storageClient ??
            new JsonFileStorage(options.name, actions, options.storagePath);
        this.api = new TelegramApiService(
            this.name,
            this.telegraf.telegram,
            this.storage,
            this.logger
        );

        this.initializeMessageProcessing(
            options.verboseLoggingForIncomingMessage ?? false
        );
        this.initializeScheduledProcessing(
            options.scheduledPeriod ?? hoursToSeconds(1 as Hours)
        );

        this.storage.saveMetadata(actions, this.name);

        this.logger.logWithTraceId(
            this.name,
            createTrace(this, this.name, 'Start'),
            'System',
            'Starting bot...'
        );
        this.telegraf.launch();
    }

    private initializeScheduledProcessing(period: Seconds) {
        if (this.scheduled.length > 0) {
            const now = moment();

            if (now.minute() == 0 && now.second() == 0) {
                this.scheduler.createTask(
                    'ScheduledProcessing',
                    async () => {
                        await this.runScheduled();
                    },
                    secondsToMilliseconds(period),
                    true,
                    this.name
                );

                return;
            }

            let nextExecutionTime = now.clone().startOf('hour');
            if (now.minute() > 0 || now.second() > 0) {
                nextExecutionTime = nextExecutionTime.add(1, 'hour');
            }

            const delay = nextExecutionTime.diff(now);

            this.scheduler.createOnetimeTask(
                'ScheduledProcessing_OneTime',
                async () => {
                    this.scheduler.createTask(
                        'ScheduledProcessing',
                        async () => {
                            await this.runScheduled();
                        },
                        secondsToMilliseconds(period),
                        true,
                        this.name
                    );
                },
                delay as Milliseconds,
                this.name
            );
        }
    }
    private initializeMessageProcessing(
        verboseLoggingForIncomingMessage: boolean
    ) {
        if (this.commands.length > 0) {
            this.telegraf.on('message', async (ctx) => {
                const msg = new IncomingMessage(ctx.update.message, this.name);
                const messageContent =
                    msg.text || `<non-text message: ${msg.type}>`;

                const messageFromName = msg.from?.first_name ?? 'Unknown';
                const messageFromId = msg.from?.id ?? 'Unknown';

                if (verboseLoggingForIncomingMessage) {
                    this.logger.logObjectWithTraceId(
                        this.name,
                        msg.traceId,
                        msg.chatInfo.name,
                        ctx.update.message
                    );
                } else {
                    this.logger.logWithTraceId(
                        this.name,
                        msg.traceId,
                        msg.chatInfo.name,
                        `${messageFromName} (${messageFromId}): ${messageContent}`
                    );
                }

                await this.processMessage(msg);
            });
        }
    }

    async stop(code: string) {
        this.logger.logWithTraceId(
            this.name,
            createTrace(this, this.name, 'Stop'),
            'System',
            'Stopping bot...'
        );

        this.scheduler.stopAll();
        await this.storage.close();
        this.telegraf.stop(code);
    }

    private async runScheduled() {
        const ctx = new ChatContext<IActionState>(
            this.storage,
            this.logger,
            this.scheduler
        );

        for (const [chatName, chatId] of Object.entries(this.chats)) {
            for (const scheduledAction of this.scheduled) {
                ctx.initializeChatContext(
                    this.name,
                    scheduledAction,
                    new ChatInfo(chatId, chatName),
                    createTrace(
                        scheduledAction,
                        this.name,
                        `${scheduledAction.key}-${chatId}`
                    )
                );

                try {
                    const responses = await scheduledAction.exec(ctx);
                    this.api.enqueueBatchedResponses(responses);
                    ctx.isInitialized = false;
                } catch (error) {
                    this.logger.errorWithTraceId(
                        ctx.botName,
                        ctx.traceId,
                        chatName,
                        error,
                        ctx
                    );
                }
            }
        }

        await this.api.flushResponses();
    }

    private async processMessage(msg: IncomingMessage) {
        const ctx = new MessageContext<IActionState>(
            this.storage,
            this.logger,
            this.scheduler
        );

        for (const commandAction of this.commands) {
            ctx.initializeMessageContext(this.name, commandAction, msg);

            try {
                const responses = await commandAction.exec(ctx);
                this.api.enqueueBatchedResponses(responses);
                ctx.isInitialized = false;
            } catch (error) {
                this.logger.errorWithTraceId(
                    ctx.botName,
                    ctx.traceId,
                    ctx.chatInfo.name,
                    error,
                    ctx
                );
            }
        }

        await this.api.flushResponses();
    }
}
