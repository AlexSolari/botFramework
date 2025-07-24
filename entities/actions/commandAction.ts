import moment from 'moment';
import { CommandHandler } from '../../types/handlers';
import { CommandCondition } from '../../types/commandCondition';
import { secondsToMilliseconds } from '../../helpers/timeConvertions';
import { toArray } from '../../helpers/toArray';
import { IActionState } from '../../types/actionState';
import { IActionWithState, ActionKey } from '../../types/action';
import { CommandTriggerCheckResult } from '../../dtos/commandTriggerCheckResult';
import { MessageContextInternal } from '../context/messageContext';
import { CommandTrigger } from '../../types/commandTrigger';
import { Noop } from '../../helpers/noop';
import { MessageType } from '../../types/messageTypes';
import { Sema as Semaphore } from 'async-sema';
import { getOrSetIfNotExists } from '../../helpers/mapUtils';
import { CooldownInfo } from '../../dtos/cooldownInfo';
import { TextMessage } from '../../dtos/responses/textMessage';
import { ReplyInfo } from '../../dtos/replyInfo';
import { Seconds } from '../../types/timeValues';
import { CommandActionPropertyProvider } from '../../types/propertyProvider';
import { CommandActionProviders } from '../../dtos/propertyProviderSets';
import { BotResponse } from '../../types/response';

export class CommandAction<TActionState extends IActionState>
    implements IActionWithState<TActionState>
{
    private readonly cooldownInfoProvider: CommandActionPropertyProvider<CooldownInfo>;
    private readonly isActiveProvider: CommandActionPropertyProvider<boolean>;
    private readonly chatsBlacklistProvider: CommandActionPropertyProvider<
        number[]
    >;
    private readonly chatsWhitelistProvider: CommandActionPropertyProvider<
        number[]
    >;
    private readonly usersWhitelistProvider: CommandActionPropertyProvider<
        number[]
    >;

    readonly key: ActionKey;
    readonly name: string;
    readonly ratelimitSemaphores = new Map<number, Semaphore>();
    readonly maxAllowedSimultaniousExecutions: number;

    readonly triggers: CommandTrigger[];

    readonly handler: CommandHandler<TActionState>;
    readonly condition: CommandCondition<TActionState>;
    readonly stateConstructor: () => TActionState;
    readonly readmeFactory: (botName: string) => string;

    private lastCustomCooldown: Seconds | undefined;

    constructor(
        trigger: CommandTrigger | CommandTrigger[],
        handler: CommandHandler<TActionState>,
        name: string,
        providers: CommandActionProviders,
        maxAllowedSimultaniousExecutions: number,
        condition: CommandCondition<TActionState>,
        stateConstructor: () => TActionState,
        readmeFactory: (botName: string) => string
    ) {
        this.triggers = toArray(trigger);
        this.name = name;

        this.cooldownInfoProvider = providers.cooldownProvider;
        this.isActiveProvider = providers.isActiveProvider;
        this.chatsBlacklistProvider = providers.chatsBlacklistProvider;
        this.chatsWhitelistProvider = providers.chatsWhitelistProvider;
        this.usersWhitelistProvider = providers.usersWhitelistProvider;

        this.handler = handler;
        this.condition = condition;
        this.stateConstructor = stateConstructor;
        this.readmeFactory = readmeFactory;

        this.maxAllowedSimultaniousExecutions =
            maxAllowedSimultaniousExecutions;

        this.key = `command:${this.name.replace('.', '-')}` as ActionKey;
    }

    async exec(
        ctx: MessageContextInternal<TActionState>
    ): Promise<BotResponse[]> {
        if (!ctx.isInitialized)
            throw new Error(
                `Context for ${this.key} is not initialized or already consumed`
            );

        let lock: Semaphore | undefined;
        if (this.maxAllowedSimultaniousExecutions != 0) {
            lock = getOrSetIfNotExists(
                this.ratelimitSemaphores,
                ctx.chatInfo.id,
                new Semaphore(this.maxAllowedSimultaniousExecutions)
            );

            await lock.acquire();
        }

        try {
            const state = await ctx.storage.getActionState<TActionState>(
                this,
                ctx.chatInfo.id
            );

            const { shouldExecute, matchResults, skipCooldown, reason } =
                this.triggers
                    .map((x) => this.checkIfShouldBeExecuted(ctx, x, state))
                    .reduce(
                        (acc, curr) => acc.mergeWith(curr),
                        CommandTriggerCheckResult.DoNotTrigger('Other')
                    );

            if (!shouldExecute) {
                if (reason == 'OnCooldown') {
                    const cooldownMessage =
                        this.cooldownInfoProvider(ctx).message;

                    return cooldownMessage
                        ? [
                              new TextMessage(
                                  cooldownMessage,
                                  ctx.chatInfo,
                                  ctx.traceId,
                                  this,
                                  new ReplyInfo(ctx.messageInfo.id)
                              )
                          ]
                        : Noop.NoResponse;
                }

                return Noop.NoResponse;
            }

            ctx.logger.logWithTraceId(
                ` - Executing [${this.name}] in ${ctx.chatInfo.id}`
            );
            ctx.matchResults = matchResults;

            await this.handler(ctx, state);

            if (skipCooldown) {
                ctx.startCooldown = false;
            }

            if (ctx.startCooldown) {
                this.lastCustomCooldown = ctx.customCooldown;

                state.lastExecutedDate = moment().valueOf();
            }

            await ctx.storage.saveActionExecutionResult(
                this,
                ctx.chatInfo.id,
                state
            );

            return ctx.responses;
        } finally {
            lock?.release();
        }
    }

    private checkIfShouldBeExecuted(
        ctx: MessageContextInternal<TActionState>,
        trigger: CommandTrigger,
        state: TActionState
    ) {
        if (!this.isActiveProvider(ctx))
            return CommandTriggerCheckResult.DontTriggerAndSkipCooldown(
                'ActionDisabled'
            );

        const chatsBlacklist = this.chatsBlacklistProvider(ctx);
        const chatsWhitelist = this.chatsWhitelistProvider(ctx);

        const isChatInBlacklist = chatsBlacklist.includes(ctx.chatInfo.id);
        const isChatInWhitelist =
            chatsWhitelist.length == 0 ||
            chatsWhitelist.includes(ctx.chatInfo.id);

        if (isChatInBlacklist || !isChatInWhitelist)
            return CommandTriggerCheckResult.DontTriggerAndSkipCooldown(
                'ChatForbidden'
            );

        const triggerCheckResult = this.checkTrigger(ctx, trigger);

        if (!triggerCheckResult.shouldExecute) return triggerCheckResult;

        if (!ctx.userInfo.id)
            return CommandTriggerCheckResult.DontTriggerAndSkipCooldown(
                'UserIdMissing'
            );

        const usersWhitelist = this.usersWhitelistProvider(ctx);
        const isUserAllowed =
            usersWhitelist.length == 0 ||
            usersWhitelist.includes(ctx.userInfo.id);

        if (!isUserAllowed)
            return CommandTriggerCheckResult.DontTriggerAndSkipCooldown(
                'UserForbidden'
            );

        const lastExecutedDate = moment(state.lastExecutedDate);
        const cooldownInMilliseconds = secondsToMilliseconds(
            this.lastCustomCooldown ?? this.cooldownInfoProvider(ctx).cooldown
        );
        const onCooldown =
            moment().diff(lastExecutedDate) < cooldownInMilliseconds;

        if (onCooldown)
            return CommandTriggerCheckResult.DoNotTrigger('OnCooldown');

        const isCustomConditionMet = this.condition(ctx, state);
        if (!isCustomConditionMet)
            return CommandTriggerCheckResult.DontTriggerAndSkipCooldown(
                'CustomConditionNotMet'
            );

        return triggerCheckResult;
    }

    private checkTrigger(
        ctx: MessageContextInternal<TActionState>,
        trigger: CommandTrigger
    ) {
        if (trigger == MessageType.Any || trigger == ctx.messageInfo.type)
            return CommandTriggerCheckResult.Trigger();

        if (typeof trigger == 'string')
            return ctx.messageInfo.text.toLowerCase() == trigger.toLowerCase()
                ? CommandTriggerCheckResult.Trigger()
                : CommandTriggerCheckResult.DoNotTrigger('TriggerNotSatisfied');

        const matchResults: RegExpExecArray[] = [];

        trigger.lastIndex = 0;

        const execResult = trigger.exec(ctx.messageInfo.text);
        if (execResult != null) {
            let regexMatchLimit = 100;
            matchResults.push(execResult);

            if (trigger.global) {
                while (regexMatchLimit > 0) {
                    const nextResult = trigger.exec(ctx.messageInfo.text);

                    if (nextResult == null) break;

                    matchResults.push(nextResult);
                    regexMatchLimit -= 1;
                }
            }
        }

        return new CommandTriggerCheckResult(
            matchResults.length > 0,
            matchResults,
            false
        );
    }
}
