import { ScheduledAction } from '../../entities/actions/scheduledAction';
import { CachedStateFactory } from '../../entities/cachedStateFactory';
import { ActionStateBase } from '../../entities/states/actionStateBase';
import { IActionState } from '../../types/actionState';
import { ScheduledHandler } from '../../types/handlers';
import { Hours, HoursOfDay } from '../../types/timeValues';
import { Noop } from '../noop';

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

    constructor(name: string, stateConstructor: () => TActionState) {
        this.name = name;
        this.stateConstructor = stateConstructor;
    }

    allowIn(chatId: number) {
        this.whitelist.push(chatId);

        return this;
    }

    runAt(time: HoursOfDay) {
        this.time = time;

        return this;
    }

    do(handler: ScheduledHandler<TActionState>) {
        this.handler = handler;

        return this;
    }

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

    disabled() {
        this.active = false;

        return this;
    }

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

export class ScheduledActionBuilder extends ScheduledActionBuilderWithState<ActionStateBase> {
    constructor(name: string) {
        super(name, () => new ActionStateBase());
    }
}
