import { Noop } from '../../helpers/noop';
import { ActionKey, IAction } from '../../types/action';
import { InlineQueryContextInternal } from '../context/inlineQueryContext';
import { InlineQueryHandler } from '../../types/handlers';
import { InlineActionPropertyProvider } from '../../types/propertyProvider';
import { BotEventType } from '../../types/events';
import { InlineQueryResponse } from '../../dtos/responses/inlineQueryResponse';
import { REGEX_MATCH_LIMIT } from '../../helpers/constants';

export class InlineQueryAction implements IAction {
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

        const matchResults: RegExpExecArray[] = [];

        this.pattern.lastIndex = 0;

        const execResult = this.pattern.exec(ctx.queryText);
        if (execResult != null) {
            let regexMatchLimit = REGEX_MATCH_LIMIT;
            matchResults.push(execResult);

            if (this.pattern.global) {
                while (regexMatchLimit > 0) {
                    const nextResult = this.pattern.exec(ctx.queryText);

                    if (nextResult == null) break;

                    matchResults.push(nextResult);
                    regexMatchLimit -= 1;
                }
            }
        }

        if (matchResults.length == 0) return Noop.NoResponse;

        ctx.matchResults = matchResults;

        ctx.observability.eventEmitter.emit(
            BotEventType.inlineActionExecuting,
            {
                action: this,
                ctx,
                traceId: ctx.observability.traceId
            }
        );

        await this.handler(ctx);

        ctx.observability.eventEmitter.emit(BotEventType.inlineActionExecuted, {
            action: this,
            ctx,
            traceId: ctx.observability.traceId
        });
        return [
            new InlineQueryResponse(
                ctx.queryResults,
                ctx.queryId,
                ctx.observability.traceId,
                ctx.action
            )
        ];
    }
}
