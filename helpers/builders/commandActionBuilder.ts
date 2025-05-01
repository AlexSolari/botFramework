import { CommandHandler } from '../../types/handlers';
import { CommandCondition } from '../../types/commandCondition';
import { Seconds } from '../../types/timeValues';
import { CommandAction } from '../../entities/actions/commandAction';
import { ActionStateBase } from '../../entities/states/actionStateBase';
import { IActionState } from '../../types/actionState';
import { toArray } from '../toArray';
import { Noop } from '../noop';
import { CommandTrigger } from '../../types/commandTrigger';

/**
 * Builder for `CommandAction` with state represented by `TActionState`
 */
export class CommandActionBuilderWithState<TActionState extends IActionState> {
    name: string;
    trigger: CommandTrigger | CommandTrigger[] = [];

    active = true;
    cooldownSeconds: Seconds = 0 as Seconds;
    blacklist: number[] = [];
    allowedUsers: number[] = [];
    stateConstructor: () => TActionState;
    handler: CommandHandler<TActionState> = Noop.call;
    condition: CommandCondition<TActionState> = Noop.true;

    /**
     * Builder for `CommandAction` with state represented by `TActionState`
     * @param name Action name, will be used for logging and storage
     * @param stateConstructor Function that creates default state object
     */
    constructor(name: string, stateConstructor: () => TActionState) {
        this.name = name;
        this.stateConstructor = stateConstructor;
    }

    /**
     * Defines action trigger
     * @param trigger If `string` or `string[]` is provided, will be triggered only on exact message match.
     *
     * If `RegExp` or `RegExp[]` is provided, will be triggered on successful match.
     */
    on(trigger: CommandTrigger | CommandTrigger[]) {
        this.trigger = trigger;

        return this;
    }

    /** Defines id (or ids) of users that are allowed to trigger this action.
     * @param id User id or ids
     */
    from(id: number | number[]) {
        this.allowedUsers = toArray(id);

        return this;
    }

    /** Defines action logic itself, will be executed on trigger.
     * @param handler Callback that will be called on trigger
     */
    do(handler: CommandHandler<TActionState>) {
        this.handler = handler;

        return this;
    }

    /** Defines condition that will be checked before trigger match check is executed.
     * @param condition Condition check predicate
     */
    when(condition: CommandCondition<TActionState>) {
        this.condition = condition;

        return this;
    }

    /** If called during building, action is marked as disabled and never checked. */
    disabled() {
        this.active = false;

        return this;
    }

    /** Sets action cooldown.
     * @param seconds Cooldown in seconds.
     */
    cooldown(seconds: Seconds) {
        this.cooldownSeconds = seconds;

        return this;
    }

    /**
     * Adds a chat to ignore list for this action.
     * @param chatId Chat id to ignore.
     */
    ignoreChat(chatId: number) {
        this.blacklist.push(chatId);

        return this;
    }

    /** Builds action */
    build() {
        return new CommandAction(
            this.trigger,
            this.handler,
            this.name,
            this.active,
            this.cooldownSeconds,
            this.blacklist,
            this.allowedUsers,
            this.condition,
            this.stateConstructor
        );
    }
}

/**
 * Builder for `CommandAction` with state represented by default state (containing only last execution date).
 */
export class CommandActionBuilder extends CommandActionBuilderWithState<ActionStateBase> {
    /**
     * Builder for `CommandAction` with state represented by default state (containing only last execution date).
     */
    constructor(name: string) {
        super(name, () => new ActionStateBase());
    }
}
