import moment from 'moment';
import { Sema as Semaphore } from 'async-sema';
import { ScheduledHandler } from '../../types/handlers';
import { hoursToMilliseconds } from '../../helpers/timeConvertions';
import { HoursOfDay } from '../../types/timeValues';
import { IActionState } from '../../types/actionState';
import { IActionWithState } from '../../types/actionWithState';
import { CachedStateFactory } from '../cachedStateFactory';
import { ChatContext } from '../context/chatContext';
import { ActionStateBase } from '../states/actionStateBase';
import { ActionExecutionResult } from '../actionExecutionResult';
import { Logger } from '../../services/logger';
import { Scheduler } from '../../services/taskScheduler';

export class ScheduledAction implements IActionWithState {
    static semaphore = new Semaphore(1);

    name: string;
    timeinHours: HoursOfDay;
    active: boolean;
    chatsWhitelist: number[];
    key: string;

    cachedState = new Map<string, unknown>();
    stateConstructor = () => new ActionStateBase();
    cachedStateFactories: Map<string, CachedStateFactory>;
    handler: ScheduledHandler;

    constructor(
        name: string,
        handler: ScheduledHandler,
        timeinHours: HoursOfDay,
        active: boolean,
        whitelist: number[],
        cachedStateFactories: Map<string, CachedStateFactory>
    ) {
        this.name = name;
        this.handler = handler;
        this.timeinHours = timeinHours;
        this.active = active;
        this.chatsWhitelist = whitelist;
        this.cachedStateFactories = cachedStateFactories;
        this.key = `scheduled:${this.name.replace('.', '-')}`;
    }

    async exec(ctx: ChatContext) {
        if (!this.active || !this.chatsWhitelist.includes(ctx.chatId)) return;

        const state = await ctx.storage.getActionState(this, ctx.chatId);
        const isAllowedToTrigger = this.shouldTrigger(state);

        if (isAllowedToTrigger) {
            Logger.logWithTraceId(
                ctx.botName,
                ctx.traceId,
                ctx.chatName,
                ` - Executing [${this.name}] in ${ctx.chatId}`
            );

            await this.handler(ctx, <TResult>(key: string) =>
                this.getCachedValue<TResult>(key, ctx.botName)
            );

            state.lastExecutedDate = moment().valueOf();

            await ctx.storage.saveActionExecutionResult(
                this,
                ctx.chatId,
                new ActionExecutionResult(state, isAllowedToTrigger)
            );
        }
    }

    private async getCachedValue<TResult>(
        key: string,
        botName: string
    ): Promise<TResult> {
        if (!this.cachedStateFactories.has(key)) {
            throw new Error(
                `No shared cache was set up for the key [${key}] in action '${this.name}'`
            );
        }

        await ScheduledAction.semaphore.acquire();

        try {
            if (this.cachedState.has(key)) {
                return this.cachedState.get(key) as TResult;
            }

            const cachedItemFactory = this.cachedStateFactories.get(key)!;
            const value = await cachedItemFactory.getValue();

            this.cachedState.set(key, value);

            Scheduler.createOnetimeTask(
                `Drop cached value [${this.name} : ${key}]`,
                () => this.cachedState.delete(key),
                hoursToMilliseconds(
                    cachedItemFactory.invalidationTimeoutInHours
                ),
                botName
            );

            return value as TResult;
        } finally {
            ScheduledAction.semaphore.release();
        }
    }

    private shouldTrigger(state: IActionState): boolean {
        const today = moment().startOf('day').valueOf();

        const isAllowedToTrigger =
            moment().hour().valueOf() >= this.timeinHours;
        const hasTriggeredToday = state.lastExecutedDate >= today;

        return isAllowedToTrigger && !hasTriggeredToday;
    }
}
