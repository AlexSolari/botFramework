import { CommandTriggerCheckResult } from '../../dtos/commandTriggerCheckResult';
import { Noop } from '../../helpers/noop';
import { IActionState } from '../../types/actionState';
import { CommandTrigger } from '../../types/commandTrigger';
import { ActionKey, IAction } from '../../types/action';
import { ReplyContextInternal } from '../context/replyContext';
import { BotEventType } from '../../types/events';

export class ReplyCaptureAction<
    TParentActionState extends IActionState
> implements IAction {
    readonly parentMessageId: number;
    readonly key: ActionKey;
    readonly handler: (
        replyContext: ReplyContextInternal<TParentActionState>
    ) => Promise<void>;
    readonly triggers: CommandTrigger[];
    readonly abortController: AbortController;

    constructor(
        parentMessageId: number,
        parentAction: IAction,
        handler: (
            replyContext: ReplyContextInternal<TParentActionState>
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

    async exec(ctx: ReplyContextInternal<TParentActionState>) {
        const { shouldExecute, matchResults } = this.triggers
            .map((x) => this.checkIfShouldBeExecuted(ctx, x))
            .reduce(
                (acc, curr) => acc.mergeWith(curr),
                CommandTriggerCheckResult.DoNotTrigger('Other')
            );

        if (!shouldExecute) return Noop.NoResponse;

        ctx.eventEmitter.emit(BotEventType.replyActionExecuting, {
            action: this,
            ctx,
            traceId: ctx.traceId
        });
        ctx.matchResults = matchResults;

        await this.handler(ctx);

        ctx.eventEmitter.emit(BotEventType.replyActionExecuted, {
            action: this,
            ctx,
            traceId: ctx.traceId
        });
        return ctx.responses;
    }

    private checkIfShouldBeExecuted(
        ctx: ReplyContextInternal<TParentActionState>,
        trigger: CommandTrigger
    ) {
        if (ctx.replyMessageId != this.parentMessageId)
            return CommandTriggerCheckResult.DoNotTrigger(
                'TriggerNotSatisfied'
            );

        if (trigger == ctx.messageInfo.type)
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
