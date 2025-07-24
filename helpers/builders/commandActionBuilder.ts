import { CommandHandler } from '../../types/handlers';
import { CommandCondition } from '../../types/commandCondition';
import { Seconds } from '../../types/timeValues';
import { CommandAction } from '../../entities/actions/commandAction';
import { ActionStateBase } from '../../entities/states/actionStateBase';
import { IActionState } from '../../types/actionState';
import { toArray } from '../toArray';
import { Noop } from '../noop';
import { CommandTrigger } from '../../types/commandTrigger';
import { CooldownInfo } from '../../dtos/cooldownInfo';
import { CommandActionPropertyProvider } from '../../types/propertyProvider';

/**
 * Builder for `CommandAction` with state represented by `TActionState`
 */
export class CommandActionBuilderWithState<TActionState extends IActionState> {
    private readonly name: string;
    private trigger: CommandTrigger | CommandTrigger[] = [];

    private activeProvider: CommandActionPropertyProvider<boolean> = () => true;
    private cooldownSettingsProvider: CommandActionPropertyProvider<CooldownInfo> =
        () => new CooldownInfo(0 as Seconds);
    private blacklistProvider: CommandActionPropertyProvider<number[]> =
        () => [];
    private whitelistProvider: CommandActionPropertyProvider<number[]> =
        () => [];
    private allowedUsersProvider: CommandActionPropertyProvider<number[]> =
        () => [];

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
        const ids = toArray(id);
        this.allowedUsersProvider = () => ids;

        return this;
    }

    /**
     * Sets chats whitelist for this action.
     * @param chatIds Chats ids to allow.
     */
    in(chatIds: number[]) {
        this.whitelistProvider = () => chatIds;

        return this;
    }

    /**
     * Sets chats blacklist for this action.
     * @param chatIds Chats ids to ignore.
     */
    notIn(chatIds: number[]) {
        this.blacklistProvider = () => chatIds;

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
        this.activeProvider = () => false;

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
    withCooldown(cooldownSettings: { cooldown: Seconds; message?: string }) {
        const settings = new CooldownInfo(
            cooldownSettings.cooldown,
            cooldownSettings.message
        );
        this.cooldownSettingsProvider = () => settings;

        return this;
    }

    /**
     * Configures action to use property value providers instead of static value to allow changes in runtime
     */
    withConfiguration(configuration: {
        cooldownProvider?: CommandActionPropertyProvider<CooldownInfo>;
        isActiveProvider?: CommandActionPropertyProvider<boolean>;
        chatsBlacklistProvider?: CommandActionPropertyProvider<number[]>;
        chatsWhitelistProvider?: CommandActionPropertyProvider<number[]>;
        usersWhitelistProvider?: CommandActionPropertyProvider<number[]>;
    }) {
        if (configuration.cooldownProvider)
            this.cooldownSettingsProvider = configuration.cooldownProvider;

        if (configuration.chatsWhitelistProvider)
            this.whitelistProvider = configuration.chatsWhitelistProvider;

        if (configuration.chatsBlacklistProvider)
            this.blacklistProvider = configuration.chatsBlacklistProvider;

        if (configuration.usersWhitelistProvider)
            this.allowedUsersProvider = configuration.usersWhitelistProvider;

        if (configuration.isActiveProvider)
            this.activeProvider = configuration.isActiveProvider;

        return this;
    }

    /** Builds action */
    build() {
        return new CommandAction(
            this.trigger,
            this.handler,
            this.name,
            {
                cooldownProvider: this.cooldownSettingsProvider,
                isActiveProvider: this.activeProvider,
                chatsBlacklistProvider: this.blacklistProvider,
                chatsWhitelistProvider: this.whitelistProvider,
                usersWhitelistProvider: this.allowedUsersProvider
            },
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
