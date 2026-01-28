import moment from 'moment';
import { Sema as Semaphore } from 'async-sema';
import { ScheduledHandler } from '../../types/handlers';
import { hoursToMilliseconds } from '../../helpers/timeConvertions';
import { HoursOfDay } from '../../types/timeValues';
import { IActionState } from '../../types/actionState';
import { IActionWithState, ActionKey } from '../../types/action';
import { CachedStateFactory } from '../cachedStateFactory';
import { ChatContextInternal } from '../context/chatContext';
import { Noop } from '../../helpers/noop';
import { getOrSetIfNotExists, getOrThrow } from '../../helpers/mapUtils';
import { ScheduledActionPropertyProvider } from '../../types/propertyProvider';
import { ScheduledActionProviders } from '../../dtos/propertyProviderSets';
import { BotEventType } from '../../types/events';

export class ScheduledAction<TActionState extends IActionState>
    implements IActionWithState<TActionState>
{
    static readonly locks = new Map<string, Semaphore>();

    readonly name: string;
    readonly key: ActionKey;

    private readonly timeinHoursProvider: ScheduledActionPropertyProvider<HoursOfDay>;
    private readonly activeProvider: ScheduledActionPropertyProvider<boolean>;
    private readonly chatsWhitelistProvider: ScheduledActionPropertyProvider<
        number[]
    >;

    readonly cachedState = new Map<string, unknown>();
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
        this.key = `scheduled:${this.name.replace('.', '-')}` as ActionKey;

        this.timeinHoursProvider = providers.timeinHoursProvider;
        this.activeProvider = providers.isActiveProvider;
        this.chatsWhitelistProvider = providers.chatsWhitelistProvider;

        this.cachedStateFactories = cachedStateFactories;
        this.stateConstructor = stateConstructor;
        this.handler = handler;
    }

    async exec(ctx: ChatContextInternal<TActionState>) {
        if (!ctx.isInitialized)
            throw new Error(
                `Context for ${this.key} is not initialized or already consumed`
            );

        if (
            !this.activeProvider(ctx) ||
            !this.chatsWhitelistProvider(ctx).includes(ctx.chatInfo.id)
        )
            return Noop.NoResponse;

        const state = await ctx.storage.getActionState<TActionState>(
            this,
            ctx.chatInfo.id
        );

        const isAllowedToTrigger = this.checkIfShouldBeExecuted(state, ctx);
        if (!isAllowedToTrigger) return Noop.NoResponse;

        ctx.eventEmitter.emit(BotEventType.scheduledActionExecuting, {
            action: this,
            ctx,
            state
        });

        await this.handler(
            ctx,
            <TResult>(key: string) => this.getCachedValue<TResult>(key, ctx),
            state
        );

        state.lastExecutedDate = moment().valueOf();

        await ctx.storage.saveActionExecutionResult(
            this,
            ctx.chatInfo.id,
            state
        );

        ctx.eventEmitter.emit(BotEventType.scheduledActionExecuted, {
            action: this,
            ctx,
            state
        });
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
        const semaphore = getOrSetIfNotExists(
            ScheduledAction.locks,
            semaphoreKey,
            new Semaphore(1)
        );

        await semaphore.acquire();

        try {
            if (this.cachedState.has(key)) {
                return this.cachedState.get(key) as TResult;
            }

            ctx.eventEmitter.emit(
                BotEventType.scheduledActionCacheValueCreating,
                {
                    action: this,
                    ctx,
                    key
                }
            );
            const value = await cachedItemFactory.getValue();

            this.cachedState.set(key, value);

            ctx.scheduler.createOnetimeTask(
                `Drop cached value [${this.name} : ${key}]`,
                () => this.cachedState.delete(key),
                hoursToMilliseconds(
                    cachedItemFactory.invalidationTimeoutInHours
                ),
                ctx.botName
            );

            return value as TResult;
        } finally {
            ctx.eventEmitter.emit(
                BotEventType.scheduledActionCacheValueReturned,
                {
                    action: this,
                    ctx,
                    key
                }
            );
            semaphore.release();
        }
    }

    private checkIfShouldBeExecuted(
        state: IActionState,
        ctx: ChatContextInternal<TActionState>
    ): boolean {
        const startOfToday = moment().startOf('day').valueOf();
        const lastExecutedDate = moment(state.lastExecutedDate);
        const currentTime = moment();
        const scheduledTime = moment()
            .startOf('day')
            .add(this.timeinHoursProvider(ctx), 'hours');

        const isAllowedToTrigger = currentTime.isSameOrAfter(scheduledTime);
        const hasTriggeredToday = lastExecutedDate.isAfter(startOfToday);

        return isAllowedToTrigger && !hasTriggeredToday;
    }
}
