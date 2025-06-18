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
import { InlineQueryAction } from './actions/inlineQueryAction';
import { IncomingInlineQuery } from '../dtos/incomingQuery';
import { InlineQueryContext } from './context/inlineQueryContext';
import { buildHelpCommand } from '../builtin/helpAction';
import { UserFromGetMe } from 'telegraf/types';
import {
    INTERNAL_MESSAGE_TYPE_PREFIX,
    MessageType
} from '../types/messageTypes';
import { IActionWithState } from '../types/statefulAction';
import { TraceId } from '../types/trace';

export class BotInstance {
    private readonly api: TelegramApiService;
    private readonly storage: IStorageClient;
    private readonly scheduler: IScheduler;
    private readonly logger: ILogger;
    private readonly telegraf: Telegraf;

    name!: string;
    private botInfo!: UserFromGetMe;
    private commands!: CommandAction<IActionState>[];
    private scheduled!: ScheduledAction<IActionState>[];
    private inlineQueries!: InlineQueryAction[];
    private chats!: Record<string, number>;

    constructor(options: {
        name: string;
        token: string;
        actions: {
            commands: CommandAction<IActionState>[];
            scheduled: ScheduledAction<IActionState>[];
            inlineQueries: InlineQueryAction[];
        };
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
        const actions = [
            ...options.actions.commands,
            ...options.actions.scheduled
        ];

        this.name = options.name;
        this.chats = options.chats;

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

        this.storage.saveMetadata(actions, this.name);
    }

    async start(options: {
        name: string;
        token: string;
        actions: {
            commands: CommandAction<IActionState>[];
            scheduled: ScheduledAction<IActionState>[];
            inlineQueries: InlineQueryAction[];
        };
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
        this.botInfo = await this.telegraf.telegram.getMe();

        this.commands =
            options.actions.commands.length > 0
                ? [
                      buildHelpCommand(
                          options.actions.commands
                              .map((x) =>
                                  x.readmeFactory(this.botInfo.username)
                              )
                              .filter((x) => !!x),
                          this.botInfo.username
                      ),
                      ...options.actions.commands
                  ]
                : [];
        this.scheduled = options.actions.scheduled;
        this.inlineQueries = options.actions.inlineQueries;

        this.initializeMessageProcessing(
            options.verboseLoggingForIncomingMessage ?? false
        );
        this.initializeInlineQueryProcessing(1000 as Milliseconds);
        this.initializeScheduledProcessing(
            options.scheduledPeriod ?? hoursToSeconds(1 as Hours)
        );

        this.telegraf.launch();

        this.logger.logWithTraceId(
            this.name,
            createTrace(this, this.name, 'Start'),
            'System',
            'Starting bot...'
        );
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

    private initializeInlineQueryProcessing(period: Milliseconds) {
        let pendingInlineQueries: IncomingInlineQuery[] = [];

        if (this.inlineQueries.length > 0) {
            this.telegraf.on('inline_query', async (ctx) => {
                const query = new IncomingInlineQuery(
                    ctx.inlineQuery.id,
                    ctx.inlineQuery.query,
                    ctx.inlineQuery.from.id,
                    createTrace('InlineQuery', this.name, ctx.inlineQuery.id)
                );

                this.logger.logWithTraceId(
                    this.name,
                    query.traceId,
                    'Query',
                    `${ctx.inlineQuery.from.username} (${ctx.inlineQuery.from.id}): Query for ${ctx.inlineQuery.query}`
                );

                pendingInlineQueries = pendingInlineQueries.filter(
                    (q) => q.userId != query.userId
                );

                pendingInlineQueries.push(query);
            });

            this.scheduler.createTask(
                'InlineQueryProcessing',
                async () => {
                    const ctx = new InlineQueryContext(
                        this.storage,
                        this.logger,
                        this.scheduler
                    );

                    const queriesToProcess = [...pendingInlineQueries];
                    pendingInlineQueries = [];

                    for (const inlineQuery of queriesToProcess) {
                        for (const inlineQueryAction of this.inlineQueries) {
                            ctx.initializeContext(
                                inlineQuery.query,
                                inlineQuery.queryId,
                                this.name,
                                inlineQueryAction,
                                inlineQuery.traceId
                            );

                            try {
                                const responses = await inlineQueryAction.exec(
                                    ctx
                                );
                                this.api.enqueueBatchedResponses(responses);
                                ctx.isInitialized = false;
                            } catch (error) {
                                this.logger.errorWithTraceId(
                                    ctx.botName,
                                    ctx.traceId,
                                    'Unknown',
                                    error,
                                    ctx
                                );
                            }
                        }
                    }

                    this.api.flushResponses();
                },
                period,
                false,
                this.name
            );
        }
    }

    private initializeMessageProcessing(
        verboseLoggingForIncomingMessage: boolean
    ) {
        if (this.commands.length > 0) {
            const triggersToBeProcessed = new Set(
                this.commands
                    .flatMap((x) => x.triggers)
                    .map((x) =>
                        typeof x == 'string'
                            ? x.startsWith(INTERNAL_MESSAGE_TYPE_PREFIX)
                                ? x
                                : MessageType.Text
                            : MessageType.Text
                    )
            );

            this.telegraf.on('message', async (ctx) => {
                const msg = new IncomingMessage(ctx.update.message, this.name);

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
                        `${msg.from?.first_name ?? 'Unknown'} (${
                            msg.from?.id ?? 'Unknown'
                        }): ${msg.text || `<non-text message: ${msg.type}>`}`
                    );
                }

                if (triggersToBeProcessed.has(msg.type))
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

    private initializeMessageContext<TActionState extends IActionState>(
        ctx: MessageContext<IActionState>,
        action: IActionWithState<TActionState>,
        message: IncomingMessage
    ) {
        ctx.messageId = message.message_id;
        ctx.messageText = message.text ?? '';
        ctx.messageType = message.type;
        ctx.fromUserId = message.from?.id;
        ctx.fromUserName =
            (message.from?.first_name ?? 'Unknown user') +
            (message.from?.last_name ? ` ${message.from.last_name}` : '');
        ctx.messageUpdateObject = message.updateObject;

        ctx.matchResults = [];
        ctx.startCooldown = true;

        this.initializeChatContext(
            ctx,
            action,
            message.chatInfo,
            message.traceId
        );
    }

    private initializeChatContext<TActionState extends IActionState>(
        ctx: ChatContext<IActionState>,
        action: IActionWithState<TActionState>,
        chatInfo: ChatInfo,
        traceId: TraceId
    ) {
        ctx.responses = [];
        ctx.isInitialized = true;
        ctx.botName = this.name;
        ctx.action = action;
        ctx.chatInfo = chatInfo;
        ctx.traceId = traceId;
    }

    private async runScheduled() {
        const ctx = new ChatContext<IActionState>(
            this.storage,
            this.logger,
            this.scheduler
        );

        for (const [chatName, chatId] of Object.entries(this.chats)) {
            for (const scheduledAction of this.scheduled) {
                this.initializeChatContext(
                    ctx,
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

        this.api.flushResponses();
    }

    private async processMessage(msg: IncomingMessage) {
        const ctx = new MessageContext<IActionState>(
            this.storage,
            this.logger,
            this.scheduler
        );

        for (const commandAction of this.commands) {
            this.initializeMessageContext(ctx, commandAction, msg);

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

        this.api.flushResponses();
    }
}
