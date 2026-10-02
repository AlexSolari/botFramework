import { Noop } from '../../helpers/noop';
import { IActionState } from '../../types/actionState';
import { CommandTrigger } from '../../types/commandTrigger';
import { ActionKey, IAction } from '../../types/action';
import { ReplyContextInternal } from '../context/replyContext';
import { BotEventType } from '../../types/events';
import { matchTriggers } from '../../helpers/matchTriggers';

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

        const matchResults = matchTriggers(
            this.triggers,
            ctx.messageInfo.text,
            ctx.messageInfo.type
        );
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
}
