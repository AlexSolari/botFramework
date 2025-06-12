import moment from 'moment';
import { CommandHandler } from '../../types/handlers';
import { CommandCondition } from '../../types/commandCondition';
import { Seconds } from '../../types/timeValues';
import { secondsToMilliseconds } from '../../helpers/timeConvertions';
import { toArray } from '../../helpers/toArray';
import { IActionState } from '../../types/actionState';
import { IActionWithState, ActionKey } from '../../types/statefulAction';
import { CommandTriggerCheckResult } from '../../dtos/commandTriggerCheckResult';
import { MessageContext } from '../context/messageContext';
import { CommandTrigger } from '../../types/commandTrigger';
import { Noop } from '../../helpers/noop';

export class CommandAction<TActionState extends IActionState>
    implements IActionWithState<TActionState>
{
    readonly triggers: CommandTrigger[];
    readonly handler: CommandHandler<TActionState>;
    readonly name: string;
    readonly cooldownInSeconds: Seconds;
    readonly active: boolean;
    readonly chatsBlacklist: number[];
    readonly allowedUsers: number[];
    readonly condition: CommandCondition<TActionState>;
    readonly stateConstructor: () => TActionState;
    readonly key: ActionKey;
    readonly readmeFactory: (botName: string) => string;

    constructor(
        trigger: CommandTrigger | CommandTrigger[],
        handler: CommandHandler<TActionState>,
        name: string,
        active: boolean,
        cooldown: Seconds,
        chatsBlacklist: number[],
        allowedUsers: number[],
        condition: CommandCondition<TActionState>,
        stateConstructor: () => TActionState,
        readmeFactory: (botName: string) => string
    ) {
        this.triggers = toArray(trigger);
        this.handler = handler;
        this.name = name;
        this.cooldownInSeconds = cooldown;
        this.active = active;
        this.chatsBlacklist = chatsBlacklist;
        this.allowedUsers = allowedUsers;
        this.condition = condition;
        this.stateConstructor = stateConstructor;
        this.readmeFactory = readmeFactory;

        this.key = `command:${this.name.replace('.', '-')}` as ActionKey;
    }

    async exec(ctx: MessageContext<TActionState>) {
        if (!ctx.isInitialized)
            throw new Error(
                `Context for ${this.key} is not initialized or already consumed`
            );

        if (!this.active || this.chatsBlacklist.includes(ctx.chatInfo.id))
            return Noop.NoResponse;

        const state = await ctx.storage.getActionState<TActionState>(
            this,
            ctx.chatInfo.id
        );

        const { shouldExecute, matchResults, skipCooldown } = this.triggers
            .map((x) => this.checkIfShouldBeExecuted(ctx, x, state))
            .reduce(
                (acc, curr) => acc.mergeWith(curr),
                CommandTriggerCheckResult.DoNotTrigger
            );

        if (!shouldExecute) return Noop.NoResponse;

        ctx.logger.logWithTraceId(
            ctx.botName,
            ctx.traceId,
            ctx.chatInfo.name,
            ` - Executing [${this.name}] in ${ctx.chatInfo.id}`
        );
        ctx.matchResults = matchResults;

        await this.handler(ctx, state);

        if (skipCooldown) {
            ctx.startCooldown = false;
        }

        if (ctx.startCooldown) {
            state.lastExecutedDate = moment().valueOf();
        }

        await ctx.storage.saveActionExecutionResult(
            this,
            ctx.chatInfo.id,
            state
        );

        return ctx.responses;
    }

    private checkIfShouldBeExecuted(
        ctx: MessageContext<TActionState>,
        trigger: CommandTrigger,
        state: IActionState
    ) {
        if (!ctx.fromUserId)
            return CommandTriggerCheckResult.DontTriggerAndSkipCooldown;

        const isUserAllowed =
            this.allowedUsers.length == 0 ||
            this.allowedUsers.includes(ctx.fromUserId);

        if (!isUserAllowed)
            return CommandTriggerCheckResult.DontTriggerAndSkipCooldown;

        const lastExecutedDate = moment(state.lastExecutedDate);
        const cooldownInMilliseconds = secondsToMilliseconds(
            this.cooldownInSeconds
        );
        const onCooldown =
            moment().diff(lastExecutedDate) < cooldownInMilliseconds;

        if (onCooldown) return CommandTriggerCheckResult.DoNotTrigger;

        const isCustomConditionMet = this.condition(ctx);
        if (!isCustomConditionMet)
            return CommandTriggerCheckResult.DontTriggerAndSkipCooldown;

        const { shouldTrigger, matchResults } = this.checkTrigger(ctx, trigger);

        return new CommandTriggerCheckResult(
            shouldTrigger,
            matchResults,
            false
        );
    }

    private checkTrigger(
        ctx: MessageContext<TActionState>,
        trigger: CommandTrigger
    ) {
        if (trigger == ctx.messageType)
            return { shouldTrigger: true, matchResults: [] };

        if (typeof trigger == 'string')
            return {
                shouldTrigger: ctx.messageText.toLowerCase() == trigger,
                matchResults: []
            };

        const matchResults: RegExpExecArray[] = [];

        trigger.lastIndex = 0;

        const execResult = trigger.exec(ctx.messageText);
        if (execResult != null) {
            matchResults.push(execResult);

            if (trigger.global) {
                while (true) {
                    const nextResult = trigger.exec(ctx.messageText);
                    if (nextResult == null) break;
                    matchResults.push(nextResult);
                }
            }
        }

        return {
            shouldTrigger: matchResults.length > 0,
            matchResults
        };
    }
}
