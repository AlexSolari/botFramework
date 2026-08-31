import { Noop } from '../../helpers/noop';
import { IActionState } from '../../types/actionState';
import { CommandTrigger } from '../../types/commandTrigger';
import { ActionKey, IAction } from '../../types/action';
import { ReplyContextInternal } from '../context/replyContext';
import { BotEventType } from '../../types/events';
import { REGEX_MATCH_LIMIT } from '../../helpers/constants';

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

        this.key = `capture:${parentAction.key}` as ActionKey;
    }

    async exec(ctx: ReplyContextInternal<TParentActionState>) {
        if (!this.isReplyToParentMessage(ctx)) return Noop.NoResponse;

        const matchResults = this.checkTriggers(ctx);
        if (matchResults == null) return Noop.NoResponse;

        return await this.executeHandler(ctx, matchResults);
    }

    private async executeHandler(
        ctx: ReplyContextInternal<TParentActionState>,
        matchResults: RegExpExecArray[]
    ) {
        ctx.observability.eventEmitter.emit(BotEventType.replyActionExecuting, {
            action: this,
            ctx,
            traceId: ctx.observability.traceId
        });
        ctx.matchResults = matchResults;

        await this.handler(ctx);

        ctx.observability.eventEmitter.emit(BotEventType.replyActionExecuted, {
            action: this,
            ctx,
            traceId: ctx.observability.traceId
        });

        return ctx.responses;
    }

    private isReplyToParentMessage(
        ctx: ReplyContextInternal<TParentActionState>
    ) {
        return ctx.replyMessageId == this.parentMessageId;
    }

    private checkTriggers(ctx: ReplyContextInternal<TParentActionState>) {
        let matched = false;
        const matchResults: RegExpExecArray[] = [];

        for (const trigger of this.triggers) {
            if (trigger == ctx.messageInfo.type) {
                matched = true;
                continue;
            }

            if (typeof trigger == 'string') {
                if (ctx.messageInfo.text.toLowerCase() == trigger.toLowerCase())
                    matched = true;

                continue;
            }

            trigger.lastIndex = 0;

            const execResult = trigger.exec(ctx.messageInfo.text);
            if (execResult != null) {
                matched = true;
                let regexMatchLimit = REGEX_MATCH_LIMIT;
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
        }

        return matched ? matchResults : null;
    }
}
