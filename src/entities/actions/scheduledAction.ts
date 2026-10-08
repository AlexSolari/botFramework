import { Sema as Semaphore } from 'async-sema';
import { ScheduledHandler } from '../../types/handlers';
import { hoursToMilliseconds } from '../../helpers/timeConvertions';
import { HoursOfDay } from '../../types/timeValues';
import { IActionState } from '../../types/actionState';
import {
    IActionWithState,
    ActionKey,
    IExecutableAction
} from '../../types/action';
import { CachedStateFactory } from '../cachedStateFactory';
import { ChatContextInternal } from '../context/chatContext';
import { Noop } from '../../helpers/noop';
import { getOrCreateIfNotExists, getOrThrow } from '../../helpers/mapUtils';
import { ScheduledActionPropertyProvider } from '../../types/propertyProvider';
import { ScheduledActionProviders } from '../../dtos/propertyProviderSets';
import { BotEventType } from '../../types/events';

export type ScheduledAction<TActionState extends IActionState> = Omit<
    ScheduledActionInternal<TActionState>,
    'exec'
>;

export class ScheduledActionInternal<
    TActionState extends IActionState
> implements IActionWithState<TActionState>, IExecutableAction {
    static readonly locks = new Map<string, Semaphore>();
    static readonly sharedCache = new Map<string, unknown>();
    static readonly semaphoreFactory: () => Semaphore = () => new Semaphore(1);

    readonly name: string;
    readonly key: ActionKey;

    private readonly timeinHoursProvider: ScheduledActionPropertyProvider<HoursOfDay>;
    private readonly activeProvider: ScheduledActionPropertyProvider<boolean>;
    private readonly chatsWhitelistProvider: ScheduledActionPropertyProvider<
        number[]
    >;

    readonly stateConstructor: () => TActionState;
    readonly cachedStateFactories: Map<string, CachedStateFactory>;
    readonly handler: ScheduledHandler<TActionState>;

    constructor(
        name: string,
        handler: ScheduledHandler<TActionState>,
        providers: ScheduledActionProviders,
        cachedStateFactories: Map<string, CachedStateFactory>,
        stateConstructor: () => TActionState
    ) {
        this.name = name;
        this.key = `scheduled:${this.name.replaceAll('.', '-')}` as ActionKey;

        this.timeinHoursProvider = providers.timeinHoursProvider;
        this.activeProvider = providers.isActiveProvider;
        this.chatsWhitelistProvider = providers.chatsWhitelistProvider;

        this.cachedStateFactories = cachedStateFactories;
        this.stateConstructor = stateConstructor;
        this.handler = handler;
    }

    async exec(ctx: ChatContextInternal<TActionState>) {
        if (
            !this.activeProvider(ctx) ||
            !this.chatsWhitelistProvider(ctx).includes(ctx.chatInfo.id)
        )
            return Noop.NoResponse;

        const state = ctx.storage.getActionState<TActionState>(
            this,
            ctx.chatInfo.id
        );

        const isAllowedToTrigger = this.checkIfShouldBeExecuted(state, ctx);
        if (!isAllowedToTrigger) return Noop.NoResponse;

        ctx.observability.eventEmitter.emit(
            BotEventType.scheduledActionExecuting,
            {
                action: this,
                ctx,
                state,
                traceId: ctx.observability.traceId
            }
        );

        await this.handler(
            ctx,
            <TResult>(key: string) => this.getCachedValue<TResult>(key, ctx),
            state
        );

        state.lastExecutedDate = Date.now();

        await ctx.storage.saveActionExecutionResult(
            this,
            ctx.chatInfo.id,
            state
        );

        ctx.observability.eventEmitter.emit(
            BotEventType.scheduledActionExecuted,
            {
                action: this,
                ctx,
                state,
                traceId: ctx.observability.traceId
            }
        );

        return ctx.responses;
    }

    private async getCachedValue<TResult>(
        key: string,
        ctx: ChatContextInternal<TActionState>
    ): Promise<TResult> {
        const cachedItemFactory = getOrThrow(
            this.cachedStateFactories,
            key,
            `No shared cache was set up for the key [${key}] in action '${this.name}'`
        );

        const semaphoreKey = `${this.key}_cached:${key}`;
        const semaphore = getOrCreateIfNotExists(
            ScheduledActionInternal.locks,
            semaphoreKey,
            ScheduledActionInternal.semaphoreFactory
        );

        await semaphore.acquire();

        try {
            const cacheKey = `${this.key}:${key}`;
            if (ScheduledActionInternal.sharedCache.has(cacheKey)) {
                return ScheduledActionInternal.sharedCache.get(cacheKey) as TResult;
            }

            ctx.observability.eventEmitter.emit(
                BotEventType.scheduledActionCacheValueCreating,
                {
                    action: this,
                    ctx,
                    key,
                    traceId: ctx.observability.traceId
                }
            );
            const value = await cachedItemFactory.getValue();

            ScheduledActionInternal.sharedCache.set(cacheKey, value);

            ctx.scheduler.createOnetimeTask(
                `Drop cached value [${this.name} : ${key}]`,
                () => {
                    ScheduledActionInternal.sharedCache.delete(cacheKey);
                },
                hoursToMilliseconds(
                    cachedItemFactory.invalidationTimeoutInHours
                ),
                ctx.botName
            );

            return value as TResult;
        } finally {
            ctx.observability.eventEmitter.emit(
                BotEventType.scheduledActionCacheValueReturned,
                {
                    action: this,
                    ctx,
                    key,
                    traceId: ctx.observability.traceId
                }
            );
            semaphore.release();
        }
    }

    private checkIfShouldBeExecuted(
        state: IActionState,
        ctx: ChatContextInternal<TActionState>
    ): boolean {
        const now = new Date();
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);
        const scheduledTime = new Date(now);
        scheduledTime.setHours(this.timeinHoursProvider(ctx), 0, 0, 0);

        const isAllowedToTrigger = now >= scheduledTime;
        const hasTriggeredToday =
            state.lastExecutedDate > startOfToday.getTime();

        return isAllowedToTrigger && !hasTriggeredToday;
    }
}
