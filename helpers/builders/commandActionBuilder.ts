import { CommandHandler } from '../../types/handlers';
import { CommandCondition } from '../../types/commandCondition';
import { Seconds } from '../../types/timeValues';
import { CommandAction } from '../../entities/actions/commandAction';
import { ActionStateBase } from '../../entities/states/actionStateBase';
import { IActionState } from '../../types/actionState';
import { toArray } from '../toArray';
import { Noop } from '../noop';
import { CommandTrigger } from '../../types/commandTrigger';
import { Cooldown, CooldownInfo } from '../../dtos/cooldownInfo';
import { ActionPermissionsData } from '../../dtos/actionPermissionsData';

/**
 * Builder for `CommandAction` with state represented by `TActionState`
 */
export class CommandActionBuilderWithState<TActionState extends IActionState> {
    private readonly name: string;
    private trigger: CommandTrigger | CommandTrigger[] = [];

    private active = true;
    private cooldownSettings = new CooldownInfo({ seconds: 0 as Seconds });
    private blacklist: number[] = [];
    private whitelist: number[] = [];
    private allowedUsers: number[] = [];
    private readmeFactory: (botName: string) => string = Noop.emptyString;
    private readonly stateConstructor: () => TActionState;
    private handler: CommandHandler<TActionState> = Noop.call;
    private condition: CommandCondition<TActionState> = Noop.true;
    private maxAllowedSimultaniousExecutions: number = 0;

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

    /**
     * Sets chats whitelist for this action.
     * @param chatIds Chats ids to allow.
     */
    in(chatIds: number[]) {
        this.whitelist = chatIds;

        return this;
    }

    /**
     * Sets chats blacklist for this action.
     * @param chatIds Chats ids to ignore.
     */
    notIn(chatIds: number[]) {
        this.blacklist = chatIds;

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

    /**
     * Sets factory method for readme (shown on /help) for this action.
     * @param readmeFactory readme factory
     */
    withHelp(readmeFactory: (botName: string) => string) {
        this.readmeFactory = readmeFactory;

        return this;
    }

    /** If called during building, action is marked as disabled and never checked. */
    disabled() {
        this.active = false;

        return this;
    }

    /** Sets maximum number of simultaniously executing handlers for this command per chat. 0 is treated as unlimited. */
    withRatelimit(maxAllowedSimultaniousExecutions: number) {
        this.maxAllowedSimultaniousExecutions =
            maxAllowedSimultaniousExecutions;

        return this;
    }

    /** Sets action cooldown settings.
     * @param cooldownSettings Settings.
     */
    withCooldown(cooldownSettings: { cooldown: Cooldown; message?: string }) {
        this.cooldownSettings = new CooldownInfo(
            cooldownSettings.cooldown,
            cooldownSettings.message
        );

        return this;
    }

    /** Builds action */
    build() {
        return new CommandAction(
            this.trigger,
            this.handler,
            this.name,
            this.active,
            this.cooldownSettings,
            new ActionPermissionsData(
                this.allowedUsers,
                this.whitelist,
                this.blacklist
            ),
            this.maxAllowedSimultaniousExecutions,
            this.condition,
            this.stateConstructor,
            this.readmeFactory
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
