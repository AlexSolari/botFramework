import { Noop } from '../../helpers/noop';
import { IActionState } from '../../types/actionState';
import { CommandTrigger } from '../../types/commandTrigger';
import { ActionKey, IAction, IExecutableAction } from '../../types/action';
import { ReplyContextInternal } from '../context/replyContext';
import { BotEventType } from '../../types/events';
import { getMatchResults } from '../../helpers/matchTriggers';

export type ReplyCaptureAction<TParentActionState extends IActionState> =
    Omit<ReplyCaptureActionInternal<TParentActionState>, 'exec'>;

export class ReplyCaptureActionInternal<
    TParentActionState extends IActionState
> implements IExecutableAction {
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
        if (this.abortController.signal.aborted) return Noop.NoResponse;

        return await this.executeHandler(
            ctx,
            getMatchResults(this.triggers, ctx.messageInfo.text)
        );
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

    tracksMessage(messageId: number | undefined) {
        return messageId == this.parentMessageId;
    }
}
