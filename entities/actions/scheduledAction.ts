import moment from 'moment';
import { Sema as Semaphore } from 'async-sema';
import { ScheduledHandler } from '../../types/handlers';
import { hoursToMilliseconds } from '../../helpers/timeConvertions';
import { HoursOfDay } from '../../types/timeValues';
import { IActionState } from '../../types/actionState';
import { IActionWithState, ActionKey } from '../../types/actionWithState';
import { CachedStateFactory } from '../cachedStateFactory';
import { ChatContext } from '../context/chatContext';
import { ActionExecutionResult } from '../../dtos/actionExecutionResult';
import { Logger } from '../../services/logger';
import { Scheduler } from '../../services/taskScheduler';

export class ScheduledAction<TActionState extends IActionState>
    implements IActionWithState<TActionState>
{
    static readonly locks = new Map<string, Semaphore>();

    readonly name: string;
    readonly timeinHours: HoursOfDay;
    readonly active: boolean;
    readonly chatsWhitelist: number[];
    readonly key: ActionKey;

    readonly cachedState = new Map<string, unknown>();
    readonly stateConstructor: () => TActionState;
    readonly cachedStateFactories: Map<string, CachedStateFactory>;
    readonly handler: ScheduledHandler<TActionState>;

    constructor(
        name: string,
        handler: ScheduledHandler<TActionState>,
        timeinHours: HoursOfDay,
        active: boolean,
        whitelist: number[],
        cachedStateFactories: Map<string, CachedStateFactory>,
        stateConstructor: () => TActionState
    ) {
        this.name = name;
        this.handler = handler;
        this.timeinHours = timeinHours;
        this.active = active;
        this.chatsWhitelist = whitelist;
        this.cachedStateFactories = cachedStateFactories;
        this.key = `scheduled:${this.name.replace('.', '-')}` as ActionKey;
        this.stateConstructor = stateConstructor;
    }

    async exec(ctx: ChatContext<TActionState>) {
        if (!ctx.isInitialized)
            throw new Error(
                `Context for ${this.key} is not initialized or already consumed`
            );

        if (!this.active || !this.chatsWhitelist.includes(ctx.chatInfo.id))
            return [];

        const state = await ctx.storage.getActionState<TActionState>(
            this,
            ctx.chatInfo.id
        );
        const isAllowedToTrigger = this.shouldTrigger(state);

        if (isAllowedToTrigger) {
            Logger.logWithTraceId(
                ctx.botName,
                ctx.traceId,
                ctx.chatInfo.name,
                ` - Executing [${this.name}] in ${ctx.chatInfo.id}`
            );

            await this.handler(
                ctx,
                <TResult>(key: string) =>
                    this.getCachedValue<TResult>(key, ctx.botName),
                state
            );

            state.lastExecutedDate = moment().valueOf();

            ctx.updateActions.forEach((action) => action(state));
            await ctx.storage.saveActionExecutionResult(
                this,
                ctx.chatInfo.id,
                new ActionExecutionResult(state, isAllowedToTrigger)
            );
        }

        ctx.isInitialized = false;

        return ctx.responses;
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

        const semaphoreKey = `${this.key}_cached:${key}`;
        let semaphore: Semaphore;
        if (ScheduledAction.locks.has(semaphoreKey)) {
            semaphore = ScheduledAction.locks.get(semaphoreKey)!;
        } else {
            semaphore = new Semaphore(1);
            ScheduledAction.locks.set(semaphoreKey, semaphore);
        }

        await semaphore.acquire();

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
            semaphore.release();
        }
    }

    private shouldTrigger(state: IActionState): boolean {
        const startOfToday = moment().startOf('day').valueOf();
        const lastExecutedDate = moment(state.lastExecutedDate);
        const currentTime = moment();
        const scheduledTime = moment()
            .startOf('day')
            .add(this.timeinHours, 'hours');

        const isAllowedToTrigger = currentTime.isSameOrAfter(scheduledTime);
        const hasTriggeredToday = lastExecutedDate.isAfter(startOfToday);

        return isAllowedToTrigger && !hasTriggeredToday;
    }
}
