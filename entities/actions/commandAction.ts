import moment from 'moment';
import { CommandHandler } from '../../types/handlers';
import { CommandCondition } from '../../types/commandCondition';
import { Seconds } from '../../types/timeValues';
import { secondsToMilliseconds } from '../../helpers/timeConvertions';
import { toArray } from '../../helpers/toArray';
import { IActionState } from '../../types/actionState';
import { IActionWithState, ActionKey } from '../../types/actionWithState';
import { CommandTriggerCheckResult } from '../commandTriggerCheckResult';
import { MessageContext } from '../context/messageContext';
import { Logger } from '../../services/logger';
import { ActionExecutionResult } from '../actionExecutionResult';
import { CommandTrigger } from '../../types/commandTrigger';

export class CommandAction<TActionState extends IActionState>
    implements IActionWithState<TActionState>
{
    triggers: CommandTrigger[];
    handler: CommandHandler<TActionState>;
    name: string;
    cooldownInSeconds: Seconds;
    active: boolean;
    chatsBlacklist: number[];
    allowedUsers: number[];
    condition: CommandCondition<TActionState>;
    stateConstructor: () => TActionState;
    key: ActionKey;

    constructor(
        trigger: CommandTrigger | CommandTrigger[],
        handler: CommandHandler<TActionState>,
        name: string,
        active: boolean,
        cooldown: Seconds,
        chatsBlacklist: number[],
        allowedUsers: number[],
        condition: CommandCondition<TActionState>,
        stateConstructor: () => TActionState
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

        this.key = `command:${this.name.replace('.', '-')}` as ActionKey;
    }

    async exec(ctx: MessageContext<TActionState>) {
        if (!ctx.isInitialized)
            throw new Error(
                `Context for ${this.key} is not initialized or already consumed`
            );

        if (!this.active || this.chatsBlacklist.includes(ctx.chatId)) return [];

        const isConditionMet = await this.condition(ctx);

        if (!isConditionMet) return [];

        const state = await ctx.storage.getActionState<TActionState>(
            this,
            ctx.chatId
        );

        const { shouldTrigger, matchResults, skipCooldown } = this.triggers
            .map((x) => this.checkTrigger(ctx, x, state))
            .reduce(
                (acc, curr) => acc.mergeWith(curr),
                CommandTriggerCheckResult.DoNotTrigger
            );

        if (!shouldTrigger) return [];

        Logger.logWithTraceId(
            ctx.botName,
            ctx.traceId,
            ctx.chatName,
            ` - Executing [${this.name}] in ${ctx.chatId}`
        );
        ctx.matchResults = matchResults;

        await this.handler(ctx, state);

        if (skipCooldown) {
            ctx.startCooldown = false;
        }

        if (ctx.startCooldown) {
            state.lastExecutedDate = moment().valueOf();
        }

        ctx.updateActions.forEach((action) => action(state));

        await ctx.storage.saveActionExecutionResult(
            this,
            ctx.chatId,
            new ActionExecutionResult(state, ctx.startCooldown && shouldTrigger)
        );

        ctx.isInitialized = false;

        return ctx.responses;
    }

    private checkTrigger(
        ctx: MessageContext<TActionState>,
        trigger: CommandTrigger,
        state: IActionState
    ) {
        let shouldTrigger = false;
        const matchResults: RegExpExecArray[] = [];

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

        if (trigger == ctx.messageType) {
            shouldTrigger = true;
        } else if (typeof trigger == 'string') {
            shouldTrigger = ctx.messageText.toLowerCase() == trigger;
        } else {
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

            shouldTrigger = matchResults.length > 0;
        }

        return new CommandTriggerCheckResult(
            shouldTrigger,
            matchResults,
            false
        );
    }
}
