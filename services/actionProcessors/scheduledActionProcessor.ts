import moment from 'moment';
import { ChatInfo } from '../../dtos/chatInfo';
import { ScheduledAction } from '../../entities/actions/scheduledAction';
import { ChatContext } from '../../entities/context/chatContext';
import { secondsToMilliseconds } from '../../helpers/timeConvertions';
import { createTrace } from '../../helpers/traceFactory';
import { IActionWithState } from '../../types/action';
import { IActionState } from '../../types/actionState';
import { ILogger } from '../../types/logger';
import { IScheduler } from '../../types/scheduler';
import { IStorageClient } from '../../types/storage';
import { Seconds, Milliseconds } from '../../types/timeValues';
import { TraceId } from '../../types/trace';
import { TelegramApiService } from '../telegramApi';

export class ScheduledActionProcessor {
    private readonly storage: IStorageClient;
    private readonly scheduler: IScheduler;
    private readonly logger: ILogger;

    private readonly botName: string;
    private readonly chats: Record<string, number>;

    private api!: TelegramApiService;
    private scheduled!: ScheduledAction<IActionState>[];

    constructor(
        botName: string,
        chats: Record<string, number>,
        storage: IStorageClient,
        scheduler: IScheduler,
        logger: ILogger
    ) {
        this.storage = storage;
        this.scheduler = scheduler;
        this.logger = logger;

        this.botName = botName;
        this.chats = chats;
    }

    initialize(
        api: TelegramApiService,
        scheduled: ScheduledAction<IActionState>[],
        period: Seconds
    ) {
        this.api = api;
        this.scheduled = scheduled;

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
                    this.botName
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
                        this.botName
                    );
                },
                delay as Milliseconds,
                this.botName
            );
        }
    }

    private async runScheduled() {
        const ctx = new ChatContext<IActionState>(this.storage, this.scheduler);

        for (const [chatName, chatId] of Object.entries(this.chats)) {
            for (const scheduledAction of this.scheduled) {
                this.initializeChatContext(
                    ctx,
                    scheduledAction,
                    new ChatInfo(chatId, chatName),
                    createTrace(
                        scheduledAction,
                        this.botName,
                        `${scheduledAction.key}-${chatId}`
                    )
                );

                try {
                    const responses = await scheduledAction.exec(ctx);
                    this.api.enqueueBatchedResponses(responses);
                    ctx.isInitialized = false;
                } catch (error) {
                    ctx.logger.errorWithTraceId(error, ctx);
                }
            }
        }

        this.api.flushResponses();
    }

    private initializeChatContext<TActionState extends IActionState>(
        ctx: ChatContext<IActionState>,
        action: IActionWithState<TActionState>,
        chatInfo: ChatInfo,
        traceId: TraceId
    ) {
        ctx.responses = [];
        ctx.isInitialized = true;
        ctx.botName = this.botName;
        ctx.action = action;
        ctx.chatInfo = chatInfo;
        ctx.traceId = traceId;

        ctx.logger = this.logger.createScope(
            this.botName,
            traceId,
            chatInfo.name
        );
    }
}
