import moment from 'moment';
import { ChatInfo } from '../../dtos/chatInfo';
import { ScheduledAction } from '../../entities/actions/scheduledAction';
import { ChatContextInternal } from '../../entities/context/chatContext';
import { secondsToMilliseconds } from '../../helpers/timeConvertions';
import { createTrace } from '../../helpers/traceFactory';
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

    private scheduled!: ScheduledAction<IActionState>[];

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
        this.scheduled = scheduled;

        if (this.scheduled.length > 0) {
            const now = moment();

            if (now.minute() == 0 && now.second() == 0) {
                this.scheduler.createTask(
                    'ScheduledProcessing',
                    () => {
                        this.runScheduled();
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
                () => {
                    this.scheduler.createTask(
                        'ScheduledProcessing',
                        () => {
                            this.runScheduled();
                        },
                        secondsToMilliseconds(period),
                        true,
                        this.botName
                    );
                },
                delay as Milliseconds,
                this.botName
            );

            this.runScheduled();
        }
    }

    private runScheduled() {
        this.eventEmitter.emit(BotEventType.scheduledProcessingStarted, {
            botName: this.botName,
            traceId: this.taskTrace
        });

        const promises = Object.entries(this.chats).flatMap(
            ([chatName, chatId]) => {
                const chatInfo = new ChatInfo(chatId, chatName, []);

                return this.scheduled.map((scheduledAction) => {
                    const ctx = new ChatContextInternal<IActionState>(
                        this.storage,
                        this.scheduler,
                        this.eventEmitter,
                        scheduledAction,
                        chatInfo,
                        createTrace(
                            scheduledAction,
                            this.botName,
                            `${scheduledAction.key}-${chatId}`
                        ),
                        this.botName
                    );

                    const { proxy, revoke } = Proxy.revocable(ctx, {});

                    const executePromise = this.executeAction(
                        scheduledAction,
                        proxy
                    );

                    return executePromise.finally(() => {
                        revoke();
                        this.api.flushResponses();
                    });
                });
            }
        );

        void Promise.allSettled(promises).then(() => {
            this.eventEmitter.emit(BotEventType.scheduledProcessingStarted, {
                botName: this.botName,
                traceId: this.taskTrace
            });
        });
    }
}
