import { Sema as Semaphore } from 'async-sema';
import { ChatInfo } from '../../dtos/chatInfo';
import {
    ScheduledAction,
    ScheduledActionInternal
} from '../../entities/actions/scheduledAction';
import { ChatContextInternal } from '../../entities/context/chatContext';
import { secondsToMilliseconds } from '../../helpers/timeConvertions';
import { createTrace } from '../../helpers/traceFactory';
import { getOrCreateIfNotExists } from '../../helpers/mapUtils';
import { IActionState } from '../../types/actionState';
import { IScheduler } from '../../types/scheduler';
import { IStorageClient } from '../../types/storage';
import { Seconds, Milliseconds } from '../../types/timeValues';
import { TelegramApiService } from '../telegramApi';
import { BaseActionProcessor } from './baseProcessor';
import { BotEventType, TypedEventEmitter } from '../../types/events';

export class ScheduledActionProcessor extends BaseActionProcessor {
    private readonly chats: Record<string, number>;
    private readonly taskTrace = createTrace(
        this,
        this.botName,
        'ScheduledActionsTaskRun'
    );

    private scheduled!: ScheduledActionInternal<IActionState>[];
    private readonly runLocks = new Map<string, Semaphore>();
    private readonly semaphoreFactory = () => new Semaphore(1);

    constructor(
        botName: string,
        chats: Record<string, number>,
        storage: IStorageClient,
        scheduler: IScheduler,
        eventEmitter: TypedEventEmitter
    ) {
        super(botName, storage, scheduler, eventEmitter);
        this.chats = chats;
    }

    initialize(
        api: TelegramApiService,
        scheduled: ScheduledAction<IActionState>[],
        period: Seconds
    ) {
        this.initializeDependencies(api);
        this.scheduled = scheduled as ScheduledActionInternal<IActionState>[];

        for (const action of this.scheduled) {
            action.clearSharedCache();
        }

        if (this.scheduled.length > 0) {
            this.scheduler.createOnetimeTask(
                'ScheduledProcessing_Startup',
                () => this.track(this.runScheduled()),
                0 as Milliseconds,
                this.botName
            );

            const now = new Date();
            const nextExecutionTime = new Date(now);
            nextExecutionTime.setMinutes(0, 0, 0);

            if (nextExecutionTime.getTime() <= now.getTime()) {
                nextExecutionTime.setTime(
                    nextExecutionTime.getTime() + 3600000
                );
            }

            const delay = Math.max(
                0,
                nextExecutionTime.getTime() - now.getTime()
            ) as Milliseconds;

            this.scheduler.createOnetimeTask(
                'ScheduledProcessing_OneTime',
                () => {
                    this.scheduler.createTask(
                        'ScheduledProcessing',
                        () => this.track(this.runScheduled()),
                        secondsToMilliseconds(period),
                        true,
                        this.botName
                    );
                },
                delay,
                this.botName
            );
        }
    }

    private async runScheduled() {
        this.eventEmitter.emit(BotEventType.scheduledProcessingStarted, {
            botName: this.botName,
            traceId: this.taskTrace
        });

        const actionPromises = Object.entries(this.chats).flatMap(
            ([chatName, chatId]) => {
                const chatInfo = new ChatInfo(chatId, chatName, []);

                return this.scheduled.map(async (scheduledAction) => {
                    const runKey = `${scheduledAction.key}-${chatId}`;
                    const ctx = new ChatContextInternal<IActionState>(
                        this.storage,
                        this.scheduler,
                        this.eventEmitter,
                        this.api.client,
                        scheduledAction,
                        chatInfo,
                        createTrace(scheduledAction, this.botName, runKey),
                        this.botName
                    );

                    const { proxy, revoke } = Proxy.revocable(ctx, {});
                    const lock = getOrCreateIfNotExists(
                        this.runLocks,
                        runKey,
                        this.semaphoreFactory
                    );
                    await lock.acquire();

                    try {
                        await this.executeActionAndQueueResponses(
                            scheduledAction,
                            proxy
                        );
                    } finally {
                        lock.release();
                        revoke();
                        this.api.flushResponses();
                    }
                });
            }
        );

        try {
            await Promise.allSettled(actionPromises);
        } finally {
            this.eventEmitter.emit(BotEventType.scheduledProcessingFinished, {
                botName: this.botName,
                traceId: this.taskTrace
            });
        }
    }
}
