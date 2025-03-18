import { ScheduledAction } from '../../entities/actions/scheduledAction';
import { CachedStateFactory } from '../../entities/cachedStateFactory';
import { ActionStateBase } from '../../entities/states/actionStateBase';
import { IActionState } from '../../types/actionState';
import { ScheduledHandler } from '../../types/handlers';
import { Hours, HoursOfDay } from '../../types/timeValues';
import { Noop } from '../noop';

/**
 * Builder for `ScheduledAction` with state represented by `TActionState`
 */
export class ScheduledActionBuilderWithState<
    TActionState extends IActionState
> {
    active = true;
    time: HoursOfDay = 0;
    cachedStateFactories = new Map<string, CachedStateFactory>();
    whitelist: number[] = [];
    stateConstructor: () => TActionState;
    handler: ScheduledHandler<TActionState> = Noop.call;

    name: string;

    /**
     * Builder for `ScheduledAction` with state represented by `TActionState`
     * @param name Action name, will be used for logging and storage
     * @param stateConstructor Function that creates default state object
     */
    constructor(name: string, stateConstructor: () => TActionState) {
        this.name = name;
        this.stateConstructor = stateConstructor;
    }

    /**
     * Adds a chat to whitelist for this action.
     * @param chatId Chat id to execute in.
     */
    allowIn(chatId: number) {
        this.whitelist.push(chatId);

        return this;
    }

    /**
     * Defines time for scheduled item execution.
     * @param time Time of day (0 - 23) to execute action.
     */
    runAt(time: HoursOfDay) {
        this.time = time;

        return this;
    }

    /** Defines action logic itself, will be executed on timer.
     * @param handler Callback that will be called on timer.
     */
    do(handler: ScheduledHandler<TActionState>) {
        this.handler = handler;

        return this;
    }

    /**
     * Defines process-wide cache, that is shared by all actions of this type (even in different bot instances).
     * Can be used for fetch request de-duping, etc.
     * @param key Key that will be used to retrieve value from cache.
     * @param itemFactory Callback that will be executed once to create cached value.
     * @param invalidationTimeoutInHours Timeout for cache invalidation.
     */
    withSharedCache(
        key: string,
        itemFactory: () => Promise<unknown>,
        invalidationTimeoutInHours: Hours = 20 as Hours
    ) {
        this.cachedStateFactories.set(
            key,
            new CachedStateFactory(itemFactory, invalidationTimeoutInHours)
        );

        return this;
    }

    /** If called during building, action is marked as disabled and never checked. */
    disabled() {
        this.active = false;

        return this;
    }

    /** Builds action */
    build() {
        return new ScheduledAction<TActionState>(
            this.name,
            this.handler,
            this.time,
            this.active,
            this.whitelist,
            this.cachedStateFactories,
            this.stateConstructor
        );
    }
}

/**
 * Builder for `ScheduledAction` with state represented by default state (containing only last execution date).
 */
export class ScheduledActionBuilder extends ScheduledActionBuilderWithState<ActionStateBase> {
    /**
     * Builder for `ScheduledAction` with state represented by default state (containing only last execution date).
     */
    constructor(name: string) {
        super(name, () => new ActionStateBase());
    }
}
