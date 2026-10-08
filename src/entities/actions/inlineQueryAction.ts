import { Noop } from '../../helpers/noop';
import { ActionKey, IExecutableAction } from '../../types/action';
import { InlineQueryContextInternal } from '../context/inlineQueryContext';
import { InlineQueryHandler } from '../../types/handlers';
import { InlineActionPropertyProvider } from '../../types/propertyProvider';
import { BotEventType } from '../../types/events';
import { InlineQueryResponse } from '../../dtos/responses/inlineQueryResponse';
import { getMatchResults } from '../../helpers/matchTriggers';

export type InlineQueryAction = Omit<InlineQueryActionInternal, 'exec'>;

export class InlineQueryActionInternal implements IExecutableAction {
    readonly key: ActionKey;
    readonly isActiveProvider: InlineActionPropertyProvider<boolean>;
    readonly handler: InlineQueryHandler;
    readonly name: string;
    readonly pattern: RegExp;

    constructor(
        handler: InlineQueryHandler,
        name: string,
        activeProvider: InlineActionPropertyProvider<boolean>,
        pattern: RegExp
    ) {
        this.handler = handler;
        this.name = name;
        this.isActiveProvider = activeProvider;
        this.pattern = pattern;

        this.key = `inline:${this.name.replace('.', '-')}` as ActionKey;
    }

    async exec(ctx: InlineQueryContextInternal) {
        if (!this.isActiveProvider(ctx)) return Noop.NoResponse;

        ctx.matchResults = getMatchResults([this.pattern], ctx.queryText);

        if (ctx.matchResults.length == 0) return Noop.NoResponse;

        ctx.observability.eventEmitter.emit(
            BotEventType.inlineActionExecuting,
            {
                action: this,
                ctx,
                traceId: ctx.observability.traceId
            }
        );
        try {
            await this.handler(ctx);

            return [
                new InlineQueryResponse(
                    ctx.queryResults,
                    ctx.queryId,
                    ctx.observability.traceId,
                    ctx.action
                )
            ];
        } finally {
            ctx.observability.eventEmitter.emit(
                BotEventType.inlineActionExecuted,
                {
                    action: this,
                    ctx,
                    traceId: ctx.observability.traceId
                }
            );
        }
    }
}
