import { CommandTriggerCheckResult } from '../../dtos/commandTriggerCheckResult';
import { Noop } from '../../helpers/noop';
import { IActionState } from '../../types/actionState';
import { CommandTrigger } from '../../types/commandTrigger';
import { ActionKey, IAction, IActionWithState } from '../../types/action';
import { ReplyContext } from '../context/replyContext';

export class ReplyCaptureAction<TParentActionState extends IActionState>
    implements IAction
{
    readonly parentMessageId: number;
    readonly key: ActionKey;
    readonly handler: (
        replyContext: ReplyContext<TParentActionState>
    ) => Promise<void>;
    readonly triggers: CommandTrigger[];
    readonly abortController: AbortController;

    constructor(
        parentMessageId: number,
        parentAction: IActionWithState<TParentActionState>,
        handler: (
            replyContext: ReplyContext<TParentActionState>
        ) => Promise<void>,
        triggers: CommandTrigger[],
        abortController: AbortController
    ) {
        this.parentMessageId = parentMessageId;
        this.handler = handler;
        this.triggers = triggers;
        this.abortController = abortController;

        this.key = `capture:${parentAction.key}:${Math.random()
            .toString()
            .replace('.', '')}` as ActionKey;
    }

    async exec(ctx: ReplyContext<TParentActionState>) {
        if (!ctx.isInitialized)
            throw new Error(
                `Context for ${this.key} is not initialized or already consumed`
            );

        const { shouldExecute, matchResults } = this.triggers
            .map((x) => this.checkIfShouldBeExecuted(ctx, x))
            .reduce(
                (acc, curr) => acc.mergeWith(curr),
                CommandTriggerCheckResult.DoNotTrigger
            );

        if (!shouldExecute) return Noop.NoResponse;

        ctx.logger.logWithTraceId(
            ctx.botName,
            ctx.traceId,
            ctx.chatInfo.name,
            ` - Executing [${this.key}] in ${ctx.chatInfo.id}`
        );
        ctx.matchResults = matchResults;

        await this.handler(ctx);

        return ctx.responses;
    }

    private checkIfShouldBeExecuted(
        ctx: ReplyContext<TParentActionState>,
        trigger: CommandTrigger
    ) {
        if (ctx.replyMessageId != this.parentMessageId)
            return CommandTriggerCheckResult.DoNotTrigger;

        if (trigger == ctx.messageType)
            return CommandTriggerCheckResult.Trigger;

        if (typeof trigger == 'string')
            if (ctx.messageText.toLowerCase() == trigger.toLowerCase())
                return CommandTriggerCheckResult.Trigger;
            else return CommandTriggerCheckResult.DoNotTrigger;

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

        return new CommandTriggerCheckResult(
            matchResults.length > 0,
            matchResults,
            false
        );
    }
}
