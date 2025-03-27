import { Telegraf } from 'telegraf';
import { hoursToMilliseconds } from '../helpers/timeConvertions';
import { Hours, Milliseconds } from '../types/timeValues';
import { IStorageClient } from '../types/storage';
import { JsonFileStorage } from '../services/jsonFileStorage';
import { TelegramApiService } from '../services/telegramApi';
import { IActionState } from '../types/actionState';
import { CommandAction } from './actions/commandAction';
import { ScheduledAction } from './actions/scheduledAction';
import { Logger } from '../services/logger';
import { Scheduler } from '../services/taskScheduler';
import { IncomingMessage } from './incomingMessage';
import moment from 'moment';

export class BotInstance {
    name: string;
    private api: TelegramApiService;
    private telegraf: Telegraf;
    private commands: CommandAction<IActionState>[];
    private scheduled: ScheduledAction<IActionState>[];
    private chats: Record<string, number>;
    storage: IStorageClient;

    constructor(options: {
        name: string;
        token: string;
        commands: CommandAction<IActionState>[];
        scheduled: ScheduledAction<IActionState>[];
        chats: Record<string, number>;
        storageClient?: IStorageClient;
        storagePath?: string;
    }) {
        this.name = options.name;
        this.commands = options.commands;
        this.scheduled = options.scheduled;
        this.chats = options.chats;

        const actions = [...this.commands, ...this.scheduled];

        Logger.logWithTraceId(
            this.name,
            `System:Bot-${this.name}-Start`,
            'System',
            'Starting bot...'
        );
        this.telegraf = new Telegraf(options.token);
        this.storage =
            options.storageClient ??
            new JsonFileStorage(options.name, actions, options.storagePath);
        this.api = new TelegramApiService(
            this.name,
            this.telegraf.telegram,
            this.storage,
            this.chats
        );

        this.initializeMessageProcessing();
        this.initializeScheduledProcessing();

        this.storage.saveMetadata(actions, this.name);

        this.telegraf.launch();
    }

    private initializeScheduledProcessing() {
        if (this.scheduled.length > 0) {
            const now = moment();

            let nextExecutionTime = now.clone().startOf('hour');

            if (now.minute() == 0 && now.second() == 0) {
                Scheduler.createTask(
                    'ScheduledProcessing',
                    async () => {
                        await this.runScheduled();
                    },
                    hoursToMilliseconds(1 as Hours),
                    true,
                    this.name
                );

                return;
            }

            if (now.minute() > 0 || now.second() > 0) {
                nextExecutionTime = nextExecutionTime.add(1, 'hour');
            }

            const delay = nextExecutionTime.diff(now);

            Scheduler.createOnetimeTask(
                'ScheduledProcessing_OneTime',
                async () => {
                    Scheduler.createTask(
                        'ScheduledProcessing',
                        async () => {
                            await this.runScheduled();
                        },
                        hoursToMilliseconds(1 as Hours),
                        true,
                        this.name
                    );
                },
                delay as Milliseconds,
                this.name
            );
        }
    }

    private initializeMessageProcessing() {
        if (this.commands.length > 0) {
            this.telegraf.on('message', async (ctx) => {
                const msg = new IncomingMessage(ctx.update.message);
                const messageContent = msg.text || '<non-text message>';

                const messageFromName = msg.from?.first_name ?? 'Unknown';
                const messageFromId = msg.from?.id ?? 'Unknown';
                Logger.logWithTraceId(
                    this.name,
                    msg.traceId,
                    msg.chatName,
                    `${messageFromName} (${messageFromId}): ${messageContent}`
                );

                if (msg.text) {
                    await this.processMessage(msg);
                }
            });
        }
    }

    async stop(code: string) {
        Logger.logWithTraceId(
            this.name,
            `System:Bot-${this.name}-Stop`,
            'System',
            'Stopping bot...'
        );

        await this.storage.close();
        this.telegraf.stop(code);
    }

    private async runScheduled() {
        for (const [chatName, chatId] of Object.entries(this.chats)) {
            for (const scheduledAction of this.scheduled) {
                const ctx = this.api.createContextForChat(
                    chatId,
                    scheduledAction
                );

                try {
                    await scheduledAction.exec(ctx);
                } catch (error) {
                    Logger.errorWithTraceId(
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
        for (const commandAction of this.commands) {
            const ctx = this.api.createContextForMessage(msg, commandAction);

            try {
                await commandAction.exec(ctx);
            } catch (error) {
                Logger.errorWithTraceId(
                    ctx.botName,
                    ctx.traceId,
                    ctx.chatName,
                    error,
                    ctx
                );
            }
        }

        await this.api.flushResponses();
    }
}
